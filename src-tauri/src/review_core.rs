//! Database logic for the review workflow (screening, search log, citation metadata).
//! Kept free of any Tauri types so it can be unit-tested on its own; the thin
//! `#[tauri::command]` wrappers live in `commands/review.rs`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ScreeningDecision {
    pub collection_id: String,
    pub paper_id: String,
    pub stage: String,
    pub decision: String,
    pub reason: Option<String>,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SearchLogEntry {
    pub id: String,
    pub query: String,
    pub filters_json: Option<String>,
    pub found: i64,
    pub unique_count: i64,
    pub ran_at: String,
    pub saved: bool,
    pub name: Option<String>,
    pub collection_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PaperMeta {
    pub paper_id: String,
    pub cited_by_count: Option<i64>,
    pub referenced_json: Option<String>,
    pub updated_at: String,
}

fn e(err: rusqlite::Error) -> String {
    err.to_string()
}

// ----- screening -------------------------------------------------------------

/// `decision` is "include", "exclude" or "maybe". An empty decision clears the paper's
/// decision for that stage (back to "not screened yet").
pub fn set_screening(
    conn: &Connection,
    collection_id: &str,
    paper_id: &str,
    stage: &str,
    decision: &str,
    reason: Option<&str>,
) -> Result<(), String> {
    if stage != "title_abstract" && stage != "full_text" {
        return Err(format!("Unknown screening stage: {}", stage));
    }
    if decision.is_empty() {
        conn.execute(
            "DELETE FROM screening WHERE collection_id = ?1 AND paper_id = ?2 AND stage = ?3",
            params![collection_id, paper_id, stage],
        )
        .map_err(e)?;
        return Ok(());
    }
    if !matches!(decision, "include" | "exclude" | "maybe") {
        return Err(format!("Unknown screening decision: {}", decision));
    }
    let reason = reason.map(|r| r.trim()).filter(|r| !r.is_empty());
    conn.execute(
        "INSERT INTO screening (collection_id, paper_id, stage, decision, reason, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(collection_id, paper_id, stage)
         DO UPDATE SET decision = excluded.decision, reason = excluded.reason, updated_at = datetime('now')",
        params![collection_id, paper_id, stage, decision, reason],
    )
    .map_err(e)?;
    Ok(())
}

pub fn get_screening(conn: &Connection, collection_id: &str) -> Result<Vec<ScreeningDecision>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT collection_id, paper_id, stage, decision, reason, updated_at
             FROM screening WHERE collection_id = ?1 ORDER BY updated_at, paper_id, stage",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map(params![collection_id], |row| {
            Ok(ScreeningDecision {
                collection_id: row.get(0)?,
                paper_id: row.get(1)?,
                stage: row.get(2)?,
                decision: row.get(3)?,
                reason: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(e)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(e)?);
    }
    Ok(out)
}

// ----- search log / saved searches ---------------------------------------------

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchLogEntry> {
    Ok(SearchLogEntry {
        id: row.get(0)?,
        query: row.get(1)?,
        filters_json: row.get(2)?,
        found: row.get(3)?,
        unique_count: row.get(4)?,
        ran_at: row.get(5)?,
        saved: row.get::<_, i64>(6)? != 0,
        name: row.get(7)?,
        collection_id: row.get(8)?,
    })
}

const ENTRY_COLS: &str = "id, query, filters_json, found, unique_count, ran_at, saved, name, collection_id";

pub fn log_search(
    conn: &Connection,
    query: &str,
    filters_json: Option<&str>,
    found: i64,
    unique_count: i64,
    collection_id: Option<&str>,
) -> Result<SearchLogEntry, String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO search_log (id, query, filters_json, found, unique_count, collection_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, query, filters_json, found, unique_count, collection_id],
    )
    .map_err(e)?;
    conn.query_row(
        &format!("SELECT {} FROM search_log WHERE id = ?1", ENTRY_COLS),
        params![id],
        row_to_entry,
    )
    .map_err(e)
}

pub fn get_search_log(conn: &Connection, limit: i64) -> Result<Vec<SearchLogEntry>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM search_log ORDER BY ran_at DESC, rowid DESC LIMIT ?1",
            ENTRY_COLS
        ))
        .map_err(e)?;
    let rows = stmt.query_map(params![limit], row_to_entry).map_err(e)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(e)?);
    }
    Ok(out)
}

pub fn update_search(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    saved: bool,
    collection_id: Option<&str>,
) -> Result<(), String> {
    let name = name.map(|n| n.trim()).filter(|n| !n.is_empty());
    conn.execute(
        "UPDATE search_log SET name = ?1, saved = ?2, collection_id = ?3 WHERE id = ?4",
        params![name, saved as i64, collection_id, id],
    )
    .map_err(e)?;
    Ok(())
}

/// Set the totals of an existing log entry (used when "load more" adds another page of results).
pub fn update_search_counts(conn: &Connection, id: &str, found: i64, unique_count: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE search_log SET found = ?1, unique_count = ?2 WHERE id = ?3",
        params![found, unique_count, id],
    )
    .map_err(e)?;
    Ok(())
}

pub fn delete_search(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM search_log WHERE id = ?1", params![id])
        .map_err(e)?;
    Ok(())
}

// ----- citation metadata ---------------------------------------------------------

