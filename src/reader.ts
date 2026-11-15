import type { Book, Note, ReadingMode, AppTheme } from "./types";
import { loadEpub } from "./db";
import { saveBooks, loadNotes, saveNotes } from "./bookStorage";
import { parseEpub, loadFullBookHtml, type ParsedEpub } from "./epub";
import { exportNoteWithPicker } from "./notes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id) as T | null;
  if (!found) throw new Error(`Reader: missing element #${id}`);
  return found;
}

function currentTheme(): AppTheme {
  const t = document.documentElement.dataset.theme;
  if (t === "cream" || t === "light") return "cream";
  if (t === "sepia") return "sepia";
  return "night";
}

// ---------------------------------------------------------------------------
// Reader state
// ---------------------------------------------------------------------------

let parsed: ParsedEpub | null = null;
let openBook: Book | null = null;
let chapterIndex = 0;
let activeTocId: string | null = null;
let pendingAnchor: string | undefined = undefined;
let pendingPage: number | undefined = undefined;
let fontSize = 18;
let readingMode: ReadingMode = "continuous";
let books: Book[] = [];
let onCloseCallback: (() => void) | null = null;
let onThemeToggleCallback: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isReaderOpen(): boolean {
  const view = document.getElementById("reader-view");
  return Boolean(view && !view.hidden);
}

export function closeReader(): void {
  close();
}

export function initReader(
  booksRef: Book[],
  onClose: () => void,
  onThemeToggle?: () => void,
): void {
  books = booksRef;
  onCloseCallback = onClose;
  onThemeToggleCallback = onThemeToggle ?? null;

  const savedMode = localStorage.getItem("foscl:readingMode") as ReadingMode | null;
  if (savedMode === "continuous" || savedMode === "single" || savedMode === "double") {
    readingMode = savedMode;
  }

  el("reader-back").addEventListener("click", close);
  el("prev-chapter").addEventListener("click", () => navigate(-1));
  el("next-chapter").addEventListener("click", () => navigate(1));
  el("font-decrease").addEventListener("click", () => changeFontSize(-2));
  el("font-increase").addEventListener("click", () => changeFontSize(2));

  // Reading mode toggle button
  const modeBtn = document.getElementById("reader-mode-btn");
  modeBtn?.addEventListener("click", cycleReadingMode);
  updateModeButton();

  const themeToggle = document.getElementById("reader-theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      onThemeToggleCallback?.();
    });
  }

  // TOC drawer toggle
  const tocBtn = document.getElementById("reader-toc-btn");
  tocBtn?.addEventListener("click", toggleTocDrawer);
  document.getElementById("reader-toc-close")?.addEventListener("click", closeTocDrawer);

  // In-reader notes drawer controls
  const notesToggle = document.getElementById("reader-notes-toggle");
  notesToggle?.addEventListener("click", toggleNotesDrawer);
  document.getElementById("reader-notes-close")?.addEventListener("click", closeNotesDrawer);
  document.getElementById("reader-new-note-btn")?.addEventListener("click", handleCreateNewNoteForBook);
  document.getElementById("reader-export-note-btn")?.addEventListener("click", handleExportCurrentInReaderNote);
  document.getElementById("reader-delete-note-btn")?.addEventListener("click", handleDeleteCurrentInReaderNote);

  const noteSelect = document.getElementById("reader-note-select") as HTMLSelectElement | null;
  noteSelect?.addEventListener("change", (e) => {
    const selectedId = (e.target as HTMLSelectElement).value;
    if (selectedId) switchInReaderNote(selectedId);
  });

  // Keyboard navigation from parent document
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", updatePageIndicator);
}

function cycleReadingMode(): void {
  if (readingMode === "continuous") {
    readingMode = "single";
  } else if (readingMode === "single") {
    readingMode = "double";
  } else {
    readingMode = "continuous";
  }

  localStorage.setItem("foscl:readingMode", readingMode);
  updateModeButton();
  if (parsed && isReaderOpen()) {
    renderChapter();
  }
}

