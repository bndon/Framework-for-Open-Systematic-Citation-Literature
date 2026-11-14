import {
  loadBooks,
  saveBooks,
  loadShelves,
  saveShelves,
  loadNotes,
  saveNotes,
  loadNoteFolders,
} from "./bookStorage";
import { saveEpub, deleteEpub } from "./db";
import { importEpubFile } from "./epub";
import {
  initReader,
  openInReader,
  closeReader,
  isReaderOpen,
  readerRefreshTheme,
  updateThemeButton as updateReaderThemeBtn,
} from "./reader";
import {
  renderNotesPage,
  createNote,
  filterNotes,
  openNote,
  setBookOpenerCallback,
} from "./notes";
import { renderRecentPage } from "./recent";
import { showContextMenu } from "./contextMenu";
import type { Book, Note, AppTheme } from "./types";

// ---------------------------------------------------------------------------
// Constants & Theme Palette
// ---------------------------------------------------------------------------

const THEMES: AppTheme[] = ["cream", "sepia", "night"];
const OBSIDIAN_COLORS = [
  "#52b788",
  "#4ea8de",
  "#9d4edd",
  "#e63946",
  "#f77f00",
  "#06d6a0",
  "#e76f51",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const books: Book[] = loadBooks();
let shelves: string[] = loadShelves();
let activeShelf = "All";
let librarySearchQuery = "";

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = <T extends Element>(sel: string): T | null =>
  document.querySelector<T>(sel);

const byId = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// Page routing
// ---------------------------------------------------------------------------

type PageId = "library" | "notes" | "recent";

const PAGE_SECTIONS: Record<PageId, string> = {
  library: "library-page",
  notes: "notes-page",
  recent: "recent-page",
};

// ---------------------------------------------------------------------------
// Sidebar overlay (Obsidian Style)
// ---------------------------------------------------------------------------

const sidebarEl = byId("sidebar");
const sidebarBackdropEl = byId("sidebar-backdrop");
const sidebarToggleBtn = byId("sidebar-toggle");

function openSidebar(): void {
  renderSidebarTree();
  sidebarEl?.classList.add("open");
  sidebarBackdropEl?.classList.add("visible");
}

function closeSidebar(): void {
  sidebarEl?.classList.remove("open");
  sidebarBackdropEl?.classList.remove("visible");
}

function toggleSidebar(): void {
  if (sidebarEl?.classList.contains("open")) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

sidebarToggleBtn?.addEventListener("click", toggleSidebar);
sidebarBackdropEl?.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sidebarEl?.classList.contains("open")) {
    closeSidebar();
  }
});

const navItems = document.querySelectorAll<HTMLButtonElement>(".nav-item");
const ribbonBtns = document.querySelectorAll<HTMLButtonElement>(
  ".sidebar-ribbon .ribbon-btn[data-page]",
);
let activePage: PageId = "library";

function showPage(page: PageId): void {
  closeSidebar();
  if (isReaderOpen()) {
    closeReader();
  }

  activePage = page;

  // Update breadcrumb
  const label = page.charAt(0).toUpperCase() + page.slice(1);
  const section = byId("current-section");
  if (section) section.textContent = label;

  // Update nav active state (both topbar nav-items and sidebar ribbon-btns)
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });
  ribbonBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  // Show only the matching section
  for (const [p, sectionId] of Object.entries(PAGE_SECTIONS)) {
    const el = byId(sectionId);
    if (el) el.hidden = p !== page;
  }

  // Page-specific work
  if (page === "library") renderLibrary();
  if (page === "notes") renderNotesPage();
  if (page === "recent") renderRecentPage(books, enterReader);

  renderSidebarTree();
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const page = (item.dataset.page ?? "library") as PageId;
    showPage(page);
  });
});

ribbonBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = (btn.dataset.page ?? "library") as PageId;
    showPage(page);
  });
});

// Sidebar action buttons
byId("sidebar-theme-btn")?.addEventListener("click", toggleTheme);
byId("sidebar-close-btn")?.addEventListener("click", closeSidebar);

byId("sidebar-add-note-btn")?.addEventListener("click", () => {
  createNote();
  showPage("notes");
});

