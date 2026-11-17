export interface Paper {
  id: string;
  doi?: string;
  openalex_id?: string;
  title: string;
  year?: number;
  venue?: string;
  authors_json?: string;
  abstract?: string;
  oa_url?: string;
  pdf_path?: string;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
  created_at: string;
}

export interface Annotation {
  id: string;
  paper_id: string;
  page?: number;
  quote: string;
  note?: string;
  color?: string;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  fields: TemplateField[];
}

export interface TemplateField {
  id: string;
  template_id: string;
  name: string;
  position: number;
}

export interface Extraction {
  id: string;
  paper_id: string;
  field_id: string;
  value?: string;
  origin: 'source' | 'user' | 'ai';
  annotation_ids_json?: string;
  updated_at: string;
}

export interface Claim {
  id: string;
  collection_id: string;
  text: string;
  origin: 'source' | 'user' | 'ai';
  created_at: string;
  evidence: ClaimEvidence[];
  revisions: ClaimRevision[];
}

export interface ClaimEvidence {
  id: string;
  claim_id: string;
  paper_id: string;
  annotation_id?: string;
  stance: 'supports' | 'contradicts' | 'qualifies';
}

export interface ClaimRevision {
  id: string;
  claim_id: string;
  old_text: string;
  new_text: string;
  reason?: string;
  created_at: string;
}

export interface PaperResult {
  openalex_id: string;
  doi?: string;
  title: string;
  year?: number;
  venue?: string;
  authors: string[];
  abstract?: string;
  oa_url?: string;
  /** How many works cite this one (OpenAlex). */
  cited_by_count?: number;
  /** OpenAlex ids of the works this one cites. */
  referenced_works?: string[];
}

export type ScreeningStage = 'title_abstract' | 'full_text';
export type ScreeningChoice = 'include' | 'exclude' | 'maybe';

export interface ScreeningDecision {
  collection_id: string;
  paper_id: string;
  stage: ScreeningStage;
  decision: ScreeningChoice;
  reason?: string;
  updated_at: string;
}

export interface SearchLogEntry {
  id: string;
  query: string;
  filters_json?: string;
  found: number;
  unique_count: number;
  ran_at: string;
  saved: boolean;
  name?: string;
  collection_id?: string;
}

export interface PaperMeta {
  paper_id: string;
  cited_by_count?: number;
  referenced_json?: string;
  updated_at: string;
}

export interface WorkMeta {
  cited_by_count?: number;
  referenced_works: string[];
}

export interface CitationNode {
  openalex_id: string;
  title: string;
  year?: number;
  doi?: string;
}

export interface CitationGraph {
  center: CitationNode;
  references: CitationNode[];
  cited_by: CitationNode[];
}