function updateModeButton(): void {
  const btn = document.getElementById("reader-mode-btn");
  if (!btn) return;
  if (readingMode === "continuous") {
    btn.textContent = "↕ Continuous";
    btn.title = "Reading mode: Continuous scroll (click to switch to Single Page)";
  } else if (readingMode === "single") {
    btn.textContent = "▯ Single";
    btn.title = "Reading mode: Single page paginated (click to switch to Double Page)";
  } else {
    btn.textContent = "▯▯ Double";
    btn.title = "Reading mode: Double page spread (click to switch to Continuous)";
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (!isReaderOpen()) return;
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    scrollByPage(1);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    scrollByPage(-1);
  } else if (e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    scrollByPage(1);
  } else if (e.key === "PageUp") {
    e.preventDefault();
    scrollByPage(-1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    const tocDrawer = document.getElementById("reader-toc-drawer");
    const notesDrawer = document.getElementById("reader-notes-drawer");
    if (tocDrawer && !tocDrawer.hidden) {
      closeTocDrawer();
    } else if (notesDrawer && !notesDrawer.hidden) {
      closeNotesDrawer();
    } else {
      close();
    }
  }
}

function scrollByPage(direction: 1 | -1): void {
  const frame = el<HTMLIFrameElement>("reader-frame");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) return;

  if (readingMode === "continuous") {
    const pageSize = (win.innerHeight || frame.clientHeight) * 0.85;
    win.scrollBy({ top: direction * pageSize, behavior: "smooth" });
  } else {
    // Paginated modes (single and double): discrete page-by-page snapping
    const pageWidth = win.innerWidth || frame.clientWidth || 800;
    const scrollWidth = Math.max(
      doc.documentElement.scrollWidth,
      doc.body.scrollWidth,
    );
    const totalPages = Math.max(1, Math.round(scrollWidth / pageWidth));
    const currentX = win.scrollX || doc.documentElement.scrollLeft || 0;
    const currentPage = Math.max(1, Math.round(currentX / pageWidth) + 1);

    const targetPage = Math.max(1, Math.min(totalPages, currentPage + direction));
    const targetX = (targetPage - 1) * pageWidth;

    win.scrollTo({ left: targetX, behavior: "smooth" });
  }
}

export function getCurrentReaderPage(): number {
  const frame = el<HTMLIFrameElement>("reader-frame");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) return 1;

  if (readingMode === "continuous") {
    const scrollHeight = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
    );
    const clientHeight = win.innerHeight || frame.clientHeight || 600;
    const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;
    const totalPages = Math.max(1, Math.ceil(scrollHeight / clientHeight));
    return Math.min(
      totalPages,
      Math.max(1, Math.floor(scrollTop / clientHeight) + 1),
    );
  } else {
    const clientWidth = win.innerWidth || frame.clientWidth || 800;
    const scrollLeft = win.scrollX || doc.documentElement.scrollLeft || 0;
    return Math.max(1, Math.round(scrollLeft / clientWidth) + 1);
  }
}

export function jumpToPage(pageNumber: number): void {
  const frame = el<HTMLIFrameElement>("reader-frame");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) return;

  const clientWidth = win.innerWidth || frame.clientWidth || 800;
  const scrollWidth = Math.max(
    doc.documentElement.scrollWidth,
    doc.body.scrollWidth,
  );
  const totalPages = Math.max(1, Math.round(scrollWidth / clientWidth));
  const safePage = Math.max(1, Math.min(totalPages, pageNumber));

  if (readingMode === "continuous") {
    const scrollHeight = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
    );
    const clientHeight = win.innerHeight || frame.clientHeight || 600;
    const targetY = Math.min(
      scrollHeight - clientHeight,
      (safePage - 1) * clientHeight,
    );
    win.scrollTo({ top: targetY, behavior: "smooth" });
  } else {
    const targetX = (safePage - 1) * clientWidth;
    win.scrollTo({ left: targetX, behavior: "smooth" });
  }
  updatePageIndicator();
}

export function getCurrentlyOpenBook(): Book | null {
  return openBook;
}