byId("sidebar-add-shelf-btn")?.addEventListener("click", () => {
  const name = prompt("Enter new shelf name (e.g. Science, Philosophy, To Read):");
  const trimmed = name?.trim();
  if (trimmed && !shelves.includes(trimmed)) {
    shelves.push(trimmed);
    saveShelves(shelves);
    activeShelf = trimmed;
    renderShelvesBar();
    renderLibrary();
    renderSidebarTree();
  }
});

// ---------------------------------------------------------------------------
// Reader integration
// ---------------------------------------------------------------------------

initReader(
  books,
  () => {
    byId("main-topbar").hidden = false;
    showPage(activePage);
  },
  toggleTheme,
);

function enterReader(book: Book, targetPage?: number): void {
  closeSidebar();
  byId("main-topbar").hidden = true;
  for (const sectionId of Object.values(PAGE_SECTIONS)) {
    const el = byId(sectionId);
    if (el) el.hidden = true;
  }
  openInReader(book, targetPage);
}

setBookOpenerCallback((bookId, page, chapter) => {
  const book = books.find((b) => b.id === bookId);
  if (book) {
    if (chapter !== undefined) {
      book.progress = { chapterIndex: chapter };
    }
    enterReader(book, page);
  }
});

// ---------------------------------------------------------------------------
// Shelf Management & Stylized Shelf Navigation
// ---------------------------------------------------------------------------

function renderShelvesBar(): void {
  const bar = byId("shelf-bar");
  if (!bar) return;
  bar.innerHTML = "";

  shelves.forEach((shelfName) => {
    const chip = document.createElement("button");
    chip.className = "shelf-chip";
    if (shelfName === activeShelf) chip.classList.add("active");
    chip.type = "button";

    // Colored dot indicator (Obsidian style)
    const dot = document.createElement("span");
    dot.className = "shelf-chip-dot";
    const colorIndex = Math.abs(hashString(shelfName)) % OBSIDIAN_COLORS.length;
    dot.style.backgroundColor =
      shelfName === "All" ? "var(--accent)" : OBSIDIAN_COLORS[colorIndex];

    // Shelf label
    const label = document.createElement("span");
    label.className = "shelf-chip-name";
    label.textContent = shelfName;

    // Book count badge
    const count = document.createElement("span");
    count.className = "shelf-chip-count";
    const countVal =
      shelfName === "All"
        ? books.length
        : books.filter((b) => b.shelf === shelfName).length;
    count.textContent = String(countVal);

    chip.append(dot, label, count);

    chip.addEventListener("click", () => {
      activeShelf = shelfName;
      renderShelvesBar();
      renderLibrary();
      renderSidebarTree();
    });

    // Right-click options on shelf chip
    if (shelfName !== "All") {
      chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
          {
            label: `View "${shelfName}" (${countVal})`,
            icon: "📂",
            onClick: () => {
              activeShelf = shelfName;
              renderShelvesBar();
              renderLibrary();
              renderSidebarTree();
            },
          },
          {
            label: `Rename "${shelfName}"…`,
            icon: "✏️",
            onClick: () => {
              const newName = prompt(
                `Rename shelf "${shelfName}" to:`,
                shelfName,
              );
              const trimmed = newName?.trim();
              if (trimmed && trimmed !== shelfName) {
                books.forEach((b) => {
                  if (b.shelf === shelfName) b.shelf = trimmed;
                });
                saveBooks(books);

                const sIdx = shelves.indexOf(shelfName);
                if (sIdx !== -1) shelves[sIdx] = trimmed;
                saveShelves(shelves);

                if (activeShelf === shelfName) activeShelf = trimmed;
                renderShelvesBar();
                renderLibrary();
                renderSidebarTree();
              }
            },
          },
          { divider: true, label: "" },
          {
            label: `Delete Shelf "${shelfName}"`,
            icon: "🗑️",
            danger: true,
            onClick: () => {
              if (
                confirm(
                  `Delete shelf "${shelfName}"? Books in this shelf will remain in your library.`,
                )
              ) {
                books.forEach((b) => {
                  if (b.shelf === shelfName) b.shelf = undefined;
                });
                saveBooks(books);
                shelves = shelves.filter((s) => s !== shelfName);
                saveShelves(shelves);
                if (activeShelf === shelfName) activeShelf = "All";
                renderShelvesBar();
                renderLibrary();
                renderSidebarTree();
              }
            },
          },
        ]);
      });
    }

    // Drag-and-drop target: drop book onto shelf
    chip.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      chip.classList.add("drag-over");
    });

    chip.addEventListener("dragleave", () => {
      chip.classList.remove("drag-over");
    });

    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      chip.classList.remove("drag-over");
      const bookId = e.dataTransfer?.getData("text/plain");
      if (!bookId) return;

      const book = books.find((b) => b.id === bookId);
      if (book) {
        book.shelf = shelfName === "All" ? undefined : shelfName;
        saveBooks(books);
        renderShelvesBar();
        renderLibrary();
        renderSidebarTree();
      }
    });

    bar.append(chip);
  });

  // "+ Shelf" chip
  const addBtn = document.createElement("button");
  addBtn.className = "shelf-chip shelf-chip-add";
  addBtn.type = "button";
  addBtn.innerHTML = `<span style="font-size: 14px; line-height: 1;">+</span> <span>Shelf</span>`;
  addBtn.title = "Create a new book shelf";
  addBtn.addEventListener("click", () => {
    const name = prompt("Enter new shelf name (e.g. Science, Philosophy, To Read):");
    const trimmed = name?.trim();
    if (trimmed && !shelves.includes(trimmed)) {
      shelves.push(trimmed);
      saveShelves(shelves);
      activeShelf = trimmed;
      renderShelvesBar();
      renderLibrary();
      renderSidebarTree();
    }
  });
  bar.append(addBtn);
}

