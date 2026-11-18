//! Backup and restore of the whole workspace, without any Tauri types so it can be unit-tested.
//!
//! A backup is a plain folder the user can copy, zip or sync anywhere:
//!
//! ```text
//! foscl-backup-2026-11-18_092500/
//!   foscl.db          consistent copy of the database (VACUUM INTO)
//!   pdfs/             every stored PDF
//!   epubs/            every stored book (written by the frontend, it keeps them in the webview)
//!   app_state.json    settings, themes, book shelf, EPUB highlights (frontend localStorage)
//!   manifest.json     what is inside, for the "choose a backup" preview
//! ```

use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const REQUIRED_TABLES: [&str; 2] = ["papers", "collections"];
/// Tables that are only a cache and are never restored.
const SKIP_TABLES: [&str; 1] = ["cache"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BackupInfo {
    pub path: String,
    pub created_at: String,
    pub papers: i64,
    pub collections: i64,
    pub annotations: i64,
    pub pdfs: i64,
    pub epubs: i64,
    pub has_app_state: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RestoreResult {
    pub app_state: Option<String>,
    pub epub_ids: Vec<String>,
    /// Where the data you had before the restore was saved, so a restore can itself be undone.
    pub safety_path: String,
}

fn err<E: std::fmt::Display>(what: &str) -> impl Fn(E) -> String + '_ {
    move |e| format!("{}: {}", what, e)
}

fn count_files(dir: &Path, ext: Option<&str>) -> i64 {
    fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .filter(|e| match ext {
                    Some(x) => e.path().extension().map(|v| v.eq_ignore_ascii_case(x)).unwrap_or(false),
                    None => true,
                })
                .count() as i64
        })
        .unwrap_or(0)
}

fn copy_files(src: &Path, dst: &Path) -> Result<i64, String> {
    fs::create_dir_all(dst).map_err(err("Could not create folder"))?;
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(src) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_file() {
                fs::copy(&p, dst.join(e.file_name())).map_err(err("Could not copy a file"))?;
                n += 1;
            }
        }
    }
    Ok(n)
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM \"{}\"", table), [], |r| r.get(0)).unwrap_or(0)
}

/// Write a backup folder inside `dest_parent` and return what it holds.
pub fn create_backup(conn: &Connection, pdfs_dir: &Path, dest_parent: &Path, app_state: &str) -> Result<BackupInfo, String> {
    let (stamp, created_at): (String, String) = conn
        .query_row(
            "SELECT strftime('%Y-%m-%d_%H%M%S','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(err("Could not read the clock"))?;

    let mut folder = dest_parent.join(format!("foscl-backup-{}", stamp));
    let mut n = 2;
    while folder.exists() {
        folder = dest_parent.join(format!("foscl-backup-{}-{}", stamp, n));
        n += 1;
    }
    fs::create_dir_all(folder.join("epubs")).map_err(err("Could not create the backup folder"))?;

    let db_copy = folder.join("foscl.db");
    conn.execute("VACUUM INTO ?1", params![db_copy.to_string_lossy()])
        .map_err(err("Could not copy the database"))?;

    let pdfs = copy_files(pdfs_dir, &folder.join("pdfs"))?;
    fs::write(folder.join("app_state.json"), app_state).map_err(err("Could not write the settings"))?;

    let info = BackupInfo {
        path: folder.to_string_lossy().to_string(),
        created_at,
        papers: count(conn, "papers"),
        collections: count(conn, "collections"),
        annotations: count(conn, "annotations"),
        pdfs,
        epubs: 0,
        has_app_state: !app_state.trim().is_empty(),
    };
    fs::write(
        folder.join("manifest.json"),
        serde_json::to_string_pretty(&info).map_err(err("Could not write the manifest"))?,
    )
    .map_err(err("Could not write the manifest"))?;
    Ok(info)
}

/// Check that a folder really is a backup and say what is in it.
pub fn inspect_backup(folder: &Path) -> Result<BackupInfo, String> {
    let db_path = folder.join("foscl.db");
    if !db_path.is_file() {
        return Err("This folder is not a FOSCL backup (no foscl.db inside). Pick the folder named foscl-backup-…".into());
    }
    let bk = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("The database in this backup cannot be opened: {}", e))?;
    for t in REQUIRED_TABLES {
        let found: i64 = bk
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", params![t], |r| r.get(0))
            .map_err(|e| format!("The database in this backup is damaged: {}", e))?;
        if found == 0 {
            return Err(format!("The database in this backup has no \"{}\" table, so it is not a FOSCL backup.", t));
        }
    }
    let created_at = fs::read_to_string(folder.join("manifest.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<BackupInfo>(&s).ok())
        .map(|m| m.created_at)
        .unwrap_or_default();
    Ok(BackupInfo {
        path: folder.to_string_lossy().to_string(),
        created_at,
        papers: count(&bk, "papers"),
        collections: count(&bk, "collections"),
        annotations: count(&bk, "annotations"),
        pdfs: count_files(&folder.join("pdfs"), None),
        epubs: count_files(&folder.join("epubs"), Some("epub")),
        has_app_state: folder.join("app_state.json").is_file(),
    })
}

fn columns(conn: &Connection, schema: &str, table: &str) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA {}.table_info(\"{}\")", schema, table))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
    rows.collect()
}