export async function openInReader(
  book: Book,
  targetPage?: number,
): Promise<void> {
  openBook = book;
  pendingPage = targetPage;
  chapterIndex = book.progress?.chapterIndex ?? 0;
  activeTocId = null;
  pendingAnchor = undefined;

  const savedSize = localStorage.getItem("foscl:fontSize");
  fontSize = savedSize ? parseInt(savedSize, 10) : 18;

  el("reader-book-title").textContent = book.title;
  el("reader-view").hidden = false;
  closeTocDrawer();
  closeNotesDrawer();
  updateThemeButton();
  updateModeButton();
  setLoading(true);

  try {
    const data = await loadEpub(book.id);
    if (!data) {
      throw new Error(
        "Book content not found in local storage. Try re-importing this book.",
      );
    }
    parsed = await parseEpub(data);

    // Make sure saved chapter index is in valid bounds
    if (chapterIndex < 0 || chapterIndex >= parsed.chapters.length) {
      chapterIndex = 0;
    }

    const matchingToc = parsed.toc.find((t) => t.chapterIndex === chapterIndex);
    if (matchingToc) activeTocId = matchingToc.id;

    renderTocList();
    await renderChapter();
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }

  // Record last opened time
  book.lastOpenedAt = Date.now();
  saveBooks(books);
}

export function updateThemeButton(): void {
  const theme = currentTheme();
  const themeToggle = document.getElementById("reader-theme-toggle");
  if (themeToggle) {
    if (theme === "cream") {
      themeToggle.textContent = "☀";
      themeToggle.title = "Current: Cream (Light). Click to switch to Sepia";
    } else if (theme === "sepia") {
      themeToggle.textContent = "📜";
      themeToggle.title = "Current: Sepia. Click to switch to Night";
    } else {
      themeToggle.textContent = "☾";
      themeToggle.title = "Current: Night (Dark). Click to switch to Cream";
    }
  }
}

export async function readerRefreshTheme(): Promise<void> {
  updateThemeButton();
  if (parsed && isReaderOpen()) {
    await renderChapter();
  }
}

// ---------------------------------------------------------------------------
// Internal Navigation
// ---------------------------------------------------------------------------

function close(): void {
  saveProgress();
  closeTocDrawer();
  closeNotesDrawer();
  el("reader-view").hidden = true;
  parsed = null;
  openBook = null;
  activeTocId = null;
  pendingAnchor = undefined;
  onCloseCallback?.();
}

async function navigate(delta: number): Promise<void> {
  scrollByPage(delta > 0 ? 1 : -1);
}

async function jumpToChapter(
  index: number,
  anchor?: string,
  tocId?: string,
): Promise<void> {
  if (!parsed) return;
  if (index < 0 || index >= parsed.chapters.length) return;

  if (tocId) {
    activeTocId = tocId;
  } else {
    const matching = parsed.toc.find((t) => t.chapterIndex === index);
    activeTocId = matching?.id ?? null;
  }

  chapterIndex = index;
  pendingAnchor = anchor;
  saveProgress();

  const frame = el<HTMLIFrameElement>("reader-frame");
  const doc = frame.contentDocument;
  const win = frame.contentWindow;

  if (doc && win) {
    const chapEl = doc.getElementById(`foscl-chapter-${index}`);
    let targetEl: HTMLElement | null = null;
    if (anchor) {
      targetEl = (doc.getElementById(anchor) ||
        doc.querySelector(`[name="${anchor}"]`) ||
        chapEl?.querySelector(`[name="${anchor}"]`)) as HTMLElement | null;
    }
    if (!targetEl) targetEl = chapEl;

    if (targetEl) {
      if (readingMode === "continuous") {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const rect = targetEl.getBoundingClientRect();
        const targetX = win.scrollX + rect.left;
        const pageWidth = win.innerWidth || 800;
        const pageIdx = Math.floor(targetX / pageWidth);
        win.scrollTo({ left: pageIdx * pageWidth, behavior: "smooth" });
      }
    }
  }

  renderTocList();
  updatePageIndicator();
  closeTocDrawer();
}