// ---------------------------------------------------------------------------
// Obsidian-style Sidebar Explorer Tree
// ---------------------------------------------------------------------------

const collapsedTreeNodes = new Set<string>();

function renderSidebarTree(): void {
  const container = byId("sidebar-tree");
  if (!container) return;
  container.innerHTML = "";

  function createTreeFolder(
    id: string,
    title: string,
    dotColor: string,
    badgeCount: number,
    onTitleClick: () => void,
  ): { folderEl: HTMLElement; childrenEl: HTMLElement; caret: HTMLElement } {
    const isCollapsed = collapsedTreeNodes.has(id);

    const sectionEl = document.createElement("div");
    sectionEl.className = "tree-section";

    const nodeBtn = document.createElement("button");
    nodeBtn.className = "tree-node";
    nodeBtn.type = "button";

    const caret = document.createElement("span");
    caret.className = `tree-caret ${!isCollapsed ? "expanded" : ""}`;
    caret.textContent = "▶";

    const dot = document.createElement("span");
    dot.className = "folder-dot";
    dot.style.backgroundColor = dotColor;

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = title;

    const badge = document.createElement("span");
    badge.className = "tree-badge";
    badge.textContent = String(badgeCount);

    nodeBtn.append(caret, dot, label, badge);

    const childrenEl = document.createElement("div");
    childrenEl.className = "tree-children";
    if (isCollapsed) childrenEl.hidden = true;

    nodeBtn.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target === caret) {
        if (collapsedTreeNodes.has(id)) {
          collapsedTreeNodes.delete(id);
          caret.classList.add("expanded");
          childrenEl.hidden = false;
        } else {
          collapsedTreeNodes.add(id);
          caret.classList.remove("expanded");
          childrenEl.hidden = true;
        }
        return;
      }
      onTitleClick();
    });

    caret.addEventListener("click", (e) => {
      e.stopPropagation();
      if (collapsedTreeNodes.has(id)) {
        collapsedTreeNodes.delete(id);
        caret.classList.add("expanded");
        childrenEl.hidden = false;
      } else {
        collapsedTreeNodes.add(id);
        caret.classList.remove("expanded");
        childrenEl.hidden = true;
      }
    });

    sectionEl.append(nodeBtn, childrenEl);
    return { folderEl: sectionEl, childrenEl, caret };
  }

  // 1. Bookshelves (Root level like Obsidian)
  shelves.forEach((shelfName) => {
    const shelfBooks =
      shelfName === "All"
        ? books
        : books.filter((b) => b.shelf === shelfName);

    const color =
      shelfName === "All"
        ? "var(--accent)"
        : OBSIDIAN_COLORS[Math.abs(hashString(shelfName)) % OBSIDIAN_COLORS.length];

    const displayName = shelfName === "All" ? "All Books" : shelfName;

    const shelfNode = createTreeFolder(
      `shelf-${shelfName}`,
      displayName,
      color,
      shelfBooks.length,
      () => {
        activeShelf = shelfName;
        showPage("library");
      },
    );

    // Drop target: allow dropping books into this shelf
    const nodeBtn = shelfNode.folderEl.querySelector(".tree-node") as HTMLElement | null;
    if (nodeBtn) {
      nodeBtn.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        nodeBtn.classList.add("drag-over");
      });
      nodeBtn.addEventListener("dragleave", () => {
        nodeBtn.classList.remove("drag-over");
      });
      nodeBtn.addEventListener("drop", (e) => {
        e.preventDefault();
        nodeBtn.classList.remove("drag-over");
        const bookId =
          e.dataTransfer?.getData("application/x-foscl-book") ||
          e.dataTransfer?.getData("text/plain");
        if (!bookId) return;
        const book = books.find((b) => b.id === bookId);
        if (book) {
          book.shelf = shelfName === "All" ? undefined : shelfName;
          saveBooks(books);
          renderLibrary();
          renderSidebarTree();
        }
      });
    }

    if (shelfName === activeShelf && activePage === "library") {
      shelfNode.folderEl.querySelector(".tree-node")?.classList.add("active");
    }

    shelfBooks.forEach((book) => {
      const leaf = document.createElement("button");
      leaf.className = "tree-leaf";
      leaf.type = "button";
      leaf.draggable = true;
      leaf.title = `${book.title} by ${book.author}`;

      leaf.addEventListener("dragstart", (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData("application/x-foscl-book", book.id);
          e.dataTransfer.setData("text/plain", book.id);
          e.dataTransfer.effectAllowed = "move";
        }
        leaf.classList.add("is-dragging");
      });
      leaf.addEventListener("dragend", () => leaf.classList.remove("is-dragging"));

      const icon = document.createElement("span");
      icon.className = "tree-leaf-icon";
      icon.textContent = "📖";

      const bookLabel = document.createElement("span");
      bookLabel.className = "tree-label";
      bookLabel.textContent = book.title;

      leaf.append(icon, bookLabel);
      leaf.addEventListener("click", (e) => {
        e.stopPropagation();
        enterReader(book);
      });

      shelfNode.childrenEl.append(leaf);
    });

    if (shelfBooks.length === 0) {
      const emptyLeaf = document.createElement("div");
      emptyLeaf.className = "tree-leaf";
      emptyLeaf.style.opacity = "0.5";
      emptyLeaf.style.fontStyle = "italic";
      emptyLeaf.textContent = "No books";
      shelfNode.childrenEl.append(emptyLeaf);
    }

    container.append(shelfNode.folderEl);
  });

  // 2. Note Folders (Root level like Obsidian)
  const allNotes = loadNotes();
  const allFolders = loadNoteFolders();

  allFolders.forEach((folderName, fIdx) => {
    const folderNotes =
      folderName === "All"
        ? allNotes
        : allNotes.filter(
            (n) =>
              n.folder === folderName ||
              (!n.folder && folderName === "General"),
          );

    const folderColor =
      folderName === "All"
        ? "#9d4edd"
        : OBSIDIAN_COLORS[(fIdx + 2) % OBSIDIAN_COLORS.length];

    const displayName = folderName === "All" ? "All Notes" : folderName;

    const folderNode = createTreeFolder(
      `notes-folder-${folderName}`,
      displayName,
      folderColor,
      folderNotes.length,
      () => {
        showPage("notes");
      },
    );

    // Drop target: allow dropping notes into this folder
    const nodeBtn = folderNode.folderEl.querySelector(".tree-node") as HTMLElement | null;
    if (nodeBtn) {
      nodeBtn.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        nodeBtn.classList.add("drag-over");
      });
      nodeBtn.addEventListener("dragleave", () => {
        nodeBtn.classList.remove("drag-over");
      });
      nodeBtn.addEventListener("drop", (e) => {
        e.preventDefault();
        nodeBtn.classList.remove("drag-over");
        const noteId =
          e.dataTransfer?.getData("application/x-foscl-note") ||
          e.dataTransfer?.getData("text/plain");
        if (!noteId) return;
        const fresh = loadNotes();
        const targetNote = fresh.find((n) => n.id === noteId);
        if (targetNote) {
          targetNote.folder = folderName === "All" ? "General" : folderName;
          saveNotes(fresh);
          renderNotesPage();
          renderSidebarTree();
        }
      });
    }

    folderNotes.forEach((note) => {
      const leaf = document.createElement("button");
      leaf.className = "tree-leaf";
      leaf.type = "button";
      leaf.draggable = true;
      leaf.title = note.title || "Untitled";

      leaf.addEventListener("dragstart", (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData("application/x-foscl-note", note.id);
          e.dataTransfer.setData("text/plain", note.id);
          e.dataTransfer.effectAllowed = "move";
        }
        leaf.classList.add("is-dragging");
      });
      leaf.addEventListener("dragend", () => leaf.classList.remove("is-dragging"));

      const icon = document.createElement("span");
      icon.className = "tree-leaf-icon";
      icon.textContent = "📝";

      const noteLabel = document.createElement("span");
      noteLabel.className = "tree-label";
      noteLabel.textContent = note.title || "Untitled";

      leaf.append(icon, noteLabel);
      leaf.addEventListener("click", (e) => {
        e.stopPropagation();
        showPage("notes");
        openNote(note.id);
      });

      folderNode.childrenEl.append(leaf);
    });

    if (folderNotes.length === 0) {
      const emptyLeaf = document.createElement("div");
      emptyLeaf.className = "tree-leaf";
      emptyLeaf.style.opacity = "0.5";
      emptyLeaf.style.fontStyle = "italic";
      emptyLeaf.textContent = "Empty folder";
      folderNode.childrenEl.append(emptyLeaf);
    }

    container.append(folderNode.folderEl);
  });

  // 3. Recent Reads (Root level)
  const recentBooks = books
    .filter((b) => b.lastOpenedAt !== undefined)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, 10);

  if (recentBooks.length > 0) {
    const recentGroup = createTreeFolder(
      "group-recent",
      "Recent Reads",
      "#f77f00",
      recentBooks.length,
      () => {
        showPage("recent");
      },
    );

    recentBooks.forEach((book) => {
      const leaf = document.createElement("button");
      leaf.className = "tree-leaf";
      leaf.type = "button";
      leaf.title = `Last opened: ${book.title}`;

      const icon = document.createElement("span");
      icon.className = "tree-leaf-icon";
      icon.textContent = "🕒";

      const bookLabel = document.createElement("span");
      bookLabel.className = "tree-label";
      bookLabel.textContent = book.title;

      leaf.append(icon, bookLabel);
      leaf.addEventListener("click", (e) => {
        e.stopPropagation();
        enterReader(book);
      });

      recentGroup.childrenEl.append(leaf);
    });

    container.append(recentGroup.folderEl);
  }
}

