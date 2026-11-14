use std::fs;

#[tauri::command]
pub fn write_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&path, bytes).map_err(|e| format!("Failed to write file to {}: {}", path, e))
}
