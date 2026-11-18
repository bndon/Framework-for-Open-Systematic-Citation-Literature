use crate::backup_core::{self, BackupInfo, RestoreResult};
use crate::db::DbState;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn foscl_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("foscl"))
}

/// Write a backup folder inside `dir`. `app_state` is the frontend's settings and book shelf as JSON.
#[tauri::command]
pub fn create_backup(app: AppHandle, db: State<'_, DbState>, dir: String, app_state: String) -> Result<BackupInfo, String> {
    let pdfs = foscl_dir(&app)?.join("pdfs");
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    backup_core::create_backup(&conn, &pdfs, &PathBuf::from(dir), &app_state)
}

/// Look inside a backup folder before restoring it.
#[tauri::command]
pub fn inspect_backup(dir: String) -> Result<BackupInfo, String> {
    backup_core::inspect_backup(&PathBuf::from(dir))
}

/// Replace everything with the backup's contents. The previous data is kept in the app's own
/// `backups` folder first, and the path of that copy is returned.
#[tauri::command]
pub fn restore_backup(app: AppHandle, db: State<'_, DbState>, dir: String) -> Result<RestoreResult, String> {
    let base = foscl_dir(&app)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    backup_core::restore_backup(&conn, &base.join("pdfs"), &PathBuf::from(dir), &backup_core::backups_dir(&base))
}

/// Raw bytes of a file in a backup (used for the EPUB books, which the webview stores).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Could not read {}: {}", path, e))
}
