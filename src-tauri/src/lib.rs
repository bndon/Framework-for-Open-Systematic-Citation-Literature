pub mod commands;
pub mod db;
pub mod models;
pub mod review_core;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_state = db::init_db(app)?;
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::openalex::search_openalex,
            commands::openalex::lookup_doi,
            commands::openalex::fetch_citations,
            commands::papers::get_papers,
            commands::papers::get_paper,
            commands::papers::upsert_paper,
            commands::papers::delete_paper,
            commands::collections::get_collections,
            commands::collections::create_collection,
            commands::collections::rename_collection,
            commands::collections::delete_collection,
            commands::collections::add_paper_to_collection,
            commands::collections::remove_paper_from_collection,
            commands::collections::get_collection_papers,
            commands::annotations::get_annotations,
            commands::annotations::create_annotation,
            commands::annotations::update_annotation,
            commands::annotations::delete_annotation,
            commands::templates::get_templates,
            commands::templates::create_template,
            commands::templates::update_template_fields,
            commands::templates::delete_template,
            commands::templates::get_extractions,
            commands::templates::upsert_extraction,
            commands::claims::get_claims,
            commands::claims::create_claim,
            commands::claims::update_claim,
            commands::claims::delete_claim,
            commands::claims::add_claim_evidence,
            commands::claims::remove_claim_evidence,
            commands::claims::get_claim_revisions,
            commands::pdf::upload_pdf,
            commands::pdf::load_pdf_bytes,
            commands::files::write_export_file,
            commands::openalex::fetch_work_meta,
            commands::review::get_screening,
            commands::review::set_screening,
            commands::review::log_search,
            commands::review::get_search_log,
            commands::review::update_search,
            commands::review::update_search_counts,
            commands::review::delete_search,
            commands::review::get_paper_metas,
            commands::review::set_paper_meta,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
