use crate::db::DbState;
use crate::models::{Collection, Paper};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_collections(db: State<'_, DbState>) -> Result<Vec<Collection>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM collections ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut collections = Vec::new();
    for row in rows {
        collections.push(row.map_err(|e| e.to_string())?);
    }
    Ok(collections)
}

#[tauri::command]
pub fn create_collection(db: State<'_, DbState>, name: String) -> Result<Collection, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO collections (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, created_at FROM collections WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_collection(db: State<'_, DbState>, id: String, name: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE collections SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_collection(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM collections WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_paper_to_collection(
    db: State<'_, DbState>,
    collection_id: String,
    paper_id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO collection_papers (collection_id, paper_id) VALUES (?1, ?2)",
        rusqlite::params![collection_id, paper_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_paper_from_collection(
    db: State<'_, DbState>,
    collection_id: String,
    paper_id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM collection_papers WHERE collection_id = ?1 AND paper_id = ?2",
        rusqlite::params![collection_id, paper_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_collection_papers(
    db: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<Paper>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.doi, p.openalex_id, p.title, p.year, p.venue, p.authors_json, p.abstract, p.oa_url, p.pdf_path, p.created_at
             FROM papers p
             INNER JOIN collection_papers cp ON cp.paper_id = p.id
             WHERE cp.collection_id = ?1
             ORDER BY p.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![collection_id], |row| {
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