/// Replace the contents of every table with the backup's. Columns are matched by name, so a
/// backup made by an older version (fewer tables or columns) restores cleanly.
fn restore_tables(conn: &Connection, backup_db: &Path) -> Result<(), String> {
    conn.execute("ATTACH DATABASE ?1 AS bk", params![backup_db.to_string_lossy()])
        .map_err(err("Could not open the backup"))?;

    let run = || -> Result<(), rusqlite::Error> {
        let tables: Vec<String> = {
            let mut stmt = conn.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<_, _>>()?
        };
        conn.execute_batch("PRAGMA foreign_keys=OFF;")?;
        conn.execute_batch("BEGIN IMMEDIATE;")?;
        let inner = || -> Result<(), rusqlite::Error> {
            for t in tables.iter().filter(|t| !SKIP_TABLES.contains(&t.as_str())) {
                conn.execute(&format!("DELETE FROM main.\"{}\"", t), [])?;
                let in_backup: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM bk.sqlite_master WHERE type='table' AND name=?1",
                    params![t],
                    |r| r.get(0),
                )?;
                if in_backup == 0 {
                    continue; // a table newer than the backup: it is simply empty again
                }
                let theirs = columns(conn, "bk", t)?;
                let common: Vec<String> = columns(conn, "main", t)?.into_iter().filter(|c| theirs.contains(c)).collect();
                if common.is_empty() {
                    continue;
                }
                let list = common.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(",");
                conn.execute(&format!("INSERT INTO main.\"{t}\" ({list}) SELECT {list} FROM bk.\"{t}\""), [])?;
            }
            Ok(())
        };
        match inner() {
            Ok(()) => conn.execute_batch("COMMIT;"),
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK;");
                Err(e)
            }
        }
    };
    let result = run().map_err(|e| format!("Restore failed, nothing was changed: {}", e));
    let _ = conn.execute_batch("PRAGMA foreign_keys=ON;");
    let _ = conn.execute_batch("DETACH DATABASE bk;");
    result
}

/// Restore a backup folder. The current data is saved to `safety_parent` first.
pub fn restore_backup(conn: &Connection, pdfs_dir: &Path, folder: &Path, safety_parent: &Path) -> Result<RestoreResult, String> {
    inspect_backup(folder)?; // refuse anything that is not a backup before touching your data

    let safety = create_backup(conn, pdfs_dir, safety_parent, "")?;
    restore_tables(conn, &folder.join("foscl.db"))?;
    copy_files(&folder.join("pdfs"), pdfs_dir)?;

    let app_state = fs::read_to_string(folder.join("app_state.json")).ok().filter(|s| !s.trim().is_empty());
    let mut epub_ids: Vec<String> = fs::read_dir(folder.join("epubs"))
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("epub")).unwrap_or(false))
                .filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().to_string()))
                .collect()
        })
        .unwrap_or_default();
    epub_ids.sort();
    Ok(RestoreResult { app_state, epub_ids, safety_path: safety.path })
}

