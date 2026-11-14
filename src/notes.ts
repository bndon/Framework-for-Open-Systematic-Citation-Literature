import type { Note, Book } from "./types";
import {
  loadNotes,
  saveNotes,
  loadBooks,
  loadNoteFolders,
  saveNoteFolders,
} from "./bookStorage";
import { showContextMenu } from "./contextMenu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function downloadNoteAsMarkdown(note: Note): void {
  const title = note.title.trim() || "untitled-note";
  const filename = `${title.replace(/[/\\?%*:|"<>]/g, "_")}.md`;
  const blob = new Blob([note.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportNoteWithPicker(note: Note): Promise<void> {
  const title = note.title.trim() || "untitled-note";
  const filename = `${title.replace(/[/\\?%*:|"<>]/g, "_")}.md`;

  // Try native File System Access API (allows picking destination folder & filename)
  if ("showSaveFilePicker" in window) {
    try {
      const picker = (window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (data: string) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      }).showSaveFilePicker;

      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: "Markdown Document (.md)",
            accept: { "text/markdown": [".md"], "text/plain": [".txt"] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(note.content);
      await writable.close();
      return;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return; // User cancelled
      }
    }
  }

  // Fallback to standard browser download
  downloadNoteAsMarkdown(note);
}

function extractWikilinks(text: string): string[] {
  const matches = text.match(/\[\[(.*?)\]\]/g);
  if (!matches) return [];
  const titles = new Set<string>();
  for (const m of matches) {
    const title = m.slice(2, -2).trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let activeId: string | null = null;
let searchQuery = "";
let noteFolders: string[] = loadNoteFolders();
let activeFolder = "All";

let openBookAtPageCallback:
  | ((bookId: string, page?: number, chapter?: number) => void)
  | null = null;

export function setBookOpenerCallback(
  cb: (bookId: string, page?: number, chapter?: number) => void,
): void {
  openBookAtPageCallback = cb;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Call when navigating to the Notes page. */
export function renderNotesPage(): void {
  renderFolderBar();
  renderList();
  if (activeId) {
    const notes = loadNotes();
    if (notes.some((n) => n.id === activeId)) {
      renderEditor(activeId);
    } else {
      activeId = null;
      showEditorPlaceholder();
    }
  } else {
    showEditorPlaceholder();
  }
}

/** Create a blank note (optionally linked to a book/folder) and open it. */
export function createNote(bookId?: string, folder?: string): void {
  const note: Note = {
    id: crypto.randomUUID(),
    title: "",
    content: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookId,
    folder: folder || (activeFolder !== "All" ? activeFolder : "General"),
  };
  const notes = loadNotes();
  notes.unshift(note);
  saveNotes(notes);
  openNote(note.id);
}

/** Set notes search filter */
export function filterNotes(query: string): void {
  searchQuery = query.toLowerCase().trim();
  renderList();
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

function renderFolderBar(): void {
  const bar = document.getElementById("notes-folder-bar");
  if (!bar) return;
  bar.innerHTML = "";

  noteFolders.forEach((folderName) => {
    const btn = document.createElement("button");
    btn.className = "folder-tab-btn";
    if (folderName === activeFolder) btn.classList.add("active");
    btn.type = "button";
    btn.textContent = folderName;
    btn.addEventListener("click", () => {
      activeFolder = folderName;
      renderFolderBar();
      renderList();
    });
    bar.append(btn);
  });

  const addFolderBtn = document.createElement("button");
  addFolderBtn.className = "folder-tab-btn folder-tab-add-btn";
  addFolderBtn.type = "button";
  addFolderBtn.textContent = "+ Folder";
  addFolderBtn.title = "Create a new folder for notes";
  addFolderBtn.addEventListener("click", () => {
    const name = prompt("Enter new folder name (e.g. Work, Summaries, Quotes):");
    const trimmed = name?.trim();
    if (trimmed && !noteFolders.includes(trimmed)) {
      noteFolders.push(trimmed);
      saveNoteFolders(noteFolders);
      activeFolder = trimmed;
      renderFolderBar();
      renderList();
    }
  });
  bar.append(addFolderBtn);
}

// ---------------------------------------------------------------------------
// Notes List
// ---------------------------------------------------------------------------

function renderList(): void {
  const panel = document.getElementById("notes-list");
  if (!panel) return;
  panel.innerHTML = "";

  const notes = loadNotes();
  const books = loadBooks();
  const bookMap = new Map<string, Book>(books.map((b) => [b.id, b]));

  let filtered = notes;

  if (activeFolder !== "All") {
    filtered = filtered.filter(
      (n) => (n.folder || "General").toLowerCase() === activeFolder.toLowerCase(),
    );
  }

  if (searchQuery) {
    filtered = filtered.filter(
      (n) =>
        n.title.toLowerCase().includes(searchQuery) ||
        n.content.toLowerCase().includes(searchQuery),
    );
  }

  if (filtered.length === 0) {
    const p = document.createElement("p");
    p.className = "notes-list-empty";
    p.textContent = searchQuery
      ? "No matching notes."
      : activeFolder !== "All"
      ? `No notes in folder "${activeFolder}".`
      : "No notes yet.";
    panel.append(p);
    return;
  }

  for (const note of filtered) {
    const btn = document.createElement("button");
    btn.className = "note-list-item";
    btn.dataset.id = note.id;
    if (note.id === activeId) btn.classList.add("active");
    btn.type = "button";

    const title = document.createElement("span");
    title.className = "note-item-title";
    title.textContent = note.title || "Untitled";

    const meta = document.createElement("div");
    meta.className = "note-item-meta";

    const date = document.createElement("span");
    date.className = "note-item-date";
    date.textContent = fmt(note.updatedAt);
    meta.append(date);

    if (note.folder && note.folder !== "General") {
      const folderTag = document.createElement("span");
      folderTag.className = "note-item-folder";
      folderTag.textContent = `📁 ${note.folder}`;
      meta.append(folderTag);
    }

    if (note.bookId) {
      const book = bookMap.get(note.bookId);
      if (book) {
        const bookTag = document.createElement("span");
        bookTag.className = "note-item-book";
        const pageText = note.bookPage ? ` • p. ${note.bookPage}` : "";
        bookTag.textContent = `📖 ${book.title}${pageText}`;
        bookTag.title = `Linked to: ${book.title}${note.bookPage ? ` (Page ${note.bookPage})` : ""}. Click to open book.`;
        bookTag.addEventListener("click", (e) => {
          e.stopPropagation();
          openBookAtPageCallback?.(note.bookId!, note.bookPage, note.bookChapter);
        });
        meta.append(bookTag);
      }
    }

    btn.append(title, meta);
    btn.addEventListener("click", () => openNote(note.id));

    // Right-click context menu for note configuration
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showNoteContextMenu(e.clientX, e.clientY, note);
    });

    panel.append(btn);
  }
}

function showNoteContextMenu(x: number, y: number, note: Note): void {
  const books = loadBooks();
  const availableFolders = noteFolders.filter((f) => f !== "All");

  showContextMenu(x, y, [
    {
      label: "Open Note",
      icon: "📝",
      onClick: () => openNote(note.id),
    },
    {
      label: "Move to Folder…",
      icon: "📁",
      onClick: () => {
        const folderOptions = availableFolders
          .map((f, i) => `${i + 1}. ${f}`)
          .join("\n");
        const choice = prompt(
          `Move note to folder:\n\n${folderOptions}\n\nEnter folder name or number:`,
          note.folder || "General",
        );
        if (!choice) return;
        const trimmed = choice.trim();
        const num = parseInt(trimmed, 10);
        let chosenFolder = trimmed;
        if (!isNaN(num) && num >= 1 && num <= availableFolders.length) {
          chosenFolder = availableFolders[num - 1];
        } else if (!noteFolders.includes(trimmed)) {
          noteFolders.push(trimmed);
          saveNoteFolders(noteFolders);
          renderFolderBar();
        }

        const fresh = loadNotes();
        const idx = fresh.findIndex((n) => n.id === note.id);
        if (idx !== -1) {
          fresh[idx].folder = chosenFolder;
          saveNotes(fresh);
          renderList();
          if (activeId === note.id) renderEditor(note.id);
        }
      },
    },
    {
      label: note.bookId ? "Change / Unlink Book…" : "Link to Book…",
      icon: "📖",
      onClick: () => {
        const bookOptions = books.map((b, i) => `${i + 1}. ${b.title}`).join("\n");
        const choice = prompt(
          `Link note to book:\n\n${bookOptions}\n\nEnter book number or type "none" to unlink:`,
          "",
        );
        if (choice === null) return;
        const trimmed = choice.trim();

        const fresh = loadNotes();
        const idx = fresh.findIndex((n) => n.id === note.id);
        if (idx === -1) return;

        if (trimmed.toLowerCase() === "none" || trimmed === "") {
          fresh[idx].bookId = undefined;
        } else {
          const num = parseInt(trimmed, 10);
          if (!isNaN(num) && num >= 1 && num <= books.length) {
            fresh[idx].bookId = books[num - 1].id;
          }
        }
        saveNotes(fresh);
        renderList();
        if (activeId === note.id) renderEditor(note.id);
      },
    },
    {
      label: "Export Note (.md)…",
      icon: "📥",
      onClick: () => exportNoteWithPicker(note),
    },
    { divider: true, label: "" },
    {
      label: "Delete Note",
      icon: "🗑️",
      danger: true,
      onClick: () => {
        if (confirm(`Delete note "${note.title || "Untitled"}"?`)) {
          const fresh = loadNotes().filter((n) => n.id !== note.id);
          saveNotes(fresh);
          if (activeId === note.id) {
            activeId = null;
            showEditorPlaceholder();
          }
          renderList();
        }
      },
    },
  ]);
}

export function openNote(id: string): void {
  activeId = id;
  renderList();
  renderEditor(id);
}

function renderEditor(id: string): void {
  const editorEl = document.getElementById("notes-editor");
  if (!editorEl) return;

  const notes = loadNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) {
    showEditorPlaceholder();
    return;
  }
  const currentNoteFolder = note.folder;

  editorEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "note-editor-header";

  const titleInput = document.createElement("input");
  titleInput.className = "note-title-input";
  titleInput.type = "text";
  titleInput.value = note.title;
  titleInput.placeholder = "Note title";
  titleInput.spellcheck = true;

  // Folder selector dropdown
  const folderSelect = document.createElement("select");
  folderSelect.className = "note-folder-select";
  folderSelect.title = "Folder";
  const availableFolders = noteFolders.filter((f) => f !== "All");
  availableFolders.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = `📁 ${f}`;
    if ((note.folder || "General") === f) opt.selected = true;
    folderSelect.append(opt);
  });

  // Book association selector
  const books = loadBooks();
  const bookSelect = document.createElement("select");
  bookSelect.className = "note-book-select";
  bookSelect.title = "Associate this note with a book";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Standalone note";
  bookSelect.append(defaultOpt);

  for (const b of books) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = `📖 ${b.title}`;
    if (note.bookId === b.id) opt.selected = true;
    bookSelect.append(opt);
  }

  const pageInput = document.createElement("input");
  pageInput.className = "note-page-input";
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.placeholder = "Page #";
  pageInput.title = "Linked page number in book";
  pageInput.value = note.bookPage ? String(note.bookPage) : "";
  pageInput.style.display = note.bookId ? "inline-block" : "none";

  const jumpBtn = document.createElement("button");
  jumpBtn.className = "note-jump-page-btn";
  jumpBtn.type = "button";
  jumpBtn.title = "Jump to this book page in reader";
  jumpBtn.innerHTML = `<span>📖 Open Page</span>`;
  jumpBtn.style.display =
    note.bookId && note.bookPage ? "inline-flex" : "none";
  jumpBtn.addEventListener("click", () => {
    if (note.bookId) {
      openBookAtPageCallback?.(note.bookId, note.bookPage, note.bookChapter);
    }
  });

  const exportBtn = document.createElement("button");
  exportBtn.className = "icon-button note-export-btn";
  exportBtn.type = "button";
  exportBtn.title = "Export note as Markdown (.md) with destination selection";
  exportBtn.textContent = "↓";
  exportBtn.addEventListener("click", () => {
    exportNoteWithPicker(note);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "icon-button note-delete-btn";
  deleteBtn.type = "button";
  deleteBtn.title = "Delete this note";
  deleteBtn.textContent = "✕";

  header.append(
    titleInput,
    folderSelect,
    bookSelect,
    pageInput,
    jumpBtn,
    exportBtn,
    deleteBtn,
  );

  const body = document.createElement("textarea");
  body.className = "note-body";
  body.value = note.content;
  body.placeholder =
    "Start writing… Use [[Other Note]] to link ideas together, Obsidian-style.";
  body.spellcheck = true;

  // Linked notes tray (Wikilinks)
  const linksTray = document.createElement("div");
  linksTray.className = "note-links-tray";

  function updateWikilinks(): void {
    linksTray.innerHTML = "";
    const links = extractWikilinks(body.value);
    if (links.length === 0) {
      linksTray.hidden = true;
      return;
    }
    linksTray.hidden = false;

    const label = document.createElement("span");
    label.className = "note-links-label";
    label.textContent = "Connected notes:";
    linksTray.append(label);

    const allNotes = loadNotes();
    for (const title of links) {
      const linkBtn = document.createElement("button");
      linkBtn.type = "button";
      linkBtn.className = "note-wikilink-btn";
      const targetNote = allNotes.find(
        (n) => n.title.toLowerCase() === title.toLowerCase(),
      );

      if (targetNote) {
        linkBtn.textContent = `[[${title}]]`;
        linkBtn.title = `Go to note "${title}"`;
        linkBtn.addEventListener("click", () => openNote(targetNote.id));
      } else {
        linkBtn.textContent = `[[+ ${title}]]`;
        linkBtn.title = `Create new note "${title}"`;
        linkBtn.classList.add("note-wikilink--new");
        linkBtn.addEventListener("click", () => {
          const newNote: Note = {
            id: crypto.randomUUID(),
            title,
            content: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            folder: currentNoteFolder,
          };
          const fresh = loadNotes();
          fresh.unshift(newNote);
          saveNotes(fresh);
          openNote(newNote.id);
        });
      }
      linksTray.append(linkBtn);
    }
  }

  editorEl.append(header, body, linksTray);
  titleInput.focus();
  updateWikilinks();

  // Autosave
  let saveTimeout: number | undefined;
  const autosave = (): void => {
    window.clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      const fresh = loadNotes();
      const idx = fresh.findIndex((n) => n.id === id);
      if (idx === -1) return;
      const pNum = parseInt(pageInput.value, 10);
      const chosenBookId = bookSelect.value || undefined;
      const chosenBook = chosenBookId
        ? books.find((b) => b.id === chosenBookId)
        : undefined;

      fresh[idx] = {
        ...fresh[idx],
        title: titleInput.value.trim(),
        content: body.value,
        folder: folderSelect.value,
        bookId: chosenBookId,
        bookTitle: chosenBook?.title,
        bookPage:
          chosenBookId && !isNaN(pNum) && pNum > 0 ? pNum : undefined,
        updatedAt: Date.now(),
      };
      saveNotes(fresh);

      const item = document.querySelector<HTMLElement>(
        `.note-list-item[data-id="${id}"]`,
      );
      if (item) {
        const titleSpan = item.querySelector(".note-item-title");
        if (titleSpan) {
          titleSpan.textContent = titleInput.value.trim() || "Untitled";
        }
      }
      updateWikilinks();
    }, 200);
  };

  titleInput.addEventListener("input", autosave);
  body.addEventListener("input", autosave);
  pageInput.addEventListener("input", () => {
    const val = parseInt(pageInput.value, 10);
    jumpBtn.style.display =
      bookSelect.value && !isNaN(val) && val > 0 ? "inline-flex" : "none";
    autosave();
    renderList();
  });
  folderSelect.addEventListener("change", () => {
    autosave();
    renderList();
  });
  bookSelect.addEventListener("change", () => {
    pageInput.style.display = bookSelect.value ? "inline-block" : "none";
    const val = parseInt(pageInput.value, 10);
    jumpBtn.style.display =
      bookSelect.value && !isNaN(val) && val > 0 ? "inline-flex" : "none";
    autosave();
    renderList();
  });

  deleteBtn.addEventListener("click", () => {
    if (confirm("Delete this note?")) {
      const fresh = loadNotes().filter((n) => n.id !== id);
      saveNotes(fresh);
      activeId = null;
      renderList();
      showEditorPlaceholder();
    }
  });
}

function showEditorPlaceholder(): void {
  const editorEl = document.getElementById("notes-editor");
  if (!editorEl) return;
  editorEl.innerHTML =
    '<p class="notes-editor-placeholder">Select a note or create a new one.</p>';
}
