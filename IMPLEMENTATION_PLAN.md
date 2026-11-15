# FOSCL — Implementation Plan

> **Goal**: Transform the existing FOSCL EPUB reader into a research workspace.
> **Deadline**: 3 days (Oct 28 – Oct 30).
> **Approach**: Working prototype, not production software.

---

## 1. Existing Codebase Audit

| What exists | Details |
|---|---|
| **Frontend** | Vanilla TypeScript + Vite, no framework. ~1 234 lines `main.ts`, ~950 lines `reader.ts`, ~830 lines `epub.ts`, ~600 lines `notes.ts`, ~2 250 lines `styles.css`. |
| **Backend (Rust)** | Minimal `lib.rs` with only a `greet` command. Tauri 2, `tauri-plugin-opener`. |
| **Storage** | `localStorage` for book metadata, shelves, notes. `IndexedDB` for raw EPUB blobs (`db.ts`). |
| **Dependencies** | Frontend: `@tauri-apps/api`, `jszip`. Rust: `tauri`, `serde`, `serde_json`, `tauri-plugin-opener`. |
| **Brand assets** | No `/assets` directory yet. Palette colours noted in brief. |
| **Config** | `tsconfig.json` (ES2020, strict), `vite.config.ts` (port 1420). |

### What we keep
- EPUB reader flow (`epub.ts`, `reader.ts`) preserved in a "Library reader (EPUB)" screen.
- `IndexedDB` wrapper (`db.ts`) stays for EPUB blob storage.
- Tauri config, icons, build pipeline.
- FOSCL brand name, palette, window title.

### What changes
- Frontend migrated from vanilla TS to **React 19 + TypeScript**.
- `localStorage`/`IndexedDB` metadata replaced by **SQLite** (Rust-side).
- All network calls (OpenAlex) run in **Rust** (reqwest).
- PDF rendering via **pdfjs-dist** in the frontend.
- Exports via **docx** and **pdfmake** npm packages (bytes sent to Rust for file write).

---

## 2. Target File Tree

```
foscl/
├── assets/                          # Brand files (created)
│   ├── foscl-icon.png
│   └── foscl-wordmark.svg
├── public/
│   └── pdf.worker.min.mjs           # pdf.js web worker (copied from pdfjs-dist)
├── index.html                       # React mount point (rewritten)
├── package.json                     # + react, react-dom, react-router-dom,
│                                    #   pdfjs-dist, docx, pdfmake, @tauri-apps/plugin-dialog
├── tsconfig.json                    # + jsx: "react-jsx"
├── vite.config.ts                   # + @vitejs/plugin-react
├── src/
│   ├── main.tsx                     # React entry, createRoot
│   ├── App.tsx                      # Router, layout shell, sidebar
│   ├── App.css                      # Global styles (migrated from styles.css)
│   │
│   ├── components/                  # Shared UI
│   │   ├── Sidebar.tsx              # Left nav with FOSCL branding
│   │   ├── OriginBadge.tsx          # "Source" / "You" / "AI (mock)" badge
│   │   ├── SimulatedBadge.tsx       # "Simulated" / "Concept" label
│   │   ├── Modal.tsx                # Generic modal wrapper
│   │   ├── EmptyState.tsx           # Placeholder for empty lists
│   │   └── ConfirmDialog.tsx        # Confirm delete / destructive actions
│   │
│   ├── screens/
│   │   ├── Discover.tsx             # P1 – OpenAlex search & DOI lookup
│   │   ├── Library.tsx              # P1 – Collections + papers list
│   │   ├── PaperDetail.tsx          # P1 – Single paper metadata + PDF upload
│   │   ├── Reader.tsx               # P1 – PDF viewer (pdfjs-dist) + annotations panel
│   │   ├── EpubLibrary.tsx          # Existing EPUB library (kept, labeled)
│   │   ├── EpubReader.tsx           # Existing EPUB reader (kept, labeled)
│   │   ├── Templates.tsx            # P1 – Template editor
│   │   ├── ComparisonTable.tsx      # P1 – Papers × fields matrix
│   │   ├── Export.tsx               # P1 – DOCX + PDF export screen
│   │   ├── Lineage.tsx              # P2 – Claims, evidence, revisions
│   │   ├── CitationGraph.tsx        # P2 – (stretch) React Flow graph
│   │   ├── AccessHub.tsx            # P2 – Simulated marketplace
│   │   ├── ConferenceConverter.tsx  # P2 – Simulated converter
│   │   └── Pricing.tsx              # P2 – Static concept page
│   │
│   ├── lib/                         # Typed Tauri invoke() wrappers
│   │   ├── api.ts                   # invoke() helpers with typed args/returns
│   │   ├── openalex.ts              # searchPapers(), lookupDoi()
│   │   ├── db.ts                    # collections, papers, annotations CRUD
│   │   ├── pdf.ts                   # uploadPdf(), loadPdfBytes()
│   │   ├── files.ts                 # writeExportFile()
│   │   └── extraction.ts           # Mock AI provider
│   │
│   ├── types/
│   │   └── index.ts                 # All shared TS types
│   │
│   └── epub/                        # Existing EPUB modules (kept mostly intact)
│       ├── epub.ts
│       ├── epubDb.ts                # Renamed from db.ts
│       ├── bookStorage.ts
│       ├── contextMenu.ts
│       ├── notes.ts
│       ├── reader.ts
│       ├── recent.ts
│       └── epubTypes.ts             # Book, Note, EpubChapter, etc.
│
├── src-tauri/
│   ├── Cargo.toml                   # + rusqlite(bundled), reqwest(json),
│   │                                #   tauri-plugin-dialog, uuid, tokio
│   ├── tauri.conf.json              # Window 1280×800, title "FOSCL"
│   ├── capabilities/
│   │   └── default.json             # + dialog:default, custom commands
│   │
│   └── src/
│       ├── main.rs                  # (unchanged)
│       ├── lib.rs                   # Builder: plugins, invoke_handler, setup (run migrations)
│       ├── models.rs                # Rust structs (Paper, Collection, Annotation, etc.)
│       │
│       ├── db/
│       │   ├── mod.rs               # DbState (Mutex<Connection>), init_db()
│       │   └── migrations.sql       # All CREATE TABLE statements
│       │
│       └── commands/
│           ├── mod.rs               # re-exports
│           ├── papers.rs            # CRUD papers
│           ├── collections.rs       # CRUD collections + collection_papers
│           ├── annotations.rs       # CRUD annotations
│           ├── templates.rs         # CRUD templates + fields + extractions
│           ├── claims.rs            # CRUD claims, evidence, revisions
│           ├── openalex.rs          # search_openalex(), lookup_doi(), fetch_citations()
│           ├── pdf.rs               # upload_pdf(), load_pdf_bytes()
│           └── files.rs             # write_export_file()
```

