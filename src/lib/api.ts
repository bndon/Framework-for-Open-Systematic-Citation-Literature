import { invoke } from "@tauri-apps/api/core";
import type {
  Annotation,
  BackupInfo,
  CitationGraph,
  Claim,
  ClaimRevision,
  Collection,
  Extraction,
  Paper,
  PaperMeta,
  PaperResult,
  RestoreResult,
  ScreeningChoice,
  ScreeningDecision,
  ScreeningStage,
  SearchLogEntry,
  Template,
  TemplateField,
  WorkMeta,
} from "../types";

// Helper to provide both camelCase and snake_case to satisfy Tauri 2 commands
function dualKeys<T extends Record<string, any>>(obj: T): any {
  const result: Record<string, any> = { ...obj };
  for (const key of Object.keys(obj)) {
    // snake_case to camelCase
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    // camelCase to snake_case
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[camel] = obj[key];
    result[snake] = obj[key];
  }
  return result;
}

// OpenAlex
export async function searchOpenAlex(query: string, page = 1): Promise<PaperResult[]> {
  return invoke("search_openalex", dualKeys({ query, page }));
}

export async function lookupDoi(doi: string): Promise<PaperResult> {
  return invoke("lookup_doi", dualKeys({ doi }));
}

export async function fetchCitations(openalexId: string): Promise<CitationGraph> {
  return invoke("fetch_citations", dualKeys({ openalex_id: openalexId }));
}

export async function fetchWorkMeta(openalexId: string): Promise<WorkMeta> {
  return invoke("fetch_work_meta", dualKeys({ openalex_id: openalexId }));
}

// Papers
export async function getPapers(): Promise<Paper[]> {
  return invoke("get_papers");
}

export async function getPaper(id: string): Promise<Paper> {
  return invoke("get_paper", dualKeys({ id }));
}

export async function upsertPaper(paper: Partial<Paper> & { title: string }): Promise<Paper> {
  const fullPaper: Paper = {
    id: paper.id || "",
    doi: paper.doi,
    openalex_id: paper.openalex_id,
    title: paper.title,
    year: paper.year,
    venue: paper.venue,
    authors_json: paper.authors_json,
    abstract: paper.abstract,
    oa_url: paper.oa_url,
    pdf_path: paper.pdf_path,
    created_at: paper.created_at || "",
  };
  return invoke("upsert_paper", dualKeys({ paper: fullPaper }));
}

export async function deletePaper(id: string): Promise<void> {
  return invoke("delete_paper", dualKeys({ id }));
}

// Collections
export async function getCollections(): Promise<Collection[]> {
  return invoke("get_collections");
}

export async function createCollection(name: string): Promise<Collection> {
  return invoke("create_collection", dualKeys({ name }));
}

export async function renameCollection(id: string, name: string): Promise<void> {
  return invoke("rename_collection", dualKeys({ id, name }));
}

export async function deleteCollection(id: string): Promise<void> {
  return invoke("delete_collection", dualKeys({ id }));
}

export async function addPaperToCollection(collectionId: string, paperId: string): Promise<void> {
  return invoke("add_paper_to_collection", dualKeys({
    collection_id: collectionId,
    paper_id: paperId,
  }));
}

export async function removePaperFromCollection(collectionId: string, paperId: string): Promise<void> {
  return invoke("remove_paper_from_collection", dualKeys({
    collection_id: collectionId,
    paper_id: paperId,
  }));
}

export async function getCollectionPapers(collectionId: string): Promise<Paper[]> {
  return invoke("get_collection_papers", dualKeys({
    collection_id: collectionId,
  }));
}

// Annotations
export async function getAnnotations(paperId: string): Promise<Annotation[]> {
  return invoke("get_annotations", dualKeys({
    paper_id: paperId,
  }));
}

export async function createAnnotation(
  paperId: string,
  page: number | undefined,
  quote: string,
  note?: string,
  color?: string
): Promise<Annotation> {
  return invoke("create_annotation", dualKeys({
    paper_id: paperId,
    page: page ?? null,
    quote,
    note: note ?? null,
    color: color ?? null,
  }));
}

export async function updateAnnotation(
  id: string,
  quote: string,
  note?: string,
  color?: string
): Promise<void> {
  return invoke("update_annotation", dualKeys({
    id,
    quote,
    note: note ?? null,
    color: color ?? null,
  }));
}

export async function deleteAnnotation(id: string): Promise<void> {
  return invoke("delete_annotation", dualKeys({ id }));
}

// Templates
export async function getTemplates(): Promise<Template[]> {
  return invoke("get_templates");
}

export async function createTemplate(name: string): Promise<Template> {
  return invoke("create_template", dualKeys({ name }));
}

export async function updateTemplateFields(templateId: string, fields: TemplateField[]): Promise<void> {
  return invoke("update_template_fields", dualKeys({
    template_id: templateId,
    fields,
  }));
}

export async function deleteTemplate(id: string): Promise<void> {
  return invoke("delete_template", dualKeys({ id }));
}

export async function getExtractions(paperId: string, templateId: string): Promise<Extraction[]> {
  return invoke("get_extractions", dualKeys({
    paper_id: paperId,
    template_id: templateId,
  }));
}

