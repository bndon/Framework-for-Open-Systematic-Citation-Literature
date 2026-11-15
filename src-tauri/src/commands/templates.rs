use crate::db::DbState;
use crate::models::{Extraction, Template, TemplateField};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_templates(db: State<'_, DbState>) -> Result<Vec<Template>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name FROM templates")
        .map_err(|e| e.to_string())?;

    let template_rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut templates = Vec::new();

    for t in template_rows {
        let (id, name) = t.map_err(|e| e.to_string())?;
        let mut field_stmt = conn
            .prepare(
                "SELECT id, template_id, name, position
                 FROM template_fields
                 WHERE template_id = ?1
                 ORDER BY position ASC",
            )
            .map_err(|e| e.to_string())?;

        let fields = field_stmt
            .query_map(rusqlite::params![id], |row| {
                Ok(TemplateField {
                    id: row.get(0)?,
                    template_id: row.get(1)?,
                    name: row.get(2)?,
                    position: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        templates.push(Template { id, name, fields });
    }

    Ok(templates)
}

#[tauri::command]
pub fn create_template(db: State<'_, DbState>, name: String) -> Result<Template, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO templates (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )
    .map_err(|e| e.to_string())?;

    Ok(Template {
        id,
        name,
        fields: Vec::new(),
    })
}

#[tauri::command]
pub fn update_template_fields(
    db: State<'_, DbState>,
    template_id: String,
    fields: Vec<TemplateField>,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM template_fields WHERE template_id = ?1",
        rusqlite::params![template_id],
    )
    .map_err(|e| e.to_string())?;

    for (pos, field) in fields.into_iter().enumerate() {
        let field_id = if field.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            field.id
        };
        tx.execute(
            "INSERT INTO template_fields (id, template_id, name, position)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![field_id, template_id, field.name, pos as i32],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_template(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM templates WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_extractions(
    db: State<'_, DbState>,
    paper_id: String,
    template_id: String,
) -> Result<Vec<Extraction>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.paper_id, e.field_id, e.value, e.origin, e.annotation_ids_json, e.updated_at
             FROM extractions e
             JOIN template_fields tf ON e.field_id = tf.id
             WHERE e.paper_id = ?1 AND tf.template_id = ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![paper_id, template_id], |row| {
            Ok(Extraction {
                id: row.get(0)?,
                paper_id: row.get(1)?,
                field_id: row.get(2)?,
                value: row.get(3)?,
                origin: row.get(4)?,
                annotation_ids_json: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn upsert_extraction(db: State<'_, DbState>, extraction: Extraction) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = if extraction.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        extraction.id
    };

    conn.execute(
        "INSERT INTO extractions (id, paper_id, field_id, value, origin, annotation_ids_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            value = excluded.value,
            origin = excluded.origin,
            annotation_ids_json = excluded.annotation_ids_json,
            updated_at = datetime('now')",
        rusqlite::params![
            id,
            extraction.paper_id,
            extraction.field_id,
            extraction.value,
            extraction.origin,
            extraction.annotation_ids_json
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
