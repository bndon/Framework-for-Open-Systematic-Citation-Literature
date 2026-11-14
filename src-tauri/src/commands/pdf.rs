use crate::db::DbState;
use std::fs;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn upload_pdf(
    app: AppHandle,
    db: State<'_, DbState>,
    paper_id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pdfs_dir = app_data_dir.join("foscl").join("pdfs");
    fs::create_dir_all(&pdfs_dir).map_err(|e| e.to_string())?;

    let file_name = format!("{}.pdf", paper_id);
    let target_path = pdfs_dir.join(&file_name);

    fs::write(&target_path, bytes).map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE papers SET pdf_path = ?1 WHERE id = ?2",
        rusqlite::params![file_name, paper_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(file_name)
}

#[tauri::command]
pub fn load_pdf_bytes(
    app: AppHandle,
    db: State<'_, DbState>,
    paper_id: String,
) -> Result<Vec<u8>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let pdf_path_opt: Option<String> = conn
        .query_row(
            "SELECT pdf_path FROM papers WHERE id = ?1",
            rusqlite::params![paper_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let file_name = pdf_path_opt.unwrap_or_else(|| format!("{}.pdf", paper_id));

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pdf_path = app_data_dir.join("foscl").join("pdfs").join(&file_name);

    if !pdf_path.exists() {
        return Err(format!("PDF file not found at {:?}", pdf_path));
    }

    fs::read(&pdf_path).map_err(|e| e.to_string())
}
