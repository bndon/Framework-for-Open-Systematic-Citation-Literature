# FOSCL — Assumptions & Implementation Decisions

This document records the architectural and engineering assumptions made during the transformation of FOSCL into a desktop research workspace.

---

### 1. SQLite Storage & App Data Location
- **Path**: Database file is stored at `{app_data_dir}/foscl/foscl.db` with WAL mode enabled (`PRAGMA journal_mode=WAL;`) and foreign keys enforced (`PRAGMA foreign_keys=ON;`).
- **PDF Storage**: Uploaded PDF files are saved locally to `{app_data_dir}/foscl/pdfs/{paper_id}.pdf`. The database stores the relative filename to prevent path breakage if the directory structure moves.
- **Privacy & Redistribution**: PDFs are strictly local to the user's desktop filesystem and are never transmitted, bundled, or published.

### 2. OpenAlex API & Abstract Reconstruction
- **Authentication**: OpenAlex public API does not require an API key for moderate search volumes. A polite `User-Agent: FOSCL/0.2 (mailto:foscl@example.com)` header is sent with all requests.
- **Abstract Reconstruction**: OpenAlex provides abstracts as an inverted index mapping words to arrays of character positions (`{"word": [0, 5, 12]}`). The Rust backend reconstructs the plaintext by sorting positions and joining tokens.
- **Caching**: All responses (keyword searches and DOI lookups) are cached in the SQLite `cache` table with a timestamp to reduce latency and respect API rate limits.
- **DOIs**: When OpenAlex does not contain an entry for an invalid DOI or when a network fault occurs, a clear error message is displayed without inventing text or metadata.

### 3. PDF Viewer & Annotations
- **Engine**: Rendered via `pdfjs-dist` (v4) with an active `TextLayer` canvas overlay to support natural cursor text selection.
- **Highlighting**: Users can highlight text by selecting passages in the PDF or by clicking "+ Manual Quote". Page numbers, quotes, and optional notes are saved directly to SQLite.
- **Fallback**: If a paper has no PDF uploaded, the user is provided an explicit upload button on the Paper Detail screen.

### 4. Extraction Templates & Comparison Table
- **Default Seeding**: Seeded at startup with the 10 required fields:
  1. Research question
  2. Methodology
  3. Dataset
  4. Sample size
  5. Proposed technique
  6. Evaluation metrics
  7. Main findings
  8. Limitations
  9. Future work
  10. Personal observations
- **Origin Provenance**: Every extracted value is tagged with an origin badge:
  - `Source` (green): Direct author statement / factual quote
  - `You` (blue): Manual synthesis or observation by the user
  - `AI (mock)` (yellow): Assisted proposal from the deterministic mock engine
- **Empty Cells**: Highlighted in light yellow/gold to direct attention to missing data points.

### 5. Mock AI Extraction Engine
- **Deterministic Rule**: As mandated by the brief, the mock engine proposes field values *strictly* derived from existing annotations of the selected paper.
- **Traceability**: Each proposal is attached to the specific annotation ID from which it was extracted.
- **Zero Hallucination**: If no annotations exist, the mock engine refuses to invent text and alerts the user to read and highlight the paper first.
- **Review Flow**: Suggestions are presented in a review modal labeled `"AI suggestion (mock)"` where the user must explicitly Accept or Reject each proposed value.

### 6. Research Lineage & Provenance
- **Immutable Revisions**: Changing a claim's text requires providing a reason. The original text, new text, timestamp, and explanation are saved to `claim_revisions` before updating the active record.
- **Stance Classification**: Evidence linked to a claim is categorized into `supports`, `contradicts`, or `qualifies`.

### 7. Export Generation
- **DOCX**: Generated in frontend memory using `docx` with styled tables, appendix highlights, and references, written to disk through the native Rust file command `write_export_file`.
- **PDF**: Generated using `pdfmake` in landscape orientation with full table layout and appendix, saved to the user's chosen location via the native file dialog.

### 8. Simulated & Concept Features
- **Access Hub**: Displays OpenAccess URLs and direct DOI links. "Purchase" opens a simulation modal showing sample prices ($8.99, $32.50, $120.00) marked with a prominent `[SIMULATED]` banner.
- **Conference Converter**: Lets the user select a DOCX manuscript and target style (IEEE / ACM / Springer) to preview structural heading mappings and missing sections. Clearly marked `[SIMULATED]` with a notice that official conference templates must be followed.
- **Subscription Tiers**: Static pricing cards (Free, Researcher $9.99, Group $29.99) labeled `[CONCEPT]`.

### 9. EPUB Reader Integration
- Preserved under the "Library reader (EPUB)" navigation item, keeping IndexedDB storage for EPUB blobs intact.