function scrollToAnchorInFrame(anchor: string): boolean {
  const frame = el<HTMLIFrameElement>("reader-frame");
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc) return false;

  const targetEl =
    doc.getElementById(anchor) ||
    doc.querySelector(`[name="${anchor}"]`) ||
    doc.querySelector(`a[name="${anchor}"]`);

  if (targetEl) {
    if (readingMode === "continuous") {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (win) {
      const rect = targetEl.getBoundingClientRect();
      const targetX = win.scrollX + rect.left;
      const pageWidth = win.innerWidth || 800;
      const pageIdx = Math.floor(targetX / pageWidth);
      win.scrollTo({ left: pageIdx * pageWidth, behavior: "smooth" });
    }
    return true;
  }
  return false;
}

async function renderChapter(): Promise<void> {
  if (!parsed) return;

  const html = await loadFullBookHtml(
    parsed,
    currentTheme(),
    fontSize,
    readingMode,
  );

  const frame = el<HTMLIFrameElement>("reader-frame");
  frame.srcdoc = html;

  frame.onload = () => {
    try {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) return;

      if (pendingAnchor) {
        scrollToAnchorInFrame(pendingAnchor);
        pendingAnchor = undefined;
      } else if (pendingPage !== undefined) {
        jumpToPage(pendingPage);
        pendingPage = undefined;
      } else if (chapterIndex > 0) {
        const chapEl = doc.getElementById(`foscl-chapter-${chapterIndex}`);
        if (chapEl) {
          if (readingMode === "continuous") {
            chapEl.scrollIntoView({ block: "start" });
          } else {
            const rect = chapEl.getBoundingClientRect();
            const targetX = win.scrollX + rect.left;
            const pageWidth = win.innerWidth || 800;
            const pageIdx = Math.floor(targetX / pageWidth);
            win.scrollTo({ left: pageIdx * pageWidth });
          }
        }
      } else {
        win.scrollTo(0, 0);
      }

      // Keyboard navigation forwarding
      win.addEventListener("keydown", handleKeydown);

      // Scroll listener to update page indicator
      win.addEventListener("scroll", updatePageIndicator, { passive: true });

      // Mouse wheel navigation: in single & double mode, vertical wheel cleanly flips pages
      let isWheeling = false;
      win.addEventListener(
        "wheel",
        (e) => {
          if (readingMode === "continuous") return;
          e.preventDefault();
          const delta =
            Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          if (Math.abs(delta) > 15 && !isWheeling) {
            isWheeling = true;
            scrollByPage(delta > 0 ? 1 : -1);
            setTimeout(() => {
              isWheeling = false;
            }, 260);
          }
        },
        { passive: false },
      );

      // Click to turn pages
      setupClickNavigation(doc, win);

      updatePageIndicator();
    } catch {
      // Ignore origin restrictions
    }
  };

  updatePageIndicator();
}

function setupClickNavigation(doc: Document, win: Window): void {
  // Prevent context menu on right click so it can act as previous page
  doc.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.closest("a") ||
      target?.closest("button") ||
      target?.closest("input")
    ) {
      return;
    }
    e.preventDefault();
    scrollByPage(-1);
  });

  // Left click for next / prev page
  doc.addEventListener("click", (e) => {
    if (readingMode === "continuous") return;
    const selection = win.getSelection()?.toString().trim();
    if (selection && selection.length > 0) return;

    const target = e.target as HTMLElement | null;
    if (
      target?.closest("a") ||
      target?.closest("button") ||
      target?.closest("input") ||
      target?.closest("select") ||
      target?.closest("textarea")
    ) {
      return;
    }

    if (e.button === 0) {
      if (e.clientX < win.innerWidth * 0.2) {
        scrollByPage(-1);
      } else {
        scrollByPage(1);
      }
    }
  });
}