function renderLibrary(): void {
  renderShelvesBar();

  const bookshelf = byId("bookshelf");
  const emptyState = byId("empty-state");
  const itemCount = byId("item-count");

  bookshelf.replaceChildren();

  const query = librarySearchQuery.toLowerCase().trim();
  let visibleBooks = query
    ? books.filter(
        (b) =>
          b.title.toLowerCase().includes(query) ||
          b.author.toLowerCase().includes(query),
      )
    : books;

  if (activeShelf !== "All") {
    visibleBooks = visibleBooks.filter((b) => b.shelf === activeShelf);
  }

  const hasAnyBooks = books.length > 0;
  emptyState.hidden = hasAnyBooks;
  bookshelf.hidden = !hasAnyBooks || visibleBooks.length === 0;
  itemCount.textContent = `${visibleBooks.length} ${
    visibleBooks.length === 1 ? "book" : "books"
  }${activeShelf !== "All" ? ` in ${activeShelf}` : ""}`;

  if (!hasAnyBooks || visibleBooks.length === 0) return;

  // Group books into shelf rows:
  type ShelfGroup = { label: string; books: Book[] };
  const groups: ShelfGroup[] = [];

  if (activeShelf !== "All") {
    groups.push({ label: activeShelf, books: visibleBooks });
  } else {
    const hasCustomShelves = visibleBooks.some((b) => !!b.shelf);
    if (hasCustomShelves) {
      const map = new Map<string, Book[]>();
      for (const b of visibleBooks) {
        const key = b.shelf || "General";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(b);
      }
      for (const [label, bks] of map.entries()) {
        groups.push({ label, books: bks });
      }
    } else {
      // Split into realistic shelf rows (up to 14 books per shelf tier)
      const CHUNK_SIZE = 14;
      for (let i = 0; i < visibleBooks.length; i += CHUNK_SIZE) {
        const chunk = visibleBooks.slice(i, i + CHUNK_SIZE);
        const shelfNum = Math.floor(i / CHUNK_SIZE) + 1;
        groups.push({
          label: visibleBooks.length > CHUNK_SIZE ? `Shelf ${shelfNum}` : "My Bookshelf",
          books: chunk,
        });
      }
    }
  }

  let globalIndex = 0;
  for (const group of groups) {
    const shelfRow = document.createElement("div");
    shelfRow.className = "shelf-row";

    const shelfHeader = document.createElement("div");
    shelfHeader.className = "shelf-header";

    const labelTag = document.createElement("span");
    labelTag.className = "shelf-label-tag";
    labelTag.textContent = group.label;

    const countTag = document.createElement("span");
    countTag.className = "shelf-count-tag";
    countTag.textContent = `${group.books.length} ${group.books.length === 1 ? "book" : "books"}`;

    shelfHeader.append(labelTag, countTag);

    const booksContainer = document.createElement("div");
    booksContainer.className = "shelf-books-container";

    for (const book of group.books) {
      globalIndex++;
      const currentIdx = globalIndex;

      // Deterministic heights & widths based on title
      let hash = 0;
      for (let i = 0; i < book.title.length; i++) {
        hash = (hash << 5) - hash + book.title.charCodeAt(i);
        hash |= 0;
      }
      const absHash = Math.abs(hash);
      const spineHeight = 185 + (absHash % 42); // 185px to 227px
      const spineWidth = 32 + (absHash % 16);   // 32px to 48px
      const colorIdx = (absHash % 5) + 1;

      const spine = document.createElement("article");
      spine.className = `book-spine spine-color-${colorIdx}`;
      spine.style.height = `${spineHeight}px`;
      spine.style.width = `${spineWidth}px`;
      spine.setAttribute("role", "button");
      spine.setAttribute("tabindex", "0");
      spine.draggable = true;
      spine.title = `Open "${book.title}" (or right-click for options)`;

      // Drag and drop support
      spine.addEventListener("dragstart", (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", book.id);
          e.dataTransfer.effectAllowed = "move";
        }
        spine.classList.add("is-dragging");
      });

      spine.addEventListener("dragend", () => {
        spine.classList.remove("is-dragging");
      });

      // Spine vertical title
      const titleSpan = document.createElement("span");
      titleSpan.className = "spine-title";
      titleSpan.textContent = book.title;

      // Spine index / number
      const indexSpan = document.createElement("span");
      indexSpan.className = "spine-index";
      indexSpan.textContent = String(currentIdx);

      // Hover tooltip
      const tooltip = document.createElement("div");
      tooltip.className = "spine-tooltip";

      const tipTitle = document.createElement("div");
      tipTitle.className = "spine-tooltip-title";
      tipTitle.textContent = book.title;

      const tipAuthor = document.createElement("div");
      tipAuthor.className = "spine-tooltip-author";
      tipAuthor.textContent = book.author || "Unknown author";

      tooltip.append(tipTitle, tipAuthor);

      if (book.progress) {
        const tipProg = document.createElement("div");
        tipProg.className = "spine-tooltip-progress";
        tipProg.textContent = `Progress: Ch. ${book.progress.chapterIndex + 1}`;
        tooltip.append(tipProg);
      }

      if (book.shelf) {
        const tipShelf = document.createElement("div");
        tipShelf.className = "spine-tooltip-shelf";
        tipShelf.textContent = `Shelf: ${book.shelf}`;
        tooltip.append(tipShelf);
      }

      spine.append(titleSpan, indexSpan, tooltip);

      const open = () => enterReader(book);
      spine.addEventListener("click", open);
      spine.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });

      // Right-click context menu for book configuration
      spine.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
          {
            label: `Open "${book.title}"`,
            icon: "📖",
            onClick: open,
          },
          {
            label: "Move to Shelf…",
            icon: "🏷️",
            onClick: () => promptShelfForBook(book),
          },
          {
            label: "Notes for this Book",
            icon: "📝",
            onClick: () => {
              createNote(book.id);
              showPage("notes");
            },
          },
          { divider: true, label: "" },
          {
            label: "Remove from Library",
            icon: "🗑️",
            danger: true,
            onClick: () => handleDeleteBook(book),
          },
        ]);
      });

      booksContainer.append(spine);
    }

    // Wooden shelf plank
    const plank = document.createElement("div");
    plank.className = "shelf-plank";
    const plankTop = document.createElement("div");
    plankTop.className = "shelf-plank-top";
    const plankFace = document.createElement("div");
    plankFace.className = "shelf-plank-face";
    plank.append(plankTop, plankFace);

    shelfRow.append(shelfHeader, booksContainer, plank);
    bookshelf.append(shelfRow);
  }
}

