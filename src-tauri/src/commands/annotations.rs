use crate::db::DbState;
use crate::models::Annotation;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_annotations(
    db: State<'_, DbState>,
    paper_id: String,
) -> Result<Vec<Annotation>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, paper_id, page, quote, note, color, created_at
             FROM annotations WHERE paper_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![paper_id], |row| {
            Ok(Annotation {
                id: row.get(0)?,
                paper_id: row.get(1)?,
                page: row.get(2)?,
                quote: row.get(3)?,
                note: row.get(4)?,
                color: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut annotations = Vec::new();
    for row in rows {
        annotations.push(row.map_err(|e| e.to_string())?);
    }
    Ok(annotations)
}

#[tauri::command]
pub fn create_annotation(
    db: State<'_, DbState>,
    paper_id: String,
    page: Option<i32>,
    quote: String,
    note: Option<String>,
    color: Option<String>,
) -> Result<Annotation, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO annotations (id, paper_id, page, quote, note, color)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, paper_id, page, quote, note, color],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, paper_id, page, quote, note, color, created_at FROM annotations WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Annotation {
                id: row.get(0)?,
                paper_id: row.get(1)?,
                page: row.get(2)?,
                quote: row.get(3)?,
                note: row.get(4)?,
                color: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_annotation(
    db: State<'_, DbState>,
    id: String,
    quote: String,
    note: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE annotations SET quote = ?1, note = ?2, color = ?3 WHERE id = ?4",
        rusqlite::params![quote, note, color, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_annotation(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM annotations WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
