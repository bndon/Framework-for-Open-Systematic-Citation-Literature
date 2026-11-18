# FOSCL user guide

**FOSCL** stands for *Framework for Open Systematic Citation & Literature*. It is a desktop workspace for doing a literature review properly: find papers, keep them organised, read and highlight them, decide which ones to include, compare what they say, and keep a traceable record of the claims you build on them. Everything is stored on your computer.

Paper search and citation data come from **OpenAlex**, a free open database of scholarly work, so you need an internet connection for searching and citation counts. Everything else works offline.

## The ideas behind it

| Word | What it means in FOSCL |
|---|---|
| **Paper** | One article: title, authors, year, venue, abstract, DOI, and optionally its PDF. |
| **Collection** | A folder for one review or topic. Papers can be in several collections. |
| **Annotation** | A highlighted passage from a PDF, with an optional note. |
| **Template** | The list of fields you want to extract from every paper (research question, methodology, sample size…). |
| **Extraction** | The value of one field for one paper. It records where it came from: the source, you, or a suggestion. |
| **Claim** | A statement you are relying on, linked to evidence that *supports*, *contradicts* or *qualifies* it, with a history of every revision. |
| **Screening** | Deciding for each paper whether it stays in the review (include, maybe, exclude). |
| **PRISMA diagram** | The standard flow chart that reports how many papers were found, screened, excluded and included. |

## Getting around

- **The menu.** The round **F / MENU** button in the top-left corner opens a quarter-circle menu. Open it with a click, with **Esc**, or with **Ctrl+K** (**Cmd+K** on Mac). Click any item to go there. Holding **Alt** shows numbers, and **Alt+1 … Alt+9** jumps straight to that screen.
- **The dashboard** (the home screen) is a grid of tiles. Each tile opens a screen. The Library tile also shows your screening progress.
- **Themes.** Settings has 10 colour themes (the default is Plum). Pick the one that is easiest on your eyes.

## Quick start: your first review in 10 minutes

1. **Make a collection.** Open **Library**, click **+ New** next to *Collections*, and name it, for example "Deep learning in radiology".
2. **Search.** Open **Discover**. Type keywords or a DOI and press Enter.
3. **Narrow down.** Open the filters: year range, open access only, has abstract, and sort by relevance, newest, oldest, most cited or title.
4. **Pick papers.** Tick the papers you want. Choose your collection and add them. Papers already in your library are marked, so you never add duplicates by accident.
5. **Read.** In **Library**, open a paper and click **Upload PDF**, then **Read**. Select text and choose a colour to highlight it.
6. **Screen.** In **Library**, open the **Screening & PRISMA** tab and decide on each paper (see below).
7. **Compare.** Open **Comparison Table** to fill in the same fields for every included paper.
8. **Export.** Open **Export** and save a Word or PDF report.

## Every feature, with tutorials

### Discover (search for papers)

Searches OpenAlex for papers by keyword or DOI.

- **Search:** type, press Enter. Use **Load more** for further pages.
- **Filters and sort:** year from/to, open access only, has abstract; sort by relevance, newest, oldest, most cited, or title.
- **Select and add:** tick papers (or select all visible), then add them to a collection. The added papers are saved with their citation counts and reference lists.
- **Citation links:** see how many of a paper's references and citing papers are already in your library.
- **History and saved searches:** every search is logged with how many results it returned. Open **History** to rerun a search, **save** it with a name, rename it, or delete it. This log feeds the PRISMA diagram, so your report shows exactly what you searched.
- **Already in library:** papers you already own are marked in the results.

### Library (your papers and collections)