async function handleDeleteBook(book: Book): Promise<void> {
  if (confirm(`Remove "${book.title}" from your library?`)) {
    await deleteEpub(book.id);
    const idx = books.findIndex((b) => b.id === book.id);
    if (idx !== -1) {
      books.splice(idx, 1);
      saveBooks(books);
      renderLibrary();
      renderSidebarTree();
    }
  }
}

function promptShelfForBook(book: Book): void {
  const availableShelves = shelves.filter((s) => s !== "All");
  const optionsText = availableShelves
    .map((s, idx) => `${idx + 1}. ${s}`)
    .join("\n");
  const choice = prompt(
    `Assign "${book.title}" to a shelf:\n\n${optionsText}\n\nEnter the number, shelf name, or type "none" to remove:`,
    book.shelf || "",
  );

  if (choice === null) return;
  const trimmed = choice.trim();

  if (trimmed.toLowerCase() === "none" || trimmed === "") {
    book.shelf = undefined;
  } else {
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= availableShelves.length) {
      book.shelf = availableShelves[num - 1];
    } else {
      if (!shelves.includes(trimmed)) {
        shelves.push(trimmed);
        saveShelves(shelves);
      }
      book.shelf = trimmed;
    }
  }

  saveBooks(books);
  renderLibrary();
  renderSidebarTree();
}

