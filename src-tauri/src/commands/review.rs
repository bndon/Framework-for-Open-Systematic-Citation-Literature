use crate::db::DbState;
use crate::review_core::{self, PaperMeta, ScreeningDecision, SearchLogEntry};
use tauri::State;

// ----- screening -------------------------------------------------------------

#[tauri::command]
pub fn get_screening(db: State<'_, DbState>, collection_id: String) -> Result<Vec<ScreeningDecision>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::get_screening(&conn, &collection_id)
}

#[tauri::command]
pub fn set_screening(
    db: State<'_, DbState>,
    collection_id: String,
    paper_id: String,
    stage: String,
    decision: String,
    reason: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::set_screening(&conn, &collection_id, &paper_id, &stage, &decision, reason.as_deref())
}

// ----- search log / saved searches ---------------------------------------------

#[tauri::command]
pub fn log_search(
    db: State<'_, DbState>,
    query: String,
    filters_json: Option<String>,
    found: i64,
    unique_count: i64,
    collection_id: Option<String>,
) -> Result<SearchLogEntry, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::log_search(&conn, &query, filters_json.as_deref(), found, unique_count, collection_id.as_deref())
}

#[tauri::command]
pub fn get_search_log(db: State<'_, DbState>, limit: Option<i64>) -> Result<Vec<SearchLogEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::get_search_log(&conn, limit.unwrap_or(200))
}

#[tauri::command]
pub fn update_search(
    db: State<'_, DbState>,
    id: String,
    name: Option<String>,
    saved: bool,
    collection_id: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::update_search(&conn, &id, name.as_deref(), saved, collection_id.as_deref())
}

#[tauri::command]
pub fn update_search_counts(db: State<'_, DbState>, id: String, found: i64, unique_count: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::update_search_counts(&conn, &id, found, unique_count)
}

#[tauri::command]
pub fn delete_search(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::delete_search(&conn, &id)
}

// ----- citation metadata ---------------------------------------------------------

#[tauri::command]
pub fn get_paper_metas(db: State<'_, DbState>) -> Result<Vec<PaperMeta>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::get_paper_metas(&conn)
}

#[tauri::command]
pub fn set_paper_meta(
    db: State<'_, DbState>,
    paper_id: String,
    cited_by_count: Option<i64>,
    referenced_json: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    review_core::set_paper_meta(&conn, &paper_id, cited_by_count, referenced_json.as_deref())
}