- **Collections:** create (+ New), rename (pencil icon), delete (bin icon). Deleting a collection keeps its papers. Every delete shows an **Undo** button for 8 seconds.
- **Paper list:** search by title, author or venue, and sort by year, title or citation count. **Get citation counts** fills in counts for papers added earlier.
- **Papers:** **Details** opens the paper page, **Upload PDF** attaches a file, **Read** opens the PDF reader. The **✕** removes the paper from this collection only.
- **Import references:** click **Import references**. Choose a `.bib` (BibTeX) or `.ris` file, or paste BibTeX, RIS, or a list of DOIs (one per line, or inside a reference list). FOSCL tells you what it recognised, shows the papers it found, lets you untick any, and adds them to the collection. DOIs are looked up on OpenAlex.
- **Export references:** **Export BibTeX / RIS** saves the papers of this collection as `.bib` or `.ris`, ready for Zotero, EndNote or LaTeX.
- **Compare in Table** and **Lineage & Claims** open those screens for this collection.

### Screening and PRISMA (inside Library)

Open a collection in **Library**, then click the **Screening & PRISMA** tab.

1. **Stage 1: Title & abstract.** For each paper choose **Include**, **Maybe** or **Exclude**. Expand a paper with Enter to read the abstract.
2. **Stage 2: Full text.** Shows the papers you included or marked maybe in stage 1. Decide again after reading the full text. When you exclude a paper, pick a **reason** (for example "Full text not available"). Reasons are counted in the diagram.
3. **Keyboard shortcuts** (when no text box is focused): **J / ↓** next paper, **K / ↑** previous, **I** include, **M** maybe, **X** exclude, **U** undo the decision, **Enter** open or close the abstract. After each decision the cursor moves to the next paper, so you can screen quickly.
4. **PRISMA flow diagram.** On the side, the diagram updates as you decide: records identified (from your search log), duplicates removed, screened, excluded, assessed for eligibility, excluded with reasons, and included. If you searched outside FOSCL, you can type the identified count by hand.
5. **Save and share.** **Save diagram (SVG)** saves the diagram as an image, **Copy summary** copies the numbers as text for your methods section, and **Make a collection from the included papers** creates a new collection of the final set to use in the next steps.

### Reading PDFs

Open a paper, upload its PDF, and click **Read**. You can also manage all your PDFs from **Books → PDF papers** (below).