// ---------------------------------------------------------------------------
// EPUB importing
// ---------------------------------------------------------------------------

const fileInput = $<HTMLInputElement>("#epub-file-input");

[
  $<HTMLButtonElement>("#add-book-button"),
  $<HTMLButtonElement>("#empty-add-book-button"),
].forEach((btn) => btn?.addEventListener("click", () => fileInput?.click()));

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    if (books.some((b) => b.fileName === file.name)) {
      throw new Error(`"${file.name}" is already in your library`);
    }

    const { book, data } = await importEpubFile(file);

    // If active on a specific shelf, assign it immediately
    if (activeShelf !== "All") {
      book.shelf = activeShelf;
    }

    await saveEpub(book.id, data);
    books.push(book);
    saveBooks(books);
    renderLibrary();
    renderSidebarTree();
  } catch (err) {
    alert(
      err instanceof Error
        ? `Could not import book:\n${err.message}`
        : "An unexpected error occurred while importing",
    );
  } finally {
    fileInput.value = "";
  }
});

// ---------------------------------------------------------------------------
// Search & Filter
// ---------------------------------------------------------------------------

const librarySearch = $<HTMLInputElement>("#library-search");
librarySearch?.addEventListener("input", (e) => {
  librarySearchQuery = (e.target as HTMLInputElement).value;
  renderLibrary();
});

