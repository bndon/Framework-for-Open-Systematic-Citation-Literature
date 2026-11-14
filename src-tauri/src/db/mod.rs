use rusqlite::Connection;
use std::fs;
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(app: &tauri::App) -> Result<DbState, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    let foscl_dir = app_data_dir.join("foscl");
    let pdfs_dir = foscl_dir.join("pdfs");

    fs::create_dir_all(&pdfs_dir)?;

    let db_path = foscl_dir.join("foscl.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    let migrations = include_str!("migrations.sql");
    conn.execute_batch(migrations)?;

    Ok(DbState(Mutex::new(conn)))
}
