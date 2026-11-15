use crate::db::DbState;
use crate::models::PaperResult;
use crate::models::{CitationGraph, CitationNode};
use serde_json::Value;
use tauri::State;

fn urlencode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => encoded.push(b as char),
            b' ' => encoded.push_str("%20"),
            _ => encoded.push_str(&format!("%{:02X}", b)),
        }
    }
    encoded
}

fn reconstruct_abstract(inverted_index: &Value) -> Option<String> {
    let obj = inverted_index.as_object()?;
    let mut words: Vec<(u64, &str)> = Vec::new();
    for (word, positions) in obj {
        if let Some(arr) = positions.as_array() {
            for pos in arr {
                if let Some(p) = pos.as_u64() {
                    words.push((p, word.as_str()));
                }
            }
        }
    }
    if words.is_empty() {
        return None;
    }
    words.sort_by_key(|&(p, _)| p);
    Some(words.into_iter().map(|(_, w)| w).collect::<Vec<_>>().join(" "))
}

fn parse_work(work: &Value) -> PaperResult {
    let openalex_id = work["id"].as_str().unwrap_or_default().to_string();

    let doi = work["doi"]
        .as_str()
        .map(|d| d.trim_start_matches("https://doi.org/").to_string());

    let title = work["title"].as_str().unwrap_or("Untitled").to_string();
    let year = work["publication_year"].as_i64().map(|y| y as i32);

    let venue = work["primary_location"]["source"]["display_name"]
        .as_str()
        .map(|s| s.to_string());

    let authors = work["authorships"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a["author"]["display_name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let abstract_text = work
        .get("abstract_inverted_index")
        .and_then(|idx| reconstruct_abstract(idx));

    let oa_url = work["open_access"]["oa_url"]
        .as_str()
        .map(|s| s.to_string());

    PaperResult {
        openalex_id,
        doi,
        title,
        year,
        venue,
        authors,
        abstract_text,
        oa_url,
    }
}

fn build_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("FOSCL/0.2 (mailto:foscl@example.com)")
        .build()
        .map_err(|e| e.to_string())
}

fn get_cache(db: &DbState, key: &str) -> Option<String> {
    let conn = db.0.lock().ok()?;
    let mut stmt = conn
        .prepare("SELECT json, fetched_at FROM cache WHERE key = ?1")
        .ok()?;
    let result: Option<(String, String)> = stmt
        .query_row(rusqlite::params![key], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .ok();

    if let Some((json, fetched_at)) = result {
        // Check if cache is less than 1 hour old
        let still_valid: bool = conn
            .query_row(
                "SELECT datetime(?1, '+1 hour') > datetime('now')",
                rusqlite::params![fetched_at],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if still_valid {
            return Some(json);
        }
    }
    None
}

fn set_cache(db: &DbState, key: &str, json: &str) {
    if let Ok(conn) = db.0.lock() {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO cache (key, json, fetched_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params![key, json],
        );
    }
}

#[tauri::command]
pub fn search_openalex(
    db: State<'_, DbState>,
    query: String,
    page: u32,
) -> Result<Vec<PaperResult>, String> {
    let cache_key = format!("openalex:search:{}:{}", query, page);

    if let Some(cached) = get_cache(&db, &cache_key) {
        let results: Vec<PaperResult> =
            serde_json::from_str(&cached).map_err(|e| e.to_string())?;
        return Ok(results);
    }

    let client = build_client()?;
    let url = format!(
        "https://api.openalex.org/works?search={}&page={}&per_page=20",
        urlencode(&query),
        page
    );

    let resp: Value = client.get(&url).send().map_err(|e| e.to_string())?
        .json().map_err(|e| e.to_string())?;

    let results: Vec<PaperResult> = resp["results"]
        .as_array()
        .map(|arr| arr.iter().map(parse_work).collect())
        .unwrap_or_default();

    let json_str = serde_json::to_string(&results).map_err(|e| e.to_string())?;
    set_cache(&db, &cache_key, &json_str);

    Ok(results)
}

#[tauri::command]
pub fn lookup_doi(db: State<'_, DbState>, doi: String) -> Result<PaperResult, String> {
    let cache_key = format!("openalex:doi:{}", doi);

    if let Some(cached) = get_cache(&db, &cache_key) {
        let result: PaperResult = serde_json::from_str(&cached).map_err(|e| e.to_string())?;
        return Ok(result);
    }

    let client = build_client()?;
    let url = format!(
        "https://api.openalex.org/works/doi:{}",
        urlencode(&doi)
    );

    let resp = client.get(&url).send().map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Paper not found for this DOI".to_string());
    }

    let work: Value = resp.json().map_err(|e| e.to_string())?;
    let result = parse_work(&work);

    let json_str = serde_json::to_string(&result).map_err(|e| e.to_string())?;
    set_cache(&db, &cache_key, &json_str);

    Ok(result)
}

#[tauri::command]
pub fn fetch_citations(
    db: State<'_, DbState>,
    openalex_id: String,
) -> Result<CitationGraph, String> {
    let cache_key = format!("openalex:citations:{}", openalex_id);

    if let Some(cached) = get_cache(&db, &cache_key) {
        let graph: CitationGraph = serde_json::from_str(&cached).map_err(|e| e.to_string())?;
        return Ok(graph);
    }

    let client = build_client()?;

    // Fetch the center work
    let center_url = format!(
        "https://api.openalex.org/works/{}",
        urlencode(&openalex_id)
    );
    let center_work: Value = client
        .get(&center_url)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let center = CitationNode {
        openalex_id: center_work["id"].as_str().unwrap_or_default().to_string(),
        title: center_work["title"].as_str().unwrap_or("Untitled").to_string(),
        year: center_work["publication_year"].as_i64().map(|y| y as i32),
        doi: center_work["doi"]
            .as_str()
            .map(|d| d.trim_start_matches("https://doi.org/").to_string()),
    };

    // Fetch references (up to 20)
    let mut references = Vec::new();
    if let Some(ref_ids) = center_work["referenced_works"].as_array() {
        for ref_id in ref_ids.iter().take(20) {
            if let Some(id_str) = ref_id.as_str() {
                let url = format!(
                    "https://api.openalex.org/works/{}",
                    urlencode(id_str)
                );
                if let Ok(resp) = client.get(&url).send() {
                    if let Ok(w) = resp.json::<Value>() {
                        references.push(CitationNode {
                            openalex_id: w["id"].as_str().unwrap_or_default().to_string(),
                            title: w["title"].as_str().unwrap_or("Untitled").to_string(),
                            year: w["publication_year"].as_i64().map(|y| y as i32),
                            doi: w["doi"]
                                .as_str()
                                .map(|d| d.trim_start_matches("https://doi.org/").to_string()),
                        });
                    }
                }
            }
        }
    }

    // Fetch cited_by
    let cited_by_url = format!(
        "https://api.openalex.org/works?filter=cites:{}&per_page=20",
        urlencode(&openalex_id)
    );
    let cited_by_resp: Value = client
        .get(&cited_by_url)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let cited_by: Vec<CitationNode> = cited_by_resp["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|w| CitationNode {
                    openalex_id: w["id"].as_str().unwrap_or_default().to_string(),
                    title: w["title"].as_str().unwrap_or("Untitled").to_string(),
                    year: w["publication_year"].as_i64().map(|y| y as i32),
                    doi: w["doi"]
                        .as_str()
                        .map(|d| d.trim_start_matches("https://doi.org/").to_string()),
                })
                .collect()
        })
        .unwrap_or_default();

    let graph = CitationGraph {
        center,
        references,
        cited_by,
    };

    let json_str = serde_json::to_string(&graph).map_err(|e| e.to_string())?;
    set_cache(&db, &cache_key, &json_str);

    Ok(graph)
}
