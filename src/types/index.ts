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
