use crate::db::DbState;
use crate::models::Paper;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_papers(db: State<'_, DbState>) -> Result<Vec<Paper>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, doi, openalex_id, title, year, venue, authors_json, abstract, oa_url, pdf_path, created_at
             FROM papers ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Paper {
                id: row.get(0)?,
                doi: row.get(1)?,
                openalex_id: row.get(2)?,
                title: row.get(3)?,
                year: row.get(4)?,
                venue: row.get(5)?,
                authors_json: row.get(6)?,
                abstract_text: row.get(7)?,
                oa_url: row.get(8)?,
                pdf_path: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut papers = Vec::new();
    for row in rows {
        papers.push(row.map_err(|e| e.to_string())?);
    }
    Ok(papers)
}

#[tauri::command]
pub fn get_paper(db: State<'_, DbState>, id: String) -> Result<Paper, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, doi, openalex_id, title, year, venue, authors_json, abstract, oa_url, pdf_path, created_at
         FROM papers WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Paper {
                id: row.get(0)?,
                doi: row.get(1)?,
                openalex_id: row.get(2)?,
                title: row.get(3)?,
                year: row.get(4)?,
                venue: row.get(5)?,
                authors_json: row.get(6)?,
                abstract_text: row.get(7)?,
                oa_url: row.get(8)?,
                pdf_path: row.get(9)?,
                created_at: row.get(10)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_paper(db: State<'_, DbState>, mut paper: Paper) -> Result<Paper, String> {
    if paper.id.is_empty() {
        paper.id = Uuid::new_v4().to_string();
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO papers (id, doi, openalex_id, title, year, venue, authors_json, abstract, oa_url, pdf_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, COALESCE(?11, datetime('now')))",
        rusqlite::params![
            paper.id,
            paper.doi,
            paper.openalex_id,
            paper.title,
            paper.year,
            paper.venue,
            paper.authors_json,
            paper.abstract_text,
            paper.oa_url,
            paper.pdf_path,
            paper.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Re-fetch to get the actual created_at
    drop(conn);
    get_paper(db, paper.id)
}

#[tauri::command]
pub fn delete_paper(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Check if pdf_path exists and delete the file
    let pdf_path: Option<String> = conn
        .query_row(
            "SELECT pdf_path FROM papers WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(path) = pdf_path {
        let _ = std::fs::remove_file(&path);
    }

    conn.execute("DELETE FROM papers WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