---

## 3. SQLite Schema

```sql
-- Run at app startup via lib.rs setup()

CREATE TABLE IF NOT EXISTS papers (
    id          TEXT PRIMARY KEY,
    doi         TEXT UNIQUE,
    openalex_id TEXT,
    title       TEXT NOT NULL,
    year        INTEGER,
    venue       TEXT,
    authors_json TEXT,          -- JSON array of {name, orcid?}
    abstract    TEXT,
    oa_url      TEXT,
    pdf_path    TEXT,           -- relative path inside app data dir
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collections (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_papers (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    paper_id      TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, paper_id)
);

CREATE TABLE IF NOT EXISTS annotations (
    id         TEXT PRIMARY KEY,
    paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page       INTEGER,
    quote      TEXT NOT NULL,
    note       TEXT,
    color      TEXT DEFAULT '#FFEB3B',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_fields (
    id          TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS extractions (
    id                TEXT PRIMARY KEY,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    field_id          TEXT NOT NULL REFERENCES template_fields(id) ON DELETE CASCADE,
    value             TEXT,
    origin            TEXT NOT NULL CHECK (origin IN ('source','user','ai')),
    annotation_ids_json TEXT,  -- JSON array of annotation IDs used
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
    id            TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    text          TEXT NOT NULL,
    origin        TEXT NOT NULL CHECK (origin IN ('source','user','ai')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claim_evidence (
    id            TEXT PRIMARY KEY,
    claim_id      TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    paper_id      TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
    stance        TEXT NOT NULL CHECK (stance IN ('supports','contradicts','qualifies'))
);

CREATE TABLE IF NOT EXISTS claim_revisions (
    id         TEXT PRIMARY KEY,
    claim_id   TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    old_text   TEXT NOT NULL,
    new_text   TEXT NOT NULL,
    reason     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default template
INSERT OR IGNORE INTO templates (id, name) VALUES ('default', 'Research Extraction');

-- Default template fields
INSERT OR IGNORE INTO template_fields (id, template_id, name, position) VALUES
    ('f-rq',   'default', 'Research question',      0),
    ('f-meth', 'default', 'Methodology',            1),
    ('f-data', 'default', 'Dataset',                2),
    ('f-ss',   'default', 'Sample size',            3),
    ('f-tech', 'default', 'Proposed technique',     4),
    ('f-eval', 'default', 'Evaluation metrics',     5),
    ('f-find', 'default', 'Main findings',          6),
    ('f-lim',  'default', 'Limitations',            7),
    ('f-fut',  'default', 'Future work',            8),
    ('f-obs',  'default', 'Personal observations',  9);
```

---

## 4. Tauri Commands