function updatePageIndicator(): void {
  if (!parsed) return;
  const frame = el<HTMLIFrameElement>("reader-frame");
  const doc = frame.contentDocument;
  const win = frame.contentWindow;

  if (!doc || !win || frame.hidden) {
    const currentChapter = parsed.chapters[chapterIndex];
    const chapterTitle = currentChapter?.title || `Chapter ${chapterIndex + 1}`;
    el("reader-chapter-info").textContent = chapterTitle;
    return;
  }

  // Detect which chapter section is currently in view
  const chapterSections = doc.querySelectorAll<HTMLElement>(".foscl-chapter");
  let activeIndex = chapterIndex;
  for (const sec of chapterSections) {
    const rect = sec.getBoundingClientRect();
    if (readingMode === "continuous") {
      if (rect.top <= 140 && rect.bottom > 60) {
        activeIndex = parseInt(sec.dataset.chapterIndex || "0", 10);
        break;
      }
    } else {
      if (rect.left <= (win.innerWidth || 800) / 2 && rect.right > 0) {
        activeIndex = parseInt(sec.dataset.chapterIndex || "0", 10);
        break;
      }
    }
  }

  chapterIndex = activeIndex;
  saveProgress();

  const matchingToc = parsed.toc.find((t) => t.chapterIndex === chapterIndex);
  if (matchingToc) activeTocId = matchingToc.id;
  const currentChapterTitle =
    matchingToc?.title || parsed.chapters[chapterIndex]?.title || `Chapter ${chapterIndex + 1}`;

  let totalPages = 1;
  let currentPage = 1;

  if (readingMode === "continuous") {
    const scrollHeight = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
    );
    const clientHeight = win.innerHeight || frame.clientHeight || 600;
    totalPages = Math.max(1, Math.ceil(scrollHeight / clientHeight));
    const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;
    currentPage = Math.min(
      totalPages,
      Math.max(1, Math.floor(scrollTop / clientHeight) + 1),
    );
    const maxScroll = scrollHeight - clientHeight;
    const percent = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100))) : 0;
    el("reader-chapter-info").textContent = `${currentChapterTitle} • ${percent}%`;
  } else {
    // Paginated horizontal modes
    const scrollWidth = Math.max(
      doc.documentElement.scrollWidth,
      doc.body.scrollWidth,
    );
    const clientWidth = win.innerWidth || frame.clientWidth || 800;
    totalPages = Math.max(1, Math.ceil(scrollWidth / clientWidth));
    const scrollLeft = win.scrollX || doc.documentElement.scrollLeft || 0;
    currentPage = Math.min(
      totalPages,
      Math.max(1, Math.floor(scrollLeft / clientWidth) + 1),
    );
    el("reader-chapter-info").textContent = `${currentChapterTitle} • Page ${currentPage} of ${totalPages}`;
  }

  const prevBtn = el<HTMLButtonElement>("prev-chapter");
  const nextBtn = el<HTMLButtonElement>("next-chapter");
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

function changeFontSize(delta: number): void {
  fontSize = Math.max(12, Math.min(32, fontSize + delta));
  localStorage.setItem("foscl:fontSize", String(fontSize));
  if (parsed) renderChapter();
}

function saveProgress(): void {
  if (!openBook) return;
  openBook.progress = { chapterIndex };
  saveBooks(books);
}

function setLoading(show: boolean): void {
  el("reader-loading").hidden = !show;
  el<HTMLIFrameElement>("reader-frame").hidden = show;
}

function showError(message: string): void {
  const theme = currentTheme();
  const isNight = theme === "night";
  const frame = el<HTMLIFrameElement>("reader-frame");
  frame.srcdoc = `<!DOCTYPE html><html><head><style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      padding: 40px;
      line-height: 1.6;
      background: ${isNight ? "#161c1e" : "#fbf8f1"};
      color: ${isNight ? "#f28585" : "#c00"};
    }
    h3 { margin-top: 0; }
  </style></head><body>
  <h3>Could not display book</h3>
  <p>${message}</p>
  </body></html>`;
  frame.hidden = false;
}

// ---------------------------------------------------------------------------
// Table of Contents Drawer
// ---------------------------------------------------------------------------

function toggleTocDrawer(): void {
  const drawer = document.getElementById("reader-toc-drawer");
  if (!drawer) return;
  if (drawer.hidden) {
    drawer.hidden = false;
    renderTocList();
  } else {
    drawer.hidden = true;
  }
}

function closeTocDrawer(): void {
  const drawer = document.getElementById("reader-toc-drawer");
  if (drawer) drawer.hidden = true;
}