export async function upsertExtraction(extraction: Extraction): Promise<void> {
  return invoke("upsert_extraction", dualKeys({ extraction }));
}

// Claims
export async function getClaims(collectionId: string): Promise<Claim[]> {
  return invoke("get_claims", dualKeys({
    collection_id: collectionId,
  }));
}

export async function createClaim(collectionId: string, text: string, origin: 'source' | 'user' | 'ai'): Promise<Claim> {
  return invoke("create_claim", dualKeys({
    collection_id: collectionId,
    text,
    origin,
  }));
}

export async function updateClaim(id: string, newText: string, reason?: string): Promise<void> {
  return invoke("update_claim", dualKeys({
    id,
    new_text: newText,
    reason: reason ?? null,
  }));
}

export async function deleteClaim(id: string): Promise<void> {
  return invoke("delete_claim", dualKeys({ id }));
}

export async function addClaimEvidence(
  claimId: string,
  paperId: string,
  annotationId: string | undefined,
  stance: 'supports' | 'contradicts' | 'qualifies'
): Promise<void> {
  return invoke("add_claim_evidence", dualKeys({
    claim_id: claimId,
    paper_id: paperId,
    annotation_id: annotationId ?? null,
    stance,
  }));
}

export async function removeClaimEvidence(id: string): Promise<void> {
  return invoke("remove_claim_evidence", dualKeys({ id }));
}

export async function getClaimRevisions(claimId: string): Promise<ClaimRevision[]> {
  return invoke("get_claim_revisions", dualKeys({
    claim_id: claimId,
  }));
}

// PDF
export async function uploadPdf(paperId: string, bytes: number[] | Uint8Array): Promise<string> {
  const byteArr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
  return invoke("upload_pdf", dualKeys({
    paper_id: paperId,
    bytes: byteArr,
  }));
}

export async function loadPdfBytes(paperId: string): Promise<Uint8Array> {
  const raw: number[] = await invoke("load_pdf_bytes", dualKeys({
    paper_id: paperId,
  }));
  return new Uint8Array(raw);
}

// Export files
export async function writeExportFile(path: string, bytes: number[] | Uint8Array): Promise<void> {
  const byteArr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
  return invoke("write_export_file", dualKeys({ path, bytes: byteArr }));
}

// Screening (include / exclude / maybe per paper, per collection, per stage)
export async function getScreening(collectionId: string): Promise<ScreeningDecision[]> {
  return invoke("get_screening", dualKeys({ collection_id: collectionId }));
}

/** An empty `decision` clears the paper's decision for that stage. */
export async function setScreening(
  collectionId: string,
  paperId: string,
  stage: ScreeningStage,
  decision: ScreeningChoice | "",
  reason?: string
): Promise<void> {
  return invoke("set_screening", dualKeys({
    collection_id: collectionId,
    paper_id: paperId,
    stage,
    decision,
    reason: reason ?? null,
  }));
}

// Search log / saved searches
export async function logSearch(
  query: string,
  filtersJson: string | undefined,
  found: number,
  uniqueCount: number,
  collectionId?: string
): Promise<SearchLogEntry> {
  return invoke("log_search", dualKeys({
    query,
    filters_json: filtersJson ?? null,
    found,
    unique_count: uniqueCount,
    collection_id: collectionId ?? null,
  }));
}

export async function getSearchLog(limit = 200): Promise<SearchLogEntry[]> {
  return invoke("get_search_log", dualKeys({ limit }));
}

export async function updateSearch(
  id: string,
  name: string | undefined,
  saved: boolean,
  collectionId?: string
): Promise<void> {
  return invoke("update_search", dualKeys({
    id,
    name: name ?? null,
    saved,
    collection_id: collectionId ?? null,
  }));
}

export async function updateSearchCounts(id: string, found: number, uniqueCount: number): Promise<void> {
  return invoke("update_search_counts", dualKeys({ id, found, unique_count: uniqueCount }));
}

export async function deleteSearch(id: string): Promise<void> {
  return invoke("delete_search", dualKeys({ id }));
}

// Citation metadata kept per saved paper
export async function getPaperMetas(): Promise<PaperMeta[]> {
  return invoke("get_paper_metas");
}

export async function setPaperMeta(
  paperId: string,
  citedByCount?: number,
  referencedWorks?: string[]
): Promise<void> {
  return invoke("set_paper_meta", dualKeys({
    paper_id: paperId,
    cited_by_count: citedByCount ?? null,
    referenced_json: referencedWorks ? JSON.stringify(referencedWorks) : null,
  }));
}

// Backup and restore
export async function createBackup(dir: string, appState: string): Promise<BackupInfo> {
  return invoke("create_backup", dualKeys({ dir, app_state: appState }));
}

export async function inspectBackup(dir: string): Promise<BackupInfo> {
  return invoke("inspect_backup", dualKeys({ dir }));
}

export async function restoreBackup(dir: string): Promise<RestoreResult> {
  return invoke("restore_backup", dualKeys({ dir }));
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const raw: number[] = await invoke("read_file_bytes", dualKeys({ path }));
  return new Uint8Array(raw);
}