| Command | Module | Args | Returns | Notes |
|---|---|---|---|---|
| `search_openalex` | openalex.rs | `query: String, page: u32` | `Vec<PaperResult>` | GET `/works?search=`, cache response |
| `lookup_doi` | openalex.rs | `doi: String` | `PaperResult` | GET `/works/doi:`, cache |
| `fetch_citations` | openalex.rs | `openalex_id: String` | `CitationGraph` | referenced_works + cited_by (P2) |
| `get_papers` | papers.rs | — | `Vec<Paper>` | All papers |
| `get_paper` | papers.rs | `id: String` | `Paper` | Single paper |
| `upsert_paper` | papers.rs | `Paper` | `Paper` | Insert or update |
| `delete_paper` | papers.rs | `id: String` | `()` | Cascade deletes |
| `get_collections` | collections.rs | — | `Vec<Collection>` | |
| `create_collection` | collections.rs | `name: String` | `Collection` | |
| `rename_collection` | collections.rs | `id, name` | `()` | |
| `delete_collection` | collections.rs | `id: String` | `()` | |
| `add_paper_to_collection` | collections.rs | `collection_id, paper_id` | `()` | |
| `remove_paper_from_collection` | collections.rs | `collection_id, paper_id` | `()` | |
| `get_collection_papers` | collections.rs | `collection_id: String` | `Vec<Paper>` | |
| `get_annotations` | annotations.rs | `paper_id: String` | `Vec<Annotation>` | |
| `create_annotation` | annotations.rs | `Annotation` (no id) | `Annotation` | |
| `update_annotation` | annotations.rs | `Annotation` | `()` | |
| `delete_annotation` | annotations.rs | `id: String` | `()` | |
| `get_templates` | templates.rs | — | `Vec<Template>` | With fields |
| `create_template` | templates.rs | `name: String` | `Template` | |
| `update_template_fields` | templates.rs | `template_id, fields[]` | `()` | Bulk replace |
| `delete_template` | templates.rs | `id: String` | `()` | |
| `get_extractions` | templates.rs | `paper_id, template_id` | `Vec<Extraction>` | |
| `upsert_extraction` | templates.rs | `Extraction` | `()` | |
| `get_claims` | claims.rs | `collection_id: String` | `Vec<Claim>` | With evidence |
| `create_claim` | claims.rs | `text, collection_id, origin` | `Claim` | |
| `update_claim` | claims.rs | `id, new_text, reason` | `()` | Stores revision |
| `delete_claim` | claims.rs | `id: String` | `()` | |
| `add_claim_evidence` | claims.rs | `ClaimEvidence` | `()` | |
| `remove_claim_evidence` | claims.rs | `id: String` | `()` | |
| `get_claim_revisions` | claims.rs | `claim_id: String` | `Vec<Revision>` | |
| `upload_pdf` | pdf.rs | `paper_id: String, bytes: Vec<u8>` | `String` (path) | Copies to app data |
| `load_pdf_bytes` | pdf.rs | `paper_id: String` | `Vec<u8>` | Read file |
| `write_export_file` | files.rs | `path: String, bytes: Vec<u8>` | `()` | Save dialog path |

---

## 5. Day-by-Day Checklist

### Day 1 (Oct 28) — Foundation + Discovery + Collections

- [ ] **Migrate frontend to React**
  - Install `react`, `react-dom`, `react-router-dom`, `@vitejs/plugin-react`
  - Rewrite `index.html` (single `<div id="root">`)
  - Create `main.tsx`, `App.tsx` with sidebar layout + router
  - Migrate `styles.css` → `App.css` (keep palette, adapt for new layout)
  - Move EPUB code into `src/epub/` folder (keep functional)

- [ ] **Rust backend core**
  - Add `rusqlite` (bundled), `reqwest` (json), `tauri-plugin-dialog`, `uuid`, `tokio` to Cargo.toml
  - Create `db/mod.rs` — connection init, run `migrations.sql`
  - Create `models.rs` — all serde structs
  - Wire up `lib.rs` with `setup()` hook to init DB

- [ ] **OpenAlex commands**
  - `commands/openalex.rs` — search + DOI lookup + abstract reconstruction
  - Response caching in `cache` table
  - Error handling for invalid DOIs, network failures

- [ ] **Discover screen**
  - Search bar, results list with title/authors/year/venue/DOI/abstract
  - "Save to collection" action per result
  - DOI lookup tab

- [ ] **Collections CRUD**
  - `commands/collections.rs` + `commands/papers.rs`
  - Library screen: list collections, papers in each, add/remove

### Day 2 (Oct 29) — PDF + Annotations + Templates + Comparison + Export

- [ ] **PDF upload & reader**
  - `commands/pdf.rs` — copy file to app data, load bytes
  - Install `pdfjs-dist`, configure worker
  - `Reader.tsx` — render PDF pages with text layer
  - Annotation creation: select text → highlight → add note