function renderTocList(): void {
  const listEl = document.getElementById("reader-toc-list");
  if (!listEl || !parsed) return;
  listEl.innerHTML = "";

  if (!activeTocId) {
    const match = parsed.toc.find((t) => t.chapterIndex === chapterIndex);
    if (match) activeTocId = match.id;
  }

  parsed.toc.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "reader-toc-item";
    if (item.id === activeTocId) {
      btn.classList.add("active");
    }
    btn.type = "button";

    const titleSpan = document.createElement("span");
    titleSpan.className = "reader-toc-item-title";
    titleSpan.textContent = item.title;

    const numSpan = document.createElement("span");
    numSpan.className = "reader-toc-item-num";
    numSpan.textContent = `Ch. ${item.chapterIndex + 1}`;

    btn.append(titleSpan, numSpan);
    btn.addEventListener("click", () => {
      closeTocDrawer();
      jumpToChapter(item.chapterIndex, item.anchor, item.id);
    });

    listEl.append(btn);
  });
}

// ---------------------------------------------------------------------------
// In-Reader Notes Drawer (Multi-Note, Export & Delete Support)
// ---------------------------------------------------------------------------

let activeBookNoteId: string | null = null;
let noteAutosaveTimer: number | undefined;

function toggleNotesDrawer(): void {
  const drawer = document.getElementById("reader-notes-drawer");
  const toggleBtn = document.getElementById("reader-notes-toggle");
  if (!drawer) return;

  if (drawer.hidden) {
    drawer.hidden = false;
    toggleBtn?.classList.add("active");
    loadInReaderNotesList();
  } else {
    drawer.hidden = true;
    toggleBtn?.classList.remove("active");
  }
}

function closeNotesDrawer(): void {
  const drawer = document.getElementById("reader-notes-drawer");
  const toggleBtn = document.getElementById("reader-notes-toggle");
  if (drawer) drawer.hidden = true;
  toggleBtn?.classList.remove("active");
}

function loadInReaderNotesList(preferNoteId?: string): void {
  if (!openBook) return;

  const notes = loadNotes();
  const bookNotes = notes.filter((n) => n.bookId === openBook?.id);
  const selectEl = document.getElementById("reader-note-select") as HTMLSelectElement | null;
  const pageNow = getCurrentReaderPage();

  if (bookNotes.length === 0) {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: `Notes: ${openBook.title} (Page ${pageNow})`,
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bookId: openBook.id,
      bookTitle: openBook.title,
      bookPage: pageNow,
      bookChapter: chapterIndex,
    };
    notes.unshift(newNote);
    saveNotes(notes);
    bookNotes.push(newNote);
  }

  if (selectEl) {
    selectEl.innerHTML = "";
    bookNotes.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n.id;
      const pLabel = n.bookPage ? ` [p. ${n.bookPage}]` : "";
      opt.textContent = `${n.title.trim() || "Untitled Note"}${pLabel}`;
      selectEl.append(opt);
    });

    const targetId = preferNoteId || activeBookNoteId || bookNotes[0].id;
    selectEl.value = targetId;
    switchInReaderNote(targetId);
  }
}