const notesSearch = $<HTMLInputElement>("#notes-search");
notesSearch?.addEventListener("input", (e) => {
  filterNotes((e.target as HTMLInputElement).value);
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

byId("new-note-button")?.addEventListener("click", () => createNote());

// ---------------------------------------------------------------------------
// Theme (Cream / Sepia / Night)
// ---------------------------------------------------------------------------

function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("foscl:theme", theme);
  const toggle = byId("theme-toggle");
  if (toggle) {
    if (theme === "cream") {
      toggle.textContent = "☀";
      toggle.setAttribute(
        "aria-label",
        "Current theme: Cream. Click to switch to Sepia.",
      );
      toggle.title = "Current: Cream (Light) • Click to switch to Sepia";
    } else if (theme === "sepia") {
      toggle.textContent = "📜";
      toggle.setAttribute(
        "aria-label",
        "Current theme: Sepia. Click to switch to Night.",
      );
      toggle.title = "Current: Sepia • Click to switch to Night (Dark)";
    } else {
      toggle.textContent = "☾";
      toggle.setAttribute(
        "aria-label",
        "Current theme: Night. Click to switch to Cream.",
      );
      toggle.title = "Current: Night (Dark) • Click to switch to Cream";
    }
  }

  const sidebarThemeBtn = byId("sidebar-theme-btn");
  if (sidebarThemeBtn) {
    sidebarThemeBtn.title = `Current Theme: ${theme.toUpperCase()} (Click to cycle)`;
  }

  readerRefreshTheme();
  updateReaderThemeBtn();
}

function toggleTheme(): void {
  const currentAttr = document.documentElement.dataset.theme;
  let current: AppTheme = "night";
  if (currentAttr === "cream" || currentAttr === "light") current = "cream";
  else if (currentAttr === "sepia") current = "sepia";
  else if (currentAttr === "night" || currentAttr === "dark") current = "night";

  const nextIndex = (THEMES.indexOf(current) + 1) % THEMES.length;
  applyTheme(THEMES[nextIndex]);
}

function initTheme(): void {
  const saved = localStorage.getItem("foscl:theme");
  if (saved === "cream" || saved === "light") {
    applyTheme("cream");
    return;
  }
  if (saved === "sepia") {
    applyTheme("sepia");
    return;
  }
  if (saved === "night" || saved === "dark") {
    applyTheme("night");
    return;
  }
  const prefersLight = window.matchMedia(
    "(prefers-color-scheme: light)",
  ).matches;
  applyTheme(prefersLight ? "cream" : "night");
}

byId("theme-toggle")?.addEventListener("click", toggleTheme);

// ---------------------------------------------------------------------------
// Global File Drag & Drop (Obsidian style)
// ---------------------------------------------------------------------------

function initGlobalFileDrop(): void {
  let dragCounter = 0;
  const overlay = document.createElement("div");
  overlay.className = "global-drop-overlay";
  overlay.innerHTML = `
    <div class="drop-overlay-box">
      <span class="drop-overlay-icon">📥</span>
      <span class="drop-overlay-text">Drop EPUB or Markdown files to import</span>
    </div>
  `;
  document.body.append(overlay);

  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer?.types.includes("Files")) {
      dragCounter++;
      overlay.classList.add("visible");
    }
  });

  window.addEventListener("dragleave", (e) => {
    if (e.dataTransfer?.types.includes("Files")) {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay.classList.remove("visible");
      }
    }
  });

  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  });

  window.addEventListener("drop", async (e) => {
    dragCounter = 0;
    overlay.classList.remove("visible");
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".epub")) {
        try {
          if (!books.some((b) => b.fileName === file.name)) {
            const { book, data } = await importEpubFile(file);
            if (activeShelf !== "All") book.shelf = activeShelf;
            await saveEpub(book.id, data);
            books.push(book);
            saveBooks(books);
            renderLibrary();
            renderSidebarTree();
          }
        } catch (err) {
          console.error("Failed to import dropped epub:", err);
        }
      } else if (lower.endsWith(".md") || lower.endsWith(".txt")) {
        try {
          const text = await file.text();
          const title = file.name.replace(/\.[^/.]+$/, "");
          const note: Note = {
            id: crypto.randomUUID(),
            title,
            content: text,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            folder: "General",
          };
          const notes = loadNotes();
          notes.unshift(note);
          saveNotes(notes);
          openNote(note.id);
          showPage("notes");
          renderSidebarTree();
        } catch (err) {
          console.error("Failed to import dropped note:", err);
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initTheme();
initGlobalFileDrop();
showPage("library");