- **Move around:** previous/next page buttons, a page box (type a number and press Enter), zoom − / + and **Fit width**. FOSCL remembers your page, so reopening the paper returns you to where you stopped.
- **Contents** button opens a drawer with three tabs: **Contents** (the PDF's own outline), **Pages** (thumbnails) and **Search**. Press **Ctrl+F** to search inside the PDF; matches are highlighted on the page and **Enter** jumps to the next one.
- **Highlight:** select text. A small bar appears with five colours. Click a colour to highlight. Click **✎ Note** to highlight and write a note.
- **Notes panel (right side):** every highlight, grouped by page. Click a quote to jump to it, edit its note, change its colour, or delete it (with Undo). Use the box at the top to search your notes.
- **Export:** **Copy** or **Save .md** turns all highlights and notes into a Markdown file.
- **+ Manual Quote** adds a quote by typing or pasting, for example from a scanned page.
- **Night** switches to a dark reading mode.

### Books: EPUB and PDF shelves

Open **Books** from the menu. Two tabs: **EPUB books** and **PDF papers**.

**EPUB books** (e-books you read for background):

- **+ Import EPUB** (you can choose several files). Files are copied into FOSCL; your originals are not touched.
- The shelf shows covers, reading progress, a **Continue reading** banner, search, sort, and your own shelves (such as Favorites and To Read).
- In the reader: a **Contents** drawer, text size 13 to 28, three page colours (**Cream**, **Sepia**, **Night**), and three layouts (**Scroll**, **Page**, **Spread**). Arrow keys turn pages. FOSCL remembers your place in every book.
- **Highlights and notes:** select text, pick a colour (or **✎ Note**). **🖍 Notes** opens a drawer listing them by chapter; click one to jump to it, edit its note, or export everything as Markdown.

**PDF papers** (every paper that has a PDF):

- **+ Import PDF** adds one or more PDFs. Each becomes a paper in your library, titled from the PDF's information (or its file name). A PDF with the same title is skipped.
- The shelf shows the first page of each PDF, a progress bar, and **Continue reading**. **Read** opens the reader, **Details** opens the paper page, and **✕** deletes the paper and its highlights (with Undo).

### Comparison Table

Compares papers side by side, one row per paper and one column per field of a template. The default template has 10 fields: research question, methodology, dataset, sample size, proposed technique, evaluation metrics, main findings, limitations, future work, and personal observations.

1. Open **Comparison Table** and choose a collection.
2. Click a cell to fill it in. Each value remembers where it came from (the source, you, or a suggestion) and shows a badge.
3. Link a cell to a highlight so the evidence stays attached.
4. The progress bar on each paper shows how many fields are done.

### Templates

Create your own list of extraction fields (for example for clinical trials) or edit the default. Add, rename, reorder and remove fields, and save.

### Research Lineage and Claims

Use this to write down the claims your work depends on and keep the evidence behind them.

1. Choose a collection and add a **claim** (a sentence).
2. Attach evidence from your papers and mark each one: **supports**, **contradicts** or **qualifies**.
3. When you change a claim, give a reason. FOSCL keeps **every revision**, so you can see how an idea changed and why.

### Citation Tree and Knowledge Graph

- **Citation Tree** shows one paper in the middle, the papers it cites, and the papers that cite it, so you can follow a line of research. Choose a paper to explore.
- **Knowledge Graph** shows your collections, papers and claims as one connected picture.
- Both can be coloured three ways: **By type** (papers, claims, collections), **By status** (what needs attention, or what is already in your library), or **Mono**. Change this in Settings.

### Export

Pick a collection and export a report as **Word (.docx)** or **PDF**. It includes the comparison table, an appendix of your annotations, the claims and their lineage, and the reference list.

### Settings

- **Theme:** 10 colour themes with a live preview.
- **Navigation menu:** the speed of the menu animation (Fast, Full and others). Menu items can be clicked from the first moment either way.
- **Backup & restore:** see the next section.
- **About FOSCL:** version and the meaning of the name.

### Backup and restore

Because everything is on your computer, back up regularly.

- **Back up now…** Choose a folder. FOSCL creates a new folder named `foscl-backup-DATE` inside it, containing your whole database (papers, collections, annotations, screening, claims, search history), all PDFs, your EPUB books, EPUB highlights, and settings. It is an ordinary folder: copy it to a USB drive or cloud storage.
- **Restore from a backup…** Choose a backup folder. FOSCL shows what is in it and asks you to confirm, because restoring **replaces** what you have now. Your current data is saved to FOSCL's own `backups` folder first, so you can go back.
- Use backup and restore to **move your work to another computer**.

### Undo

Deleting a paper from a collection, a collection, a PDF highlight, an EPUB book or an EPUB highlight shows an **Undo** button for 8 seconds. Click it and nothing is lost.

### Pro features (locked)

**Access Hub** (find legal ways to read a paper), **Manuscript Analyzer** (check a manuscript against a journal style) and **Smart suggestions** (propose table values from your highlights) are marked 🔒 **Pro**. They open a page that explains the feature. Paid plans are not on sale yet; see **Plans**.

## Keyboard shortcuts

| Keys | Where | What it does |
|---|---|---|
| **Esc**, **Ctrl/Cmd+K** | anywhere | Open or close the menu |
| **Alt+1 … 9** | anywhere | Jump to a screen |
| **J / ↓**, **K / ↑** | Screening | Next / previous paper |
| **I**, **M**, **X**, **U** | Screening | Include, maybe, exclude, undo |
| **Enter** | Screening | Show or hide the abstract |
| **Ctrl+F** | PDF reader | Search inside the PDF |
| **← →** | EPUB reader | Turn the page |

## Tips and questions

- **Does it need the internet?** Only for Discover, DOI lookups and citation counts.
- **Where is my data?** On your computer only. See *Getting started* for the folder.
- **I added papers by mistake.** Use the **✕** on the paper, then **Undo** if you change your mind.
- **A search found a paper I already have.** It is marked "already in library".
- **Can two people share a library?** Not yet. Use Backup and Restore to hand a copy over.
- **Which PDFs work?** Any PDF with real text. Scanned images can be read and highlighted by hand with **+ Manual Quote**, but cannot be searched.
