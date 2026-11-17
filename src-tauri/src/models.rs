use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Paper {
    pub id: String,
    pub doi: Option<String>,
    pub openalex_id: Option<String>,
    pub title: String,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub authors_json: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub oa_url: Option<String>,
    pub pdf_path: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Annotation {
    pub id: String,
    pub paper_id: String,
    pub page: Option<i32>,
    pub quote: String,
    pub note: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub fields: Vec<TemplateField>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TemplateField {
    pub id: String,
    pub template_id: String,
    pub name: String,
    pub position: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Extraction {
    pub id: String,
    pub paper_id: String,
    pub field_id: String,
    pub value: Option<String>,
    pub origin: String,
    pub annotation_ids_json: Option<String>,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Claim {
    pub id: String,
    pub collection_id: String,
    pub text: String,
    pub origin: String,
    pub created_at: String,
    pub evidence: Vec<ClaimEvidence>,
    pub revisions: Vec<ClaimRevision>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClaimEvidence {
    pub id: String,
    pub claim_id: String,
    pub paper_id: String,
    pub annotation_id: Option<String>,
    pub stance: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClaimRevision {
    pub id: String,
    pub claim_id: String,
    pub old_text: String,
    pub new_text: String,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PaperResult {
    pub openalex_id: String,
    pub doi: Option<String>,
    pub title: String,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub authors: Vec<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub oa_url: Option<String>,
    /// How many works cite this one (OpenAlex). Missing in results cached by older versions.
    #[serde(default)]
    pub cited_by_count: Option<i64>,
    /// OpenAlex ids of the works this one cites.
    #[serde(default)]
    pub referenced_works: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkMeta {
    pub cited_by_count: Option<i64>,
    pub referenced_works: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CitationNode {
    pub openalex_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub doi: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CitationGraph {
    pub center: CitationNode,
    pub references: Vec<CitationNode>,
    pub cited_by: Vec<CitationNode>,
}