pub fn set_paper_meta(
    conn: &Connection,
    paper_id: &str,
    cited_by_count: Option<i64>,
    referenced_json: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO paper_meta (paper_id, cited_by_count, referenced_json, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(paper_id)
         DO UPDATE SET cited_by_count = COALESCE(excluded.cited_by_count, paper_meta.cited_by_count),
                       referenced_json = COALESCE(excluded.referenced_json, paper_meta.referenced_json),
                       updated_at = datetime('now')",
        params![paper_id, cited_by_count, referenced_json],
    )
    .map_err(e)?;
    Ok(())
}

pub fn get_paper_metas(conn: &Connection) -> Result<Vec<PaperMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT paper_id, cited_by_count, referenced_json, updated_at FROM paper_meta")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PaperMeta {
                paper_id: row.get(0)?,
                cited_by_count: row.get(1)?,
                referenced_json: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(e)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(e)?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("db/migrations.sql")).unwrap();
        // calling the migrations twice must be harmless (they run on every start)
        conn.execute_batch(include_str!("db/migrations.sql")).unwrap();
        conn.execute("INSERT INTO collections (id, name) VALUES ('c1','Review')", []).unwrap();
        conn.execute("INSERT INTO papers (id, title) VALUES ('p1','A')", []).unwrap();
        conn.execute("INSERT INTO papers (id, title) VALUES ('p2','B')", []).unwrap();
        conn
    }

    #[test]
    fn screening_set_update_clear() {
        let c = db();
        set_screening(&c, "c1", "p1", "title_abstract", "include", None).unwrap();
        set_screening(&c, "c1", "p2", "title_abstract", "exclude", Some("  wrong population ")).unwrap();
        set_screening(&c, "c1", "p1", "full_text", "maybe", Some("")).unwrap();
        let all = get_screening(&c, "c1").unwrap();
        assert_eq!(all.len(), 3);
        let p2 = all.iter().find(|d| d.paper_id == "p2").unwrap();
        assert_eq!(p2.reason.as_deref(), Some("wrong population"));
        // changing a decision updates in place instead of adding a row
        set_screening(&c, "c1", "p1", "title_abstract", "exclude", Some("duplicate")).unwrap();
        assert_eq!(get_screening(&c, "c1").unwrap().len(), 3);
        let p1 = get_screening(&c, "c1").unwrap().into_iter().find(|d| d.paper_id == "p1" && d.stage == "title_abstract").unwrap();
        assert_eq!((p1.decision.as_str(), p1.reason.as_deref()), ("exclude", Some("duplicate")));
        // empty decision clears
        set_screening(&c, "c1", "p1", "title_abstract", "", None).unwrap();
        assert_eq!(get_screening(&c, "c1").unwrap().len(), 2);
        // bad input is rejected, not stored
        assert!(set_screening(&c, "c1", "p1", "abstract", "include", None).is_err());
        assert!(set_screening(&c, "c1", "p1", "full_text", "yes", None).is_err());
        assert_eq!(get_screening(&c, "c1").unwrap().len(), 2);
    }

    #[test]
    fn screening_cascades_when_paper_removed() {
        let c = db();
        set_screening(&c, "c1", "p1", "title_abstract", "include", None).unwrap();
        c.execute("DELETE FROM papers WHERE id = 'p1'", []).unwrap();
        assert!(get_screening(&c, "c1").unwrap().is_empty());
    }

    #[test]
    fn search_log_roundtrip() {
        let c = db();
        let a = log_search(&c, "deep learning", Some("{\"year\":2020}"), 40, 36, Some("c1")).unwrap();
        assert_eq!((a.found, a.unique_count, a.saved), (40, 36, false));
        let b = log_search(&c, "graph neural", None, 20, 20, None).unwrap();
        let log = get_search_log(&c, 50).unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].id, b.id); // newest first
        update_search(&c, &a.id, Some(" My DL search "), true, Some("c1")).unwrap();
        let log = get_search_log(&c, 50).unwrap();
        let a2 = log.iter().find(|x| x.id == a.id).unwrap();
        assert_eq!((a2.saved, a2.name.as_deref()), (true, Some("My DL search")));
        // deleting a collection keeps the log entry but unlinks it
        c.execute("DELETE FROM collections WHERE id = 'c1'", []).unwrap();
        let a3 = get_search_log(&c, 50).unwrap().into_iter().find(|x| x.id == a.id).unwrap();
        assert_eq!(a3.collection_id, None);
        update_search_counts(&c, &b.id, 40, 31).unwrap();
        let b2 = get_search_log(&c, 50).unwrap().into_iter().find(|x| x.id == b.id).unwrap();
        assert_eq!((b2.found, b2.unique_count), (40, 31));
        delete_search(&c, &a.id).unwrap();
        assert_eq!(get_search_log(&c, 50).unwrap().len(), 1);
        assert_eq!(get_search_log(&c, 0).unwrap().len(), 0);
    }

    #[test]
    fn paper_meta_upsert_keeps_existing_values() {
        let c = db();
        set_paper_meta(&c, "p1", Some(120), Some("[\"https://openalex.org/W1\"]")).unwrap();
        // a later update that only knows the count must not wipe the references
        set_paper_meta(&c, "p1", Some(150), None).unwrap();
        let m = get_paper_metas(&c).unwrap();
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].cited_by_count, Some(150));
        assert_eq!(m[0].referenced_json.as_deref(), Some("[\"https://openalex.org/W1\"]"));
    }
}
