# FOSCL Developer & Codebase Guide

This document is a complete reference of the entire **FOSCL** codebase (`d:\Projects lol\foscl new\Venture\foscl`). It explains what every file and function does, how data flows, and step-by-step instructions for modifying any part of the app.

---

## Table of Contents
1. [Architecture & Data Flow](#1-architecture--data-flow)
2. [File Directory & Responsibilities](#2-file-directory--responsibilities)
3. [Complete Function Reference](#3-complete-function-reference)
4. [How-To Guides: "If I Want to Change X..."](#4-how-to-guides-if-i-want-to-change-x)
   - [How to Edit or Add Themes](#how-to-edit-or-add-themes)
   - [How Navigation Works & How to Change It](#how-navigation-works--how-to-change-it)
   - [How to Modify the Bento Grid Dashboard](#how-to-modify-the-bento-grid-dashboard)
   - [How to Customize the Discover Screen](#how-to-customize-the-discover-screen)
   - [How to Customize the Knowledge Graph](#how-to-customize-the-knowledge-graph)
   - [How to Add a New Screen & Route](#how-to-add-a-new-screen--route)
   - [How to Modify Backend API & Database Calls](#how-to-modify-backend-api--database-calls)
5. [Running, Building, and Debugging](#5-running-building-and-debugging)

---

## 1. Architecture & Data Flow

FOSCL is a desktop application built with **Tauri 2 (Rust backend)** and **React 18 + TypeScript + Vite (Frontend)**.

```
index.html
   ↓
src/main.tsx  (Loads App.css, styles.css, applies persisted theme)
   ↓
src/App.tsx   (BrowserRouter, global QuarterCircleNav, ToastContainer, Routes)
   ↓
src/screens/* (Individual workspace views: Dashboard, Discover, Library, etc.)
   ↓
src/lib/api.ts (Tauri invoke bridge or OpenAlex REST fetcher)
   ↓
Rust Backend / SQLite / IndexedDB
```

* **Desktop Native Bridge:** Tauri exposes Rust commands invoked via `@tauri-apps/api/core` (`invoke("command_name", args)`).
* **OpenAlex API:** Direct HTTPS REST queries to `https://api.openalex.org/works` for academic paper searches.
* **Storage Engines:**
  - **SQLite (Tauri plugin):** Stores papers, collections, annotations, claims, and templates.
  - **IndexedDB (`db.ts`):** Stores imported `.epub` book binaries and reading states.
  - **LocalStorage (`settings.ts`):** Stores active theme, graph visualization physics, and user preferences.

---

## 2. File Directory & Responsibilities

### Core Application Shell
| File | What It Does |
|---|---|
| `src/main.tsx` | Entry point. Mounts the React root, imports `App.css` and `styles.css`, and immediately executes `applyAppTheme()` to prevent flash of unstyled content. |
| `src/App.tsx` | Main application shell. Defines all `react-router-dom` routes (`/`, `/discover`, `/library`, etc.), mounts `<QuarterCircleNav />` and `<ToastContainer />`. |
| `src/styles.css` | **Central Design System.** Contains all CSS variable definitions for all 9 color themes (`night`, `cream`, `sepia`, `dusk`, `mint`, `citrus`, `navy`, `forest`, `stone`), typography, and global utility classes. |
| `src/App.css` | Fallback legacy variables, base element resets, and PDF.js text layer selection styles. |
| `src/types/index.ts` | TypeScript interface definitions for core domain models (`Paper`, `Collection`, `Claim`, `Annotation`, `Template`, `Extraction`, etc.). |

---

### Navigation & Reusable Components (`src/components/`)
| File | What It Does |
|---|---|
| `QuarterCircleNav.tsx` | Floating top-left quarter-circle control (`[F] MENU`). On click or `Ctrl+K`/`⌘K`, expands into a glassmorphic quick navigator for instant jumping between workspace modules. |
| `Sidebar.tsx` | The classic vertical sidebar containing workspace navigation links, collection trees, and EPUB books. (Can be toggled via `Ctrl+\`). |
| `ForceGraphView.tsx` | HTML5 Canvas 2D physics force-directed graph renderer. Renders rounded squircle nodes, directional link arrows, active halos, icons, text labels, and pan/zoom transforms. |
| `Modal.tsx` | Generic accessible modal overlay dialog. |
| `ConfirmDialog.tsx` | Confirmation modal for destructive actions (e.g., deleting a paper or collection). |
| `OriginBadge.tsx` | Visual pill tag showing where data originated: `source` (green), `user` (blue), or `ai` (purple). |
| `SimulatedBadge.tsx` | Pill tags indicating simulated features (`Sim` or `Concept`). |
| `Toast.tsx` / `ToastContainer.tsx` | Non-blocking toast notification banner system. |

---

### Workspace Screens (`src/screens/`)
| File | Route | What It Does |
|---|---|---|
| `Dashboard.tsx` | `/` | Bento Grid Home Dashboard. Full-bleed grid of cards linking to all workspace modules with live paper/collection counts. |
| `Discover.tsx` | `/discover` | Academic literature search via OpenAlex. Dual-pane layout: paper list with checkboxes on left; multi-tab workspace (Lineage Timeline, Compare Matrix, Reader) on right. |
| `Library.tsx` | `/library` | Saved papers repository grouped by collections. Supports PDF upload, filtering, and paper deletion. |
| `PaperDetail.tsx` | `/paper/:paperId` | Detailed paper inspection: metadata, abstract, structured field extractions, and linked claims. |
| `Reader.tsx` | `/reader/:paperId` | Full-screen academic PDF reader with text selection, annotations, and quotation capture. |
| `ComparisonTable.tsx` | `/compare` | Cross-paper extraction matrix comparing methodologies, variables, and empirical findings. Includes a side chat panel. |
| `Lineage.tsx` | `/lineage` | Research lineage view tracking claims, revisions, and evidence links (`supports`, `contradicts`, `qualifies`). |
| `KnowledgeGraph.tsx` | `/graph` | Obsidian-style interactive force-directed graph connecting papers, collections, and hypotheses. |
| `CitationGraph.tsx` | `/citations` | Citation tree network exploring upstream foundational references and downstream citing papers. |
| `Templates.tsx` | `/templates` | Custom extraction schema builder. Add, remove, and reorder fields extracted from papers. |
| `Export.tsx` | `/export` | Formatted synthesis exporter generating Microsoft Word (`.docx`) or landscape PDF (`.pdf`) documents. |
| `AccessHub.tsx` | `/access-hub` | Direct DOI resolver, Open Access verification, and simulated institutional purchasing. |
| `ConferenceConverter.tsx` | `/converter` | Manuscript `.docx` analyzer checking formatting against IEEE, ACM, and Springer LNCS guidelines. |
| `Pricing.tsx` | `/pricing` | Tier comparison table for subscription plans (Concept/Simulated). |
| `EpubLibrary.tsx` | `/epub` | Local EPUB book reader archive backed by IndexedDB storage. |
| `Settings.tsx` | `/settings` | Visual color theme selector (9 palettes) and workspace preferences. |

---

### Logic, APIs, & Settings (`src/lib/`)
| File | What It Does |
|---|---|
| `api.ts` | Bridge layer for backend calls. Contains OpenAlex REST search functions and Tauri IPC invocations for papers, collections, claims, annotations, and templates. |
| `settings.ts` | LocalStorage persistence manager for graph physics, active theme, sidebar state, and reader zoom. |
| `extraction.ts` | Utility heuristics for suggesting extraction fields based on paper venue and title. |
| `toast.ts` | Event emitter system for triggering success/error toasts throughout the app. |

---

### EPUB & Offline Reader Engine (`src/`)
| File | What It Does |
|---|---|
| `db.ts` | IndexedDB manager for storing raw `.epub` binary blobs locally in the browser/webview. |
| `bookStorage.ts` | Manages bookshelf categorization and note folder hierarchies. |
| `epub.ts` | Client-side EPUB parser (unzips container, parses OPF metadata, extracts NCX table of contents, and streams chapter HTML). |
| `reader.ts` | EPUB reading engine: handles pagination, font size, theme switching, and jump-to-page. |
| `notes.ts` | EPUB book note taker with Markdown export. |
| `recent.ts` | Tracking recently opened EPUB books and reading positions. |
| `contextMenu.ts` | Right-click context menu handling inside the EPUB reader. |

---

## 3. Complete Function Reference

### `src/lib/api.ts` (Data & Tauri IPC)
* `searchOpenAlex(query: string, page?: number): Promise<PaperResult[]>`
  Searches OpenAlex API for works matching `query`. Returns title, authors, year, venue, abstract, citations, and OA status.
* `lookupDoi(doi: string): Promise<PaperResult | null>`
  Direct DOI lookup on OpenAlex.
* `fetchCitations(openalexId: string): Promise<CitationGraph>`
  Fetches upstream literature references and downstream works citing the given work ID.
* `getPapers(): Promise<Paper[]>`
  Retrieves all saved papers from local SQLite database.
* `getPaper(id: string): Promise<Paper | null>`
  Retrieves a single paper by its database UUID.
* `upsertPaper(paper: Partial<Paper> & { title: string }): Promise<Paper>`
  Inserts a new paper or updates an existing paper record.
* `deletePaper(id: string): Promise<void>`
  Deletes paper and associated annotations/extractions.
* `getCollections(): Promise<Collection[]>`
  Retrieves all topic collections.
* `createCollection(name: string): Promise<Collection>`
  Creates a new topic collection folder.
* `renameCollection(id: string, name: string): Promise<void>`
  Renames a collection.
* `deleteCollection(id: string): Promise<void>`
  Deletes collection and unlinks papers.
* `addPaperToCollection(collectionId: string, paperId: string): Promise<void>`
  Links a paper to a collection.
* `removePaperFromCollection(collectionId: string, paperId: string): Promise<void>`
  Unlinks a paper from a collection.
* `getCollectionPapers(collectionId: string): Promise<Paper[]>`
  Gets all papers belonging to a specific collection.
* `getAnnotations(paperId: string): Promise<Annotation[]>`
  Gets user highlights and notes on a paper.
* `createAnnotation(annotation: Omit<Annotation, "id" | "created_at">): Promise<Annotation>`
  Saves a highlighted text passage.
* `deleteAnnotation(id: string): Promise<void>`
  Removes a highlight note.
* `getTemplates(): Promise<Template[]>`
  Loads all extraction templates.
* `createTemplate(name: string, fieldNames: string[]): Promise<Template>`
  Creates a template with an initial set of field names.
* `updateTemplateFields(templateId: string, fields: { name: string; position: number }[]): Promise<void>`
  Reorders or updates field names in a template schema.
* `getExtractions(collectionId: string, templateId: string): Promise<Extraction[]>`
  Loads table cells for the Comparison Matrix.
* `upsertExtraction(extraction: Omit<Extraction, "id" | "updated_at">): Promise<Extraction>`
  Saves or edits a matrix cell value.
* `getClaims(collectionId: string): Promise<Claim[]>`
  Retrieves all claims and linked evidence for a collection.
* `createClaim(collectionId: string, text: string, origin: "source" | "user" | "ai"): Promise<Claim>`
  Creates a synthesis claim.
* `addClaimEvidence(claimId: string, paperId: string, stance: "supports" | "contradicts" | "qualifies", annotationId?: string): Promise<void>`
  Links a paper excerpt to a claim with an empirical stance.
* `uploadPdf(paperId: string, fileBytes: Uint8Array, fileName: string): Promise<string>`
  Saves a PDF file locally to the app data directory.
* `loadPdfBytes(pdfPath: string): Promise<Uint8Array>`
  Reads local PDF file bytes for rendering inside `<Reader />`.
* `writeExportFile(filePath: string, data: Uint8Array): Promise<void>`
  Saves exported `.docx` or `.pdf` file to user's disk.

---

### `src/lib/settings.ts` (Theme & Preferences)
* `loadAppTheme(): AppTheme`
  Reads `foscl:app_theme` from `localStorage`. Defaults to `"night"`.
* `saveAppTheme(theme: AppTheme): void`
  Saves theme ID to `localStorage` and calls `applyAppTheme(theme)`.
* `applyAppTheme(theme: AppTheme): void`
  Sets `<html data-theme="...">` attribute on `document.documentElement`, triggering CSS variable updates in `styles.css`.
* `loadGraphSettings(): GraphSettings` / `saveGraphSettings(settings: Partial<GraphSettings>): GraphSettings`
  Loads and saves physics parameters for the Knowledge Graph (forces, link distance, node sizing, filters).
* `loadSidebarCollapsed(): boolean` / `saveSidebarCollapsed(collapsed: boolean): void`
  Remembers if the classic sidebar was collapsed.

---

## 4. How-To Guides: "If I Want to Change X..."

### How to Edit or Add Themes
All theme colors live in `src/styles.css`. Each theme is defined on `:root[data-theme="THEME_NAME"]`.

1. **To change colors of an existing theme (e.g. `forest`):**
   Open `src/styles.css` around line 150:
   ```css
   :root[data-theme="forest"] {
     --bg: #092122;              /* App background */
     --panel: #161e1c;           /* Card & panel surfaces */
     --panel-dark: #0a110f;      /* Secondary dark headers/footers */
     --text-main: #e8f2e0;       /* Primary text */
     --text-muted: #7a9870;      /* Muted secondary labels */
     --accent: #E2F3A9;          /* Primary highlight / buttons */
     --signal: #FEF8F0;          /* Secondary accent */
     --border: #1c2820;          /* Card & divider borders */
     --nav-active-bg: #182018;   /* Active selection backgrounds */
     --nav-active-border: #235354;
   }
   ```
   Edit any hex code. The changes take effect immediately across all screens.

2. **To add a completely new theme:**
   - In `src/lib/settings.ts`, add the new name to `AppTheme` union type:
     ```typescript
     export type AppTheme = "night" | "cream" | ... | "mytheme";
     ```
   - In `src/styles.css`, append a new token block:
     ```css
     :root[data-theme="mytheme"] {
       --bg: #101014;
       --panel: #1c1c24;
       --panel-dark: #14141a;
       --text-main: #f0f0f5;
       --text-muted: #8888a0;
       --accent: #6366f1;
       --signal: #f59e0b;
       --border: #2c2c38;
       --nav-active-bg: #282836;
       --nav-active-border: #4f46e5;
     }
     ```
   - In `src/screens/Settings.tsx`, add an entry to the `THEMES` array with your swatches and descriptions.

---

### How Navigation Works & How to Change It
FOSCL uses a modern border-to-border layout without a fixed sidebar. Navigation is controlled by two files:

* **Trigger & Modal:** `src/components/QuarterCircleNav.tsx`
  - Located at top-left (`fixed; top: 0; left: 0`).
  - To change what appears in the quick launcher, edit the `NAV_ACTIONS` array at the top of `QuarterCircleNav.tsx`. You can add new buttons, change icons, routes, or category filters.
* **Routes:** `src/App.tsx`
  - All valid URL paths are mapped inside `<Routes>`.
  - To bring back the classic collapsible sidebar, simply uncomment or re-add `<Sidebar />` inside `src/App.tsx` next to `<main>`.

---

### How to Modify the Bento Grid Dashboard
The Bento Grid is rendered by `src/screens/Dashboard.tsx`:

1. **To change the grid layout:**
   Look at the grid container around line 130:
   ```tsx
   gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.1fr",
   gridTemplateRows: "1.2fr 1fr 1fr",
   gap: "16px",
   ```
   Adjust the column/row fractions to change proportions.
2. **To move or resize a card:**
   Each card sets `gridColumn` and `gridRow`. For example, `gridColumn: "1 / span 2"` makes a card 2 columns wide.
3. **To add a new card:**
   Duplicate any card `<div>`, set its `gridColumn` and `gridRow`, and call `navigate("/your-route")` on click.

---

### How to Customize the Discover Screen
The Discover screen is in `src/screens/Discover.tsx`:

* **OpenAlex Search Query:** Look at `handleSearch` (around line 90). It calls `searchOpenAlex(clean, 1)`. To search by author, venue, or concept, pass OpenAlex filter parameters.
* **Left / Right Pane Proportions:**
  - Left paper list is styled with `flex: "0 0 38%"`.
  - Right tab workspace is styled with `flex: 1`.
  - Change `38%` to any percentage you prefer.
* **Tabs:** The right panel switches between `"lineage"`, `"matrix"`, and `"reader"`. The tabs are rendered conditionally:
  - `activeTab === "lineage"`: renders the SVG timeline.
  - `activeTab === "matrix"`: renders the feature comparison table.
  - `activeTab === "reader"`: renders abstract and PDF reading actions.

---

### How to Customize the Knowledge Graph
The force-directed graph canvas is rendered by `src/components/ForceGraphView.tsx`:

1. **Node Sizes & Colors:**
   Edit `TYPE_COLORS` at the top of `ForceGraphView.tsx`:
   ```typescript
   const TYPE_COLORS: Record<string, { fill: string; stroke: string; size: number; icon: string }> = {
     collection: { fill: "#22c55e", stroke: "#16a34a", size: 44, icon: "⇄" },
     paper:      { fill: "#38bdf8", stroke: "#0ea5e9", size: 32, icon: "◼" },
     claim:      { fill: "#06b6d4", stroke: "#0891b2", size: 28, icon: "⬡" },
     ...
   };
   ```
2. **Node Shape (Squircle vs Circle):**
   Look inside the `render()` function around line 450:
   - `ctx.roundRect(node.x - half, node.y - half, currentSize, currentSize, cr)` draws the rounded squares.
   - To make them sharper or rounder, modify `cr` (`currentSize * 0.2` = squircle, `0` = square, `half` = circle).
3. **Physics Parameters:**
   Adjust default values in `DEFAULT_GRAPH_SETTINGS` in `src/lib/settings.ts` (`repelForceMult`, `linkDistance`, `centerForceMult`).

---

### How to Add a New Screen & Route
1. **Create the Screen component:**
   Create `src/screens/MyScreen.tsx`:
   ```tsx
   import React from "react";
   export const MyScreen: React.FC = () => {
     return (
       <div style={{ padding: "40px 80px", color: "var(--text-main)" }}>
         <h1>My New Tool</h1>
       </div>
     );
   };
   ```
2. **Register the Route in `src/App.tsx`:**
   ```tsx
   import { MyScreen } from "./screens/MyScreen";
   ...
   <Route path="/my-screen" element={<MyScreen />} />
   ```
3. **Add Navigation links:**
   - In `src/components/QuarterCircleNav.tsx`, add an entry to `NAV_ACTIONS`:
     ```tsx
     { id: "myscreen", label: "My Tool", sublabel: "Custom tool", route: "/my-screen", icon: "⚡", category: "tools" }
     ```
   - In `src/screens/Dashboard.tsx`, optionally add a bento card pointing to `/my-screen`.

---

### How to Modify Backend API & Database Calls
1. **Tauri IPC:**
   When adding a new SQLite query or backend Rust action:
   - In Rust (`src-tauri/src/`): Add `#[tauri::command] fn my_command(...) -> ...` and register it in `tauri::Builder`.
   - In `src/lib/api.ts`: Add a wrapper:
     ```typescript
     import { invoke } from "@tauri-apps/api/core";
     export async function myCommand(param: string): Promise<ResultType> {
       return await invoke("my_command", { param });
     }
     ```
2. **External Web APIs (e.g., Semantic Scholar, arXiv):**
   You can call `fetch()` directly in `src/lib/api.ts` since Tauri's webview supports standard browser networking.

---

## 5. Running, Building, and Debugging

All commands must be executed in the `d:\Projects lol\foscl new\Venture\foscl` directory.

### Quick Commands
* **Start Web Dev Server (Browser preview):**
  ```powershell
  npx vite
  ```
  Spins up the web frontend at `http://localhost:5173` for rapid UI and styling iteration.

* **Start Tauri Desktop App (Native window):**
  ```powershell
  npm run tauri dev
  # or
  pnpm tauri dev
  ```

* **Verify TypeScript (Zero error check):**
  ```powershell
  npx tsc --noEmit
  ```
  Runs the type checker without producing build artifacts. Always run this before building.

* **Production Build:**
  ```powershell
  npm run build
  ```
  Compiles TypeScript and bundles production assets into `dist/`.

---

## Summary Checklist for Common Changes
* **Change a color?** → Edit `src/styles.css`.
* **Fix a layout or card?** → Edit `src/screens/Dashboard.tsx`.
* **Add a search filter or change paper cards?** → Edit `src/screens/Discover.tsx`.
* **Add or adjust a quick menu item?** → Edit `src/components/QuarterCircleNav.tsx`.
* **Add a new page?** → Create `src/screens/X.tsx` and wire in `src/App.tsx`.