pub fn backups_dir(foscl_dir: &Path) -> PathBuf {
    foscl_dir.join("backups")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("foscl-bk-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn fresh() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        c.execute_batch(include_str!("db/migrations.sql")).unwrap();
        c
    }

    fn seed(c: &Connection) {
        c.execute("INSERT INTO papers (id,title,pdf_path) VALUES ('p1','Alpha','p1.pdf'),('p2','Beta',NULL)", []).unwrap();
        c.execute("INSERT INTO collections (id,name) VALUES ('c1','Review')", []).unwrap();
        c.execute("INSERT INTO collection_papers VALUES ('c1','p1'),('c1','p2')", []).unwrap();
        c.execute("INSERT INTO annotations (id,paper_id,page,quote) VALUES ('a1','p1',2,'q')", []).unwrap();
        c.execute("INSERT INTO screening (collection_id,paper_id,stage,decision) VALUES ('c1','p1','title_abstract','include')", []).unwrap();
    }

    #[test]
    fn round_trip_restores_deleted_data_and_pdfs() {
        let root = tmp("rt");
        let pdfs = root.join("pdfs");
        fs::create_dir_all(&pdfs).unwrap();
        fs::write(pdfs.join("p1.pdf"), b"%PDF-fake").unwrap();
        let c = fresh();
        seed(&c);

        let info = create_backup(&c, &pdfs, &root.join("out"), "{\"foscl:app_theme\":\"night\"}").unwrap();
        assert_eq!((info.papers, info.collections, info.annotations, info.pdfs), (2, 1, 1, 1));
        fs::write(Path::new(&info.path).join("epubs").join("book1.epub"), b"epub").unwrap();

        // mess things up
        c.execute("DELETE FROM papers WHERE id='p1'", []).unwrap();
        c.execute("INSERT INTO papers (id,title) VALUES ('p9','Intruder')", []).unwrap();
        fs::remove_file(pdfs.join("p1.pdf")).unwrap();
        assert_eq!(count(&c, "annotations"), 0); // cascaded away

        let res = restore_backup(&c, &pdfs, Path::new(&info.path), &root.join("safety")).unwrap();
        assert_eq!(count(&c, "papers"), 2);
        assert_eq!(count(&c, "annotations"), 1);
        assert_eq!(count(&c, "screening"), 1);
        assert_eq!(count(&c, "collection_papers"), 2);
        let titles: Vec<String> = c.prepare("SELECT title FROM papers ORDER BY id").unwrap().query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
        assert_eq!(titles, vec!["Alpha", "Beta"]); // the intruder is gone
        assert!(pdfs.join("p1.pdf").is_file());
        assert_eq!(res.app_state.as_deref(), Some("{\"foscl:app_theme\":\"night\"}"));
        assert_eq!(res.epub_ids, vec!["book1"]);

        // the safety copy holds the state from before the restore (with the intruder)
        let safety = inspect_backup(Path::new(&res.safety_path)).unwrap();
        assert_eq!(safety.papers, 2); // p2 + p9
        let sdb = Connection::open(Path::new(&res.safety_path).join("foscl.db")).unwrap();
        assert_eq!(count(&sdb, "papers"), 2);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn backup_from_an_older_version_restores_and_empties_newer_tables() {
        let root = tmp("old");
        let pdfs = root.join("pdfs");
        // an "old" database: no screening / search_log / paper_meta tables, and no `venue` column
        let old_path = root.join("out").join("foscl-backup-old");
        fs::create_dir_all(&old_path).unwrap();
        {
            let o = Connection::open(old_path.join("foscl.db")).unwrap();
            o.execute_batch(
                "CREATE TABLE papers (id TEXT PRIMARY KEY, doi TEXT, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
                 CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
                 INSERT INTO papers (id,title) VALUES ('old1','Old paper');
                 INSERT INTO collections (id,name) VALUES ('oc','Old collection');",
            )
            .unwrap();
        }
        let c = fresh();
        seed(&c);
        restore_backup(&c, &pdfs, &old_path, &root.join("safety")).unwrap();
        assert_eq!(count(&c, "papers"), 1);
        assert_eq!(count(&c, "screening"), 0);
        assert_eq!(count(&c, "annotations"), 0);
        // and the app keeps working afterwards
        c.execute("INSERT INTO papers (id,title,venue) VALUES ('n','New','V')", []).unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_folders_that_are_not_backups_and_leaves_data_alone() {
        let root = tmp("bad");
        let c = fresh();
        seed(&c);
        let empty = root.join("empty");
        fs::create_dir_all(&empty).unwrap();
        assert!(restore_backup(&c, &root.join("pdfs"), &empty, &root.join("safety")).is_err());

        // a database that is not FOSCL's
        let other = root.join("other");
        fs::create_dir_all(&other).unwrap();
        Connection::open(other.join("foscl.db")).unwrap().execute_batch("CREATE TABLE x (a);").unwrap();
        let e = restore_backup(&c, &root.join("pdfs"), &other, &root.join("safety")).unwrap_err();
        assert!(e.contains("not a FOSCL backup"), "{}", e);
        assert_eq!(count(&c, "papers"), 2); // untouched
        assert!(!root.join("safety").exists()); // not even a safety copy was needed
        let _ = fs::remove_dir_all(root);
    }
}
