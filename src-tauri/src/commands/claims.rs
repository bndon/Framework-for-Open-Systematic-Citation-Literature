use crate::db::DbState;
use crate::models::{Claim, ClaimEvidence, ClaimRevision};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_claims(db: State<'_, DbState>, collection_id: String) -> Result<Vec<Claim>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, collection_id, text, origin, created_at
             FROM claims WHERE collection_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let claim_rows = stmt
        .query_map(rusqlite::params![collection_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut claims = Vec::new();

    for c in claim_rows {
        let (id, collection_id, text, origin, created_at) = c.map_err(|e| e.to_string())?;

        // Fetch evidence
        let mut ev_stmt = conn
            .prepare(
                "SELECT id, claim_id, paper_id, annotation_id, stance
                 FROM claim_evidence WHERE claim_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let evidence = ev_stmt
            .query_map(rusqlite::params![id], |row| {
                Ok(ClaimEvidence {
                    id: row.get(0)?,
                    claim_id: row.get(1)?,
                    paper_id: row.get(2)?,
                    annotation_id: row.get(3)?,
                    stance: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Fetch revisions
        let mut rev_stmt = conn
            .prepare(
                "SELECT id, claim_id, old_text, new_text, reason, created_at
                 FROM claim_revisions WHERE claim_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let revisions = rev_stmt
            .query_map(rusqlite::params![id], |row| {
                Ok(ClaimRevision {
                    id: row.get(0)?,
                    claim_id: row.get(1)?,
                    old_text: row.get(2)?,
                    new_text: row.get(3)?,
                    reason: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        claims.push(Claim {
            id,
            collection_id,
            text,
            origin,
            created_at,
            evidence,
            revisions,
        });
    }

    Ok(claims)
}

#[tauri::command]
pub fn create_claim(
    db: State<'_, DbState>,
    collection_id: String,
    text: String,
    origin: String,
) -> Result<Claim, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO claims (id, collection_id, text, origin) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, collection_id, text, origin],
    )
    .map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM claims WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(Claim {
        id,
        collection_id,
        text,
        origin,
        created_at,
        evidence: Vec::new(),
        revisions: Vec::new(),
    })
}

#[tauri::command]
pub fn update_claim(
    db: State<'_, DbState>,
    id: String,
    new_text: String,
    reason: Option<String>,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let old_text: String = tx
        .query_row(
            "SELECT text FROM claims WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Record revision
    let rev_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO claim_revisions (id, claim_id, old_text, new_text, reason)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![rev_id, id, old_text, new_text, reason],
    )
    .map_err(|e| e.to_string())?;

    // Update claim
    tx.execute(
        "UPDATE claims SET text = ?1 WHERE id = ?2",
        rusqlite::params![new_text, id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_claim(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM claims WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_claim_evidence(
    db: State<'_, DbState>,
    claim_id: String,
    paper_id: String,
    annotation_id: Option<String>,
    stance: String,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO claim_evidence (id, claim_id, paper_id, annotation_id, stance)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, claim_id, paper_id, annotation_id, stance],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_claim_evidence(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM claim_evidence WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_claim_revisions(
    db: State<'_, DbState>,
    claim_id: String,
) -> Result<Vec<ClaimRevision>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, claim_id, old_text, new_text, reason, created_at
             FROM claim_revisions WHERE claim_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![claim_id], |row| {
            Ok(ClaimRevision {
                id: row.get(0)?,
                claim_id: row.get(1)?,
                old_text: row.get(2)?,
                new_text: row.get(3)?,
                reason: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}
