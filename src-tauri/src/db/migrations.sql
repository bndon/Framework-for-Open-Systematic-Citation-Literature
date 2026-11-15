CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    doi TEXT UNIQUE,
    openalex_id TEXT,
    title TEXT NOT NULL,
    year INTEGER,
    venue TEXT,
    authors_json TEXT,
    abstract TEXT,
    oa_url TEXT,
    pdf_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_papers (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, paper_id)
);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page INTEGER,
    quote TEXT NOT NULL,
    note TEXT,
    color TEXT DEFAULT '#FFEB3B',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_fields (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS extractions (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL REFERENCES template_fields(id) ON DELETE CASCADE,
    value TEXT,
    origin TEXT NOT NULL CHECK (origin IN ('source','user','ai')),
    annotation_ids_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('source','user','ai')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claim_evidence (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
    stance TEXT NOT NULL CHECK (stance IN ('supports','contradicts','qualifies'))
);

CREATE TABLE IF NOT EXISTS claim_revisions (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    old_text TEXT NOT NULL,
    new_text TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO templates (id, name) VALUES ('default', 'Research Extraction');
INSERT OR IGNORE INTO template_fields (id, template_id, name, position) VALUES
    ('f-rq','default','Research question',0),
    ('f-meth','default','Methodology',1),
    ('f-data','default','Dataset',2),
    ('f-ss','default','Sample size',3),
    ('f-tech','default','Proposed technique',4),
    ('f-eval','default','Evaluation metrics',5),
    ('f-find','default','Main findings',6),
    ('f-lim','default','Limitations',7),
    ('f-fut','default','Future work',8),
    ('f-obs','default','Personal observations',9);