function switchInReaderNote(noteId: string): void {
  activeBookNoteId = noteId;
  const notes = loadNotes();
  const note = notes.find((n) => n.id === noteId);
  if (!note) return;

  const titleInput = document.getElementById("reader-note-title") as HTMLInputElement | null;
  const bodyInput = document.getElementById("reader-note-body") as HTMLTextAreaElement | null;

  if (titleInput) titleInput.value = note.title;
  if (bodyInput) bodyInput.value = note.content;

  const selectEl = document.getElementById("reader-note-select") as HTMLSelectElement | null;
  if (selectEl && selectEl.value !== noteId) {
    selectEl.value = noteId;
  }

  // Linked page badge and pin button
  let linkBar = document.getElementById("reader-note-link-bar");
  if (!linkBar && titleInput && titleInput.parentElement) {
    linkBar = document.createElement("div");
    linkBar.id = "reader-note-link-bar";
    linkBar.className = "reader-note-link-bar";
    titleInput.parentElement.insertBefore(linkBar, titleInput);
  }

  if (linkBar) {
    linkBar.innerHTML = "";
    if (note.bookPage) {
      const pageBadge = document.createElement("button");
      pageBadge.type = "button";
      pageBadge.className = "reader-page-link-pill";
      pageBadge.title = `Click to jump to page ${note.bookPage} in reader`;
      pageBadge.innerHTML = `<span>📖 Page ${note.bookPage}</span> <span style="opacity:0.7;">➔</span>`;
      pageBadge.addEventListener("click", () => {
        jumpToPage(note.bookPage!);
      });
      linkBar.append(pageBadge);
    }

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "reader-pin-page-btn";
    const pageNow = getCurrentReaderPage();
    pinBtn.title = "Set linked page to current page in view";
    pinBtn.textContent = `📍 Pin Page ${pageNow}`;
    pinBtn.addEventListener("click", () => {
      const currentP = getCurrentReaderPage();
      note.bookPage = currentP;
      note.bookChapter = chapterIndex;
      const fresh = loadNotes();
      const idx = fresh.findIndex((n) => n.id === note.id);
      if (idx !== -1) {
        fresh[idx].bookPage = currentP;
        fresh[idx].bookChapter = chapterIndex;
        saveNotes(fresh);
      }
      switchInReaderNote(note.id);
    });
    linkBar.append(pinBtn);
  }

  bindNoteAutosave();
}

function handleCreateNewNoteForBook(): void {
  if (!openBook) return;
  const notes = loadNotes();
  const bookNotes = notes.filter((n) => n.bookId === openBook?.id);
  const pageNow = getCurrentReaderPage();

  const newNote: Note = {
    id: crypto.randomUUID(),
    title: `Note #${bookNotes.length + 1}: ${openBook.title} (Page ${pageNow})`,
    content: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookId: openBook.id,
    bookTitle: openBook.title,
    bookPage: pageNow,
    bookChapter: chapterIndex,
  };

  notes.unshift(newNote);
  saveNotes(notes);
  loadInReaderNotesList(newNote.id);

  const titleInput = document.getElementById("reader-note-title") as HTMLInputElement | null;
  titleInput?.focus();
  titleInput?.select();
}

function handleExportCurrentInReaderNote(): void {
  if (!activeBookNoteId) return;
  const notes = loadNotes();
  const note = notes.find((n) => n.id === activeBookNoteId);
  if (note) {
    exportNoteWithPicker(note);
  }
}

function handleDeleteCurrentInReaderNote(): void {
  if (!activeBookNoteId || !openBook) return;
  if (!confirm("Are you sure you want to delete this note?")) return;

  const fresh = loadNotes().filter((n) => n.id !== activeBookNoteId);
  saveNotes(fresh);

  activeBookNoteId = null;
  loadInReaderNotesList();
}

function bindNoteAutosave(): void {
  const titleInput = document.getElementById("reader-note-title") as HTMLInputElement | null;
  const bodyInput = document.getElementById("reader-note-body") as HTMLTextAreaElement | null;

  if (!titleInput || !bodyInput) return;

  titleInput.oninput = () => triggerAutosave();
  bodyInput.oninput = () => triggerAutosave();
}

function triggerAutosave(): void {
  window.clearTimeout(noteAutosaveTimer);
  noteAutosaveTimer = window.setTimeout(() => {
    if (!activeBookNoteId || !openBook) return;

    const titleInput = document.getElementById("reader-note-title") as HTMLInputElement | null;
    const bodyInput = document.getElementById("reader-note-body") as HTMLTextAreaElement | null;
    const selectEl = document.getElementById("reader-note-select") as HTMLSelectElement | null;

    const fresh = loadNotes();
    const idx = fresh.findIndex((n) => n.id === activeBookNoteId);
    if (idx === -1) return;

    const newTitle = titleInput?.value.trim() || `Notes: ${openBook.title}`;
    fresh[idx] = {
      ...fresh[idx],
      title: newTitle,
      content: bodyInput?.value || "",
      updatedAt: Date.now(),
    };
    saveNotes(fresh);

    if (selectEl) {
      const activeOption = selectEl.querySelector(`option[value="${activeBookNoteId}"]`);
      if (activeOption) {
        activeOption.textContent = newTitle;
      }
    }
  }, 250);
}