- [ ] **Annotations panel**
  - Side panel listing annotations for current paper
  - Edit / delete annotations
  - Page number, quote, note display

- [ ] **Templates & extraction**
  - `commands/templates.rs` — CRUD templates + fields
  - `Templates.tsx` — editor for fields (add, rename, reorder, delete)
  - `commands/templates.rs` — extraction CRUD

- [ ] **Comparison table**
  - `ComparisonTable.tsx` — matrix view (papers × fields)
  - Origin badges on every cell
  - Highlight empty cells

- [ ] **Export**
  - Install `docx`, `pdfmake`
  - `Export.tsx` — generate DOCX and PDF with title, table, annotations, refs
  - `commands/files.rs` — write bytes to chosen path
  - Use `tauri-plugin-dialog` save dialog

### Day 3 (Oct 30) — P2 Features + Polish + Demo Test

- [ ] **Research Lineage**
  - `commands/claims.rs` — claims, evidence, revisions
  - `Lineage.tsx` — claim list, evidence links, revision timeline
  - Stance badges: supports / contradicts / qualifies

- [ ] **Mock AI extraction**
  - `lib/extraction.ts` — deterministic mock provider
  - UI: "AI suggestion (mock)" labels, accept/reject flow
  - Reject without valid annotation ID

- [ ] **Citation graph** (stretch)
  - `fetch_citations` command
  - `CitationGraph.tsx` — React Flow or placeholder

- [ ] **Simulated features**
  - `AccessHub.tsx` — DOI link + OA URL + mock "purchase" modal → "Simulated"
  - `ConferenceConverter.tsx` — pick DOCX, choose template, checklist → "Simulated"
  - `Pricing.tsx` — static tiers → "Concept"

- [ ] **EPUB reader integration**
  - `EpubLibrary.tsx` + `EpubReader.tsx` — port existing code into React
  - Label as "Library reader (EPUB)"

- [ ] **Final testing — Demo Script**
  1. Search "network intrusion detection" → results shown
  2. Save 3 papers → "NIDS review" collection
  3. Upload PDF → highlight passage
  4. Comparison table → fill fields → origin badges
  5. Mock AI suggestion → accept one
  6. Create claim → link evidence → revise → Lineage view
  7. Export DOCX + PDF → both open
  8. Access Hub + Conference Converter → "Simulated" badges

---

## 6. Key Dependencies to Add

### Frontend (npm)
| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@vitejs/plugin-react` | Vite React support |
| `@tauri-apps/plugin-dialog` | File open/save dialogs (frontend API) |
| `pdfjs-dist` | PDF rendering with text selection |
| `docx` | DOCX generation |
| `pdfmake` | PDF generation with tables |

### Backend (Cargo)
| Crate | Purpose |
|---|---|
| `rusqlite` (features: `bundled`) | SQLite database |
| `reqwest` (features: `blocking`, `json`) | HTTP client for OpenAlex |
| `tauri-plugin-dialog` | Native file dialogs |
| `uuid` (features: `v4`) | ID generation |

---

## 7. Assumptions

| # | Assumption |
|---|---|
| A1 | **No `/assets` directory exists** — brand files (icon, wordmark) will be created as simple SVG/PNG placeholders using the FOSCL palette. |
| A2 | **OpenAlex is free, no API key needed** — just polite headers (`mailto:` in User-Agent). |
| A3 | **PDF.js worker** — bundled worker from `pdfjs-dist` copied to `/public`. |
| A4 | **No git** — no version control steps, local-only. |
| A5 | **EPUB reader** — kept in a separate "EPUB Library" screen accessible from the sidebar. Not deeply integrated with the research workflow but functional. |
| A6 | **React migration** — existing vanilla TS code for EPUB will be wrapped in React components (useEffect for init, refs for DOM) rather than fully rewritten. |
| A7 | **SQLite path** — database file stored at `{app_data_dir}/foscl/foscl.db`. |
| A8 | **PDF storage** — files copied to `{app_data_dir}/foscl/pdfs/{paper_id}.pdf`. |
| A9 | **Export files** — written to user-chosen path via save dialog. |
| A10 | **reqwest** — will use blocking client inside `tauri::command` (Tauri runs commands on a thread pool so blocking is fine). No need for full `tokio`. |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| React migration takes too long | Keep EPUB code as a thin React wrapper; focus React effort on new screens |
| PDF.js text selection is flaky | Fall back to manual quote entry for annotations |
| OpenAlex rate limits | Cache aggressively; show clear errors |
| `pdfmake` table formatting | Keep tables simple; test early on Day 2 |
| Day 3 overrun on P2 features | Conference converter and citation graph are explicitly "Simulated" placeholders |
| `rusqlite` bundled compile time | First `cargo build` will be slow (~2-3 min). Subsequent builds fast. |
