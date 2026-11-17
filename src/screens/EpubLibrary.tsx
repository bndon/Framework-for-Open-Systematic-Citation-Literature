import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { loadBooks, saveBooks, loadShelves } from "../bookStorage";
import { saveEpub, loadEpub, deleteEpub } from "../db";
import { parseEpub, importEpubFile, loadFullBookHtml, type ParsedEpub } from "../epub";
import { isDarkColor } from "../lib/settings";
import {
  HL_COLORS,
  type HlColor,
  type Highlight,
  loadHighlights,
  saveHighlights,
  deleteHighlightsFor,
  selectionToDraft,
  paintHighlight,
  clearMarks,
  recolorMarks,
  highlightCss,
  highlightsMarkdown,
} from "../lib/highlights";
import { saveTextFile } from "../lib/saveFile";
import { toast } from "../lib/toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Book, ReadingMode } from "../types";

// ---------------------------------------------------------------------------
// Reader preferences (remembered between sessions)
// ---------------------------------------------------------------------------
type PageTheme = "cream" | "sepia" | "night";
interface ReaderPrefs {
  theme: PageTheme;
  size: number;
  mode: ReadingMode;
}

const PREFS_KEY = "foscl:epub_prefs";
const MIN_SIZE = 13;
const MAX_SIZE = 28;

const PAGE_THEMES: { id: PageTheme; label: string; swatch: string; ink: string }[] = [
  { id: "cream", label: "Cream", swatch: "#fbf8f1", ink: "#2b2724" },
  { id: "sepia", label: "Sepia", swatch: "#f4ebd6", ink: "#3a2c1b" },
  { id: "night", label: "Night", swatch: "#161c1e", ink: "#edf2f4" },
];

const MODES: { id: ReadingMode; label: string; hint: string }[] = [
  { id: "continuous", label: "Scroll", hint: "One long page you scroll through" },
  { id: "single", label: "Page", hint: "One page at a time" },
  { id: "double", label: "Spread", hint: "Two pages side by side" },
];

function defaultPrefs(): ReaderPrefs {
  // start with whichever page colour matches the app theme
  let theme: PageTheme = "cream";
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg");
    if (isDarkColor(bg)) theme = "night";
  } catch {}
  return { theme, size: 17, mode: "continuous" };
}

function loadPrefs(): ReaderPrefs {
  const base = defaultPrefs();
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!p) return base;
    return {
      theme: PAGE_THEMES.some((t) => t.id === p.theme) ? p.theme : base.theme,
      size: typeof p.size === "number" ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, p.size)) : base.size,
      mode: MODES.some((m) => m.id === p.mode) ? p.mode : base.mode,
    };
  } catch {
    return base;
  }
}

function savePrefs(p: ReaderPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {}
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
type SortKey = "recent" | "title" | "added";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recently read" },
  { id: "title", label: "Title A–Z" },
  { id: "added", label: "Recently added" },
];

function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

function ago(ts?: number): string {
  if (!ts) return "Not opened yet";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return "Opened today";
  if (days === 1) return "Opened yesterday";
  if (days < 30) return `Opened ${days} days ago`;
  return `Opened ${new Date(ts).toLocaleDateString()}`;
}

const btn = (primary = false): React.CSSProperties => ({
  padding: "7px 14px",
  borderRadius: "6px",
  border: primary ? "1px solid transparent" : "1px solid var(--border)",
  background: primary ? "var(--accent)" : "var(--panel-dark)",
  color: primary ? "var(--on-accent)" : "var(--text-main)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
});

const Cover: React.FC<{ book: Book; w?: number }> = ({ book, w }) => {
  const h = hueOf(book.title + book.author);
  const initials = book.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return book.coverDataUrl ? (
    <img
      src={book.coverDataUrl}
      alt=""
      style={{ width: w ?? "100%", aspectRatio: "3 / 4", objectFit: "cover", display: "block", background: "var(--panel)" }}
    />
  ) : (
    <div
      aria-hidden="true"
      style={{
        width: w ?? "100%",
        aspectRatio: "3 / 4",
        background: `linear-gradient(160deg, hsl(${h} 38% 34%), hsl(${(h + 40) % 360} 38% 24%))`,
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "34px",
        fontWeight: 700,
        letterSpacing: "1px",
        fontFamily: "Georgia, serif",
      }}
    >
      {initials || "📖"}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export const EpubLibrary: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const booksRef = useRef<Book[]>([]);
  const [shelves, setShelves] = useState<string[]>(["All"]);
  const [shelf, setShelf] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Book | null>(null);

  // reader
  const [reading, setReading] = useState<Book | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<ReaderPrefs>(loadPrefs);
  const [tocOpen, setTocOpen] = useState(false);

  // highlights and notes
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const highlightsRef = useRef<Highlight[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [activeHl, setActiveHl] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<Set<string>>(new Set());
  const [pop, setPop] = useState<{ left: number; top: number; draft: NonNullable<ReturnType<typeof selectionToDraft>> extends infer T ? (T extends { draft: infer D } ? D : never) : never } | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [percent, setPercent] = useState(0);
  const parsedRef = useRef<ParsedEpub | null>(null);
  const [chapterCount, setChapterCount] = useState(0);
  const [tocItems, setTocItems] = useState<{ key: string; title: string; chapterIndex: number; anchor?: string }[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingJump = useRef<number>(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const readingRef = useRef<Book | null>(null);
  readingRef.current = reading;
  const chapterRef = useRef(0);

  useEffect(() => {
    const b = loadBooks();
    booksRef.current = b;
    setBooks(b);
    setShelves(loadShelves());
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const commit = useCallback((next: Book[]) => {
    booksRef.current = next;
    setBooks(next);
    saveBooks(next);
  }, []);

  const patchBook = useCallback(
    (id: string, patch: Partial<Book>) => {
      commit(booksRef.current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [commit]
  );

  // ----- import / delete ----------------------------------------------------
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file again
    if (!files.length) return;
    setImporting(true);
    let added = 0;
    const failed: string[] = [];
    for (const file of files) {
      try {
        const { book, data } = await importEpubFile(file);
        const dup = booksRef.current.find((b) => b.fileName === book.fileName && b.title === book.title);
        if (dup) {
          failed.push(`${file.name} (already in the library)`);
          continue;
        }
        await saveEpub(book.id, data);
        commit([book, ...booksRef.current]);
        added++;
      } catch (err: any) {
        failed.push(`${file.name} (${err?.message || String(err)})`);
      }
    }
    setImporting(false);
    if (failed.length) setNotice({ kind: "error", text: `${added ? `Added ${added}. ` : ""}Could not add: ${failed.join("; ")}` });
    else setNotice({ kind: "ok", text: added === 1 ? "Book added to your library." : `${added} books added to your library.` });
  };

  const doDelete = async () => {
    const b = confirmDelete;
    if (!b) return;
    setConfirmDelete(null);
    try {
      await deleteEpub(b.id);
    } catch {}
    deleteHighlightsFor(b.id);
    commit(booksRef.current.filter((x) => x.id !== b.id));
    setNotice({ kind: "ok", text: `Removed "${b.title}" and its highlights.` });
  };

  // ----- reader -------------------------------------------------------------
  const render = useCallback(async (p: ReaderPrefs) => {
    const parsed = parsedRef.current;
    if (!parsed) return;
    setLoading(true);
    try {
      setHtml(await loadFullBookHtml(parsed, p.theme, p.size, p.mode));
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  const openBook = async (b: Book) => {
    setReading(b);
    setHtml(null);
    setTocOpen(false);
    setNotesOpen(false);
    setPop(null);
    setActiveHl(null);
    const saved = loadHighlights(b.id);
    highlightsRef.current = saved;
    setHighlights(saved);
    setLoading(true);
    setPercent(b.progress?.percent ?? 0);
    try {
      const data = await loadEpub(b.id);
      if (!data) throw new Error("This book's file is missing from local storage. Remove it and import it again.");
      const parsed = await parseEpub(data);
      parsedRef.current = parsed;
      setChapterCount(parsed.chapters.length);
      setTocItems(
        (parsed.toc.length
          ? parsed.toc.map((t) => ({ key: t.id, title: t.title, chapterIndex: t.chapterIndex, anchor: t.anchor }))
          : parsed.chapters.map((c, i) => ({ key: c.id, title: c.title || `Section ${i + 1}`, chapterIndex: i }))
        ).filter((t) => t.chapterIndex >= 0)
      );
      const start = Math.min(b.progress?.chapterIndex ?? 0, Math.max(0, parsed.chapters.length - 1));
      pendingJump.current = start;
      chapterRef.current = start;
      setChapterIdx(start);
      patchBook(b.id, { lastOpenedAt: Date.now() });
      await render(prefsRef.current);
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || String(err) });
      setReading(null);
      setLoading(false);
    }
  };

  const closeBook = () => {
    window.clearTimeout(saveTimer.current);
    setReading(null);
    setHtml(null);
    parsedRef.current = null;
  };

  const updatePrefs = (patch: Partial<ReaderPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    setPrefs(next);
    savePrefs(next);
    // changing the look re-renders the book; keep the reader where they were
    pendingJump.current = chapterRef.current;
    void render(next);
  };

  const docOf = () => iframeRef.current?.contentDocument || null;
  const paged = prefs.mode !== "continuous";

  const jumpTo = (index: number, anchor?: string) => {
    const doc = docOf();
    if (!doc) return;
    const el = doc.getElementById(`foscl-chapter-${index}`);
    if (!el) return;
    if (!paged) {
      const target = (anchor && doc.getElementById(anchor)) || el;
      target.scrollIntoView({ block: "start" });
    } else {
      const pw = doc.documentElement.clientWidth || 1;
      doc.body.scrollLeft = Math.round(el.offsetLeft / pw) * pw;
    }
    measure();
  };

  const measure = useCallback(() => {
    const doc = docOf();
    if (!doc || !doc.body) return;
    const vh = doc.documentElement.clientHeight || window.innerHeight;
    const isPaged = prefsRef.current.mode !== "continuous";
    let pct = 0;
    if (isPaged) {
      const max = doc.body.scrollWidth - doc.body.clientWidth;
      pct = max > 0 ? doc.body.scrollLeft / max : 0;
    } else {
      const se = doc.scrollingElement || doc.documentElement;
      const max = se.scrollHeight - se.clientHeight;
      pct = max > 0 ? se.scrollTop / max : 0;
    }
    let current = 0;
    doc.querySelectorAll<HTMLElement>(".foscl-chapter").forEach((s) => {
      const r = s.getBoundingClientRect();
      if (isPaged ? r.left <= 80 : r.top <= vh * 0.35) current = Number(s.dataset.chapterIndex ?? 0);
    });
    setPercent(pct);
    setChapterIdx(current);
    chapterRef.current = current;
    // remember the position (debounced so scrolling stays smooth)
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const b = readingRef.current;
      if (b) patchBook(b.id, { progress: { chapterIndex: current, percent: pct } });
    }, 600);
  }, [patchBook]);

  const turn = (dir: 1 | -1) => {
    const doc = docOf();
    if (!doc) return;
    if (paged) {
      const pw = doc.documentElement.clientWidth || 1;
      doc.body.scrollBy({ left: dir * pw, behavior: "smooth" });
    } else {
      const se = doc.scrollingElement || doc.documentElement;
      se.scrollBy({ top: dir * se.clientHeight * 0.9, behavior: "smooth" });
    }
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // ----- highlights ---------------------------------------------------------
  const commitHighlights = (next: Highlight[]) => {
    highlightsRef.current = next;
    setHighlights(next);
    if (readingRef.current) saveHighlights(readingRef.current.id, next);
  };

  const paintAll = (doc: Document) => {
    const bad = new Set<string>();
    for (const h of highlightsRef.current) {
      try {
        if (!paintHighlight(doc, h)) bad.add(h.id);
      } catch {
        bad.add(h.id);
      }
    }
    setOrphans(bad);
  };

  const flash = (id: string) => {
    const doc = docOf();
    if (!doc) return;
    const marks = doc.querySelectorAll(`mark.foscl-hl[data-hl="${id}"]`);
    marks.forEach((m) => m.classList.add("foscl-hl-flash"));
    window.setTimeout(() => marks.forEach((m) => m.classList.remove("foscl-hl-flash")), 1400);
  };

  const goToHighlight = (h: Highlight) => {
    const doc = docOf();
    if (!doc) return;
    const mark = doc.querySelector<HTMLElement>(`mark.foscl-hl[data-hl="${h.id}"]`);
    if (!mark) {
      jumpTo(h.chapter);
      return;
    }
    if (prefsRef.current.mode === "continuous") mark.scrollIntoView({ block: "center" });
    else {
      const pw = doc.documentElement.clientWidth || 1;
      const x = mark.getBoundingClientRect().left + doc.body.scrollLeft;
      doc.body.scrollLeft = Math.floor(x / pw) * pw;
    }
    flash(h.id);
    measure();
  };

  const addHighlight = (color: HlColor, withNote = false) => {
    if (!pop) return;
    const h: Highlight = {
      id: `hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      ...pop.draft,
      color,
      note: "",
      createdAt: Date.now(),
    };
    const doc = docOf();
    if (doc) {
      try {
        paintHighlight(doc, h);
      } catch {}
      doc.getSelection()?.removeAllRanges();
    }
    commitHighlights([...highlightsRef.current, h]);
    setPop(null);
    if (withNote) {
      setNotesOpen(true);
      setActiveHl(h.id);
    }
  };

  const changeHighlight = (id: string, patch: Partial<Pick<Highlight, "color" | "note">>) => {
    const next = highlightsRef.current.map((h) => (h.id === id ? { ...h, ...patch } : h));
    commitHighlights(next);
    const h = next.find((x) => x.id === id);
    const doc = docOf();
    if (h && doc) recolorMarks(doc, id, h.color, !!h.note.trim());
  };

  const removeHighlight = (id: string) => {
    const doc = docOf();
    if (doc) clearMarks(doc, id);
    commitHighlights(highlightsRef.current.filter((h) => h.id !== id));
    if (activeHl === id) setActiveHl(null);
  };

  const exportNotes = async () => {
    const b = readingRef.current;
    if (!b) return;
    const titleOf = (chapter: number) => tocItems.slice().reverse().find((t) => t.chapterIndex <= chapter)?.title || `Section ${chapter + 1}`;
    const md = highlightsMarkdown(b.title, b.author || "", highlightsRef.current, titleOf);
    try {
      const where = await saveTextFile(`${b.title.replace(/[^a-zA-Z0-9_-]+/g, "_")}_highlights.md`, md, { name: "Markdown", extensions: ["md"] }, "text/markdown");
      if (where) toast.success(`Saved your highlights: ${where}`);
    } catch (err: any) {
      toast.error("Could not save: " + (err?.toString?.() ?? err));
    }
  };

  const copyNotes = async () => {
    const b = readingRef.current;
    if (!b) return;
    const titleOf = (chapter: number) => tocItems.slice().reverse().find((t) => t.chapterIndex <= chapter)?.title || `Section ${chapter + 1}`;
    try {
      await navigator.clipboard.writeText(highlightsMarkdown(b.title, b.author || "", highlightsRef.current, titleOf));
      toast.success("Highlights copied as Markdown");
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };

  const onFrameLoad = () => {
    const doc = docOf();
    if (!doc) return;
    doc.addEventListener("scroll", measure, true);
    doc.addEventListener("scroll", () => setPop(null), true);

    // highlight styles and the saved highlights
    const style = doc.createElement("style");
    style.id = "foscl-hl-style";
    style.textContent = highlightCss(prefsRef.current.theme);
    doc.head.appendChild(style);
    paintAll(doc);

    // a finished selection offers the highlight colours next to it
    const onSelect = () => {
      window.setTimeout(() => {
        const d = docOf();
        if (!d) return;
        const res = selectionToDraft(d);
        if (!res) return setPop(null);
        if ("error" in res) {
          toast.info(res.error);
          return setPop(null);
        }
        const frame = iframeRef.current?.getBoundingClientRect();
        if (!frame) return;
        const left = Math.min(Math.max(8, frame.left + res.rect.left), window.innerWidth - 250);
        const top = Math.max(8, frame.top + res.rect.top - 48);
        setPop({ left, top, draft: res.draft });
      }, 10);
    };
    doc.addEventListener("mouseup", onSelect);
    doc.addEventListener("keyup", (e) => {
      if (e.key.startsWith("Arrow") && e.shiftKey) onSelect();
    });
    doc.addEventListener("mousedown", () => setPop(null));
    doc.addEventListener("click", (e) => {
      const m = (e.target as HTMLElement | null)?.closest?.("mark.foscl-hl") as HTMLElement | null;
      if (m && doc.getSelection()?.isCollapsed) {
        setNotesOpen(true);
        setActiveHl(m.dataset.hl || null);
        flash(m.dataset.hl || "");
      }
    });

    doc.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        turnRef.current(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        turnRef.current(-1);
      } else if (e.key === "Escape") {
        // forward to the app so Esc still opens the menu while the book has focus
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }
    });
    // images/fonts can change the layout a moment after load, so jump twice
    jumpTo(pendingJump.current);
    window.setTimeout(() => jumpTo(pendingJump.current), 250);
  };

  // arrow keys also work when focus is outside the book (e.g. after clicking the toolbar)
  useEffect(() => {
    if (!reading) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") turnRef.current(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") turnRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  // ----- derived library list ----------------------------------------------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = books.filter(
      (b) =>
        (shelf === "All" || b.shelf === shelf) &&
        (!q || b.title.toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q))
    );
    list.sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "added"
        ? b.addedAt - a.addedAt
        : (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || b.addedAt - a.addedAt
    );
    return list;
  }, [books, shelf, query, sort]);

  const lastRead = useMemo(() => {
    const opened = books.filter((b) => b.lastOpenedAt);
    return opened.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))[0];
  }, [books]);

  const fileInput = (
    <input id="epub-upload" type="file" accept=".epub" multiple onChange={handleImport} style={{ display: "none" }} />
  );
  const pickFile = () => document.getElementById("epub-upload")?.click();

  // =========================================================================
  // Reader view
  // =========================================================================
  if (reading) {
    const pageTheme = PAGE_THEMES.find((t) => t.id === prefs.theme)!;
    const chapterTitle = tocItems.slice().reverse().find((t) => t.chapterIndex <= chapterIdx)?.title;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        {fileInput}
        {/* toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            padding: "10px 20px",
            background: "var(--panel)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button onClick={closeBook} style={btn()}>
            ← Bookshelf
          </button>
          <button onClick={() => setTocOpen((v) => !v)} aria-pressed={tocOpen} style={{ ...btn(tocOpen) }}>
            ☰ Contents
          </button>
          <button onClick={() => setNotesOpen((v) => !v)} aria-pressed={notesOpen} style={{ ...btn(notesOpen) }} title="Your highlights and notes in this book">
            🖍 Notes{highlights.length ? ` (${highlights.length})` : ""}
          </button>
          <div style={{ minWidth: 0, flex: "1 1 160px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {reading.title}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {reading.author}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }} aria-label="Text size">
            <button
              onClick={() => updatePrefs({ size: Math.max(MIN_SIZE, prefs.size - 1) })}
              disabled={prefs.size <= MIN_SIZE}
              style={{ ...btn(), padding: "5px 10px", fontSize: "12px", opacity: prefs.size <= MIN_SIZE ? 0.45 : 1 }}
              title="Smaller text"
            >
              A−
            </button>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", minWidth: "30px", textAlign: "center" }}>{prefs.size}px</span>
            <button
              onClick={() => updatePrefs({ size: Math.min(MAX_SIZE, prefs.size + 1) })}
              disabled={prefs.size >= MAX_SIZE}
              style={{ ...btn(), padding: "5px 10px", fontSize: "15px", opacity: prefs.size >= MAX_SIZE ? 0.45 : 1 }}
              title="Larger text"
            >
              A+
            </button>
          </div>

          <div style={{ display: "flex", gap: "4px" }} role="group" aria-label="Page colour">
            {PAGE_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => updatePrefs({ theme: t.id })}
                aria-pressed={prefs.theme === t.id}
                title={`${t.label} page`}
                style={{
                  padding: "5px 11px",
                  borderRadius: "6px",
                  border: prefs.theme === t.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: t.swatch,
                  color: t.ink,
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "4px" }} role="group" aria-label="Reading mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => updatePrefs({ mode: m.id })}
                aria-pressed={prefs.mode === m.id}
                title={m.hint}
                style={{ ...btn(prefs.mode === m.id), padding: "5px 11px", fontSize: "12px" }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {tocOpen && (
            <nav
              aria-label="Table of contents"
              style={{
                width: "290px",
                flexShrink: 0,
                overflowY: "auto",
                background: "var(--panel)",
                borderRight: "1px solid var(--border)",
                padding: "12px 8px",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-muted)", padding: "0 10px 8px" }}>
                Contents
              </div>
              {tocItems.map((t) => {
                const active = chapterIdx === t.chapterIndex;
                return (
                  <button
                    key={t.key}
                    onClick={() => jumpTo(t.chapterIndex, t.anchor)}
                    aria-current={active ? "location" : undefined}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      borderRadius: "6px",
                      background: active ? "var(--nav-active-bg, var(--panel-dark))" : "transparent",
                      color: active ? "var(--accent-ink)" : "var(--text-main)",
                      fontWeight: active ? 700 : 500,
                      fontSize: "13px",
                      lineHeight: 1.35,
                      cursor: "pointer",
                    }}
                  >
                    {t.title}
                  </button>
                );
              })}
            </nav>
          )}

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0, position: "relative", background: pageTheme.swatch }}>
              {loading && (
                <div
                  style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: pageTheme.ink, fontSize: "14px", zIndex: 1, background: pageTheme.swatch }}
                >
                  Opening book…
                </div>
              )}
              {html && (
                <iframe
                  ref={iframeRef}
                  key={`${reading.id}`}
                  srcDoc={html}
                  onLoad={onFrameLoad}
                  title={reading.title}
                  style={{ width: "100%", height: "100%", border: "none", display: "block", background: pageTheme.swatch }}
                />
              )}
            </div>

            {/* footer: progress and page turning */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 20px",
                background: "var(--panel)",
                borderTop: "1px solid var(--border)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              <button onClick={() => turn(-1)} style={{ ...btn(), padding: "4px 12px" }} title="Previous (←)">
                ‹ Prev
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{chapterTitle || `Section ${chapterIdx + 1}`}</span>
                  <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                    Section {Math.min(chapterIdx + 1, chapterCount)} of {chapterCount} · {Math.round(percent * 100)}%
                  </span>
                </div>
                <div style={{ height: "5px", borderRadius: "3px", background: "var(--panel-dark)", border: "1px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(percent * 100)}%`, height: "100%", background: "var(--accent)" }} />
                </div>
              </div>
              <button onClick={() => turn(1)} style={{ ...btn(), padding: "4px 12px" }} title="Next (→)">
                Next ›
              </button>
            </div>
          </div>

          {notesOpen && (
            <aside
              aria-label="Highlights and notes"
              style={{ width: "340px", flexShrink: 0, overflowY: "auto", background: "var(--panel)", borderLeft: "1px solid var(--border)", padding: "12px 12px 24px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-muted)", flex: 1 }}>
                  Highlights &amp; notes
                </div>
                {highlights.length > 0 && (
                  <>
                    <button onClick={copyNotes} style={{ ...btn(), padding: "4px 9px", fontSize: "11px" }}>
                      Copy
                    </button>
                    <button onClick={exportNotes} style={{ ...btn(), padding: "4px 9px", fontSize: "11px" }}>
                      Save .md
                    </button>
                  </>
                )}
              </div>
              {highlights.length === 0 ? (
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.6, padding: "14px 4px" }}>
                  Select some text in the book and pick a colour to highlight it. Click a highlight to come back to it here and add a note.
                </div>
              ) : (
                [...highlights]
                  .sort((a, b) => a.chapter - b.chapter || a.start - b.start)
                  .map((h, i, arr) => {
                    const ctitle = tocItems.slice().reverse().find((t) => t.chapterIndex <= h.chapter)?.title || `Section ${h.chapter + 1}`;
                    const newGroup = i === 0 || arr[i - 1].chapter !== h.chapter;
                    const solid = HL_COLORS.find((c) => c.id === h.color)!.solid;
                    const active = activeHl === h.id;
                    return (
                      <div key={h.id}>
                        {newGroup && (
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-main)", margin: "14px 2px 6px" }}>{ctitle}</div>
                        )}
                        <div
                          ref={(el) => {
                            if (el && active) el.scrollIntoView({ block: "nearest" });
                          }}
                          style={{
                            borderRadius: "8px",
                            padding: "9px 10px",
                            marginBottom: "8px",
                            background: "var(--panel-dark)",
                            border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
                            borderLeft: `5px solid ${solid}`,
                          }}
                        >
                          <button
                            onClick={() => {
                              setActiveHl(h.id);
                              goToHighlight(h);
                            }}
                            title="Go to this passage"
                            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-main)", fontSize: "12.5px", lineHeight: 1.5, fontFamily: "Georgia, serif" }}
                          >
                            “{h.quote.length > 220 ? h.quote.slice(0, 220).trimEnd() + "…" : h.quote}”
                          </button>
                          {orphans.has(h.id) && (
                            <div style={{ fontSize: "11px", color: "var(--warn-ink)", fontWeight: 700, marginTop: "4px" }}>This passage was not found in the book any more.</div>
                          )}
                          <textarea
                            defaultValue={h.note}
                            key={`${h.id}-${h.note}`}
                            placeholder="Add a note…"
                            aria-label="Note for this highlight"
                            rows={h.note ? 2 : 1}
                            autoFocus={active && !h.note}
                            onBlur={(e) => {
                              if (e.target.value !== h.note) changeHighlight(h.id, { note: e.target.value });
                            }}
                            style={{ width: "100%", boxSizing: "border-box", marginTop: "6px", padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-main)", fontSize: "12px", resize: "vertical" }}
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                            {HL_COLORS.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => changeHighlight(h.id, { color: c.id })}
                                aria-label={`Change to ${c.label}`}
                                aria-pressed={h.color === c.id}
                                title={c.label}
                                style={{ width: "18px", height: "18px", borderRadius: "50%", background: c.solid, cursor: "pointer", border: h.color === c.id ? "3px solid var(--text-main)" : "1px solid var(--border)", padding: 0 }}
                              />
                            ))}
                            <button
                              onClick={() => removeHighlight(h.id)}
                              style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: "3px 9px", borderRadius: "5px", color: "var(--danger-ink)", background: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))", border: "1px solid color-mix(in srgb, var(--danger-ink) 80%, var(--panel-dark))" }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </aside>
          )}
        </div>

        {pop && (
          <div
            role="toolbar"
            aria-label="Highlight the selected text"
            onMouseDown={(e) => e.preventDefault()}
            style={{ position: "fixed", left: pop.left, top: pop.top, zIndex: 60, display: "flex", alignItems: "center", gap: "7px", padding: "7px 10px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--border-strong, var(--border))", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}
          >
            {HL_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => addHighlight(c.id)}
                aria-label={`Highlight ${c.label}`}
                title={`Highlight ${c.label}`}
                style={{ width: "22px", height: "22px", borderRadius: "50%", background: c.solid, border: "2px solid var(--panel)", outline: "1px solid var(--border-strong, var(--border))", cursor: "pointer", padding: 0 }}
              />
            ))}
            <button onClick={() => addHighlight("yellow", true)} style={{ ...btn(), padding: "4px 10px", fontSize: "12px" }}>
              ✎ Note
            </button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Bookshelf view
  // =========================================================================
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {fileInput}
      <div style={{ padding: "28px 40px 40px", maxWidth: "1100px", margin: "0 auto" }}>
        <header style={{ marginBottom: "18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", color: "var(--text-main)", margin: "0 0 6px 0" }}>Books</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0 }}>
              {books.length === 0 ? "Your EPUB library is stored on this computer." : `${books.length} book${books.length === 1 ? "" : "s"} · stored on this computer`}
            </p>
          </div>
          <button onClick={pickFile} disabled={importing} style={{ ...btn(true), opacity: importing ? 0.7 : 1 }}>
            {importing ? "Importing…" : "+ Import EPUB"}
          </button>
        </header>

        {notice && (
          <div
            role="status"
            style={{
              marginBottom: "16px",
              padding: "9px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              color: notice.kind === "ok" ? "var(--success-ink)" : "var(--danger-ink)",
              background: `color-mix(in srgb, ${notice.kind === "ok" ? "var(--success-ink)" : "var(--danger-ink)"} 13%, var(--panel-dark))`,
              border: `1px solid color-mix(in srgb, ${notice.kind === "ok" ? "var(--success-ink)" : "var(--danger-ink)"} 80%, var(--panel-dark))`,
            }}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}>
              ✕
            </button>
          </div>
        )}

        {books.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", background: "var(--panel-dark)", borderRadius: "10px", border: "2px dashed var(--border)" }}>
            <div style={{ fontSize: "34px", marginBottom: "8px" }} aria-hidden="true">
              📖
            </div>
            <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>No books yet</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 18px 0" }}>
              Import one or more .epub files. FOSCL remembers your page, text size and page colour for every book.
            </p>
            <button onClick={pickFile} style={btn(true)}>
              Choose EPUB files
            </button>
          </div>
        ) : (
          <>
            {lastRead && !query && shelf === "All" && lastRead.progress && (
              <button
                onClick={() => openBook(lastRead)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--panel-dark)",
                  color: "var(--text-main)",
                  cursor: "pointer",
                }}
              >
                <div style={{ width: "46px", flexShrink: 0, borderRadius: "4px", overflow: "hidden" }}>
                  <Cover book={lastRead} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--accent-ink)", marginBottom: "2px" }}>Continue reading</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lastRead.title}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {Math.round((lastRead.progress.percent ?? 0) * 100)}% read · {ago(lastRead.lastOpenedAt)}
                  </div>
                </div>
                <span style={{ ...btn(true), pointerEvents: "none" }}>Continue ›</span>
              </button>
            )}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "18px" }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title or author…"
                aria-label="Search books"
                style={{
                  flex: "1 1 220px",
                  maxWidth: "340px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--panel-dark)",
                  color: "var(--text-main)",
                  fontSize: "13px",
                }}
              />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} role="group" aria-label="Shelves">
                {shelves.map((s) => (
                  <button
                    key={s}
                    onClick={() => setShelf(s)}
                    aria-pressed={shelf === s}
                    style={{ ...btn(shelf === s), padding: "6px 12px", fontSize: "12px", borderRadius: "16px" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort books"
                style={{ marginLeft: "auto", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--panel-dark)", color: "var(--text-main)", fontSize: "12px" }}
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {visible.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                No books match{query ? ` "${query}"` : ""}{shelf !== "All" ? ` on the "${shelf}" shelf` : ""}.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "20px" }}>
                {visible.map((b) => {
                  const pct = Math.round((b.progress?.percent ?? 0) * 100);
                  return (
                    <div
                      key={b.id}
                      style={{ display: "flex", flexDirection: "column", background: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}
                    >
                      <button
                        onClick={() => openBook(b)}
                        title={`Read “${b.title}”`}
                        style={{ border: "none", padding: 0, background: "none", cursor: "pointer", display: "block", textAlign: "left" }}
                      >
                        <Cover book={b} />
                      </button>
                      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                        <div
                          title={b.title}
                          style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        >
                          {b.title}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.author || "Unknown author"}</div>
                        {b.progress ? (
                          <div title={`${pct}% read`}>
                            <div style={{ height: "4px", borderRadius: "2px", background: "var(--panel)", border: "1px solid var(--border)", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>{pct}% · {ago(b.lastOpenedAt)}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Not started</div>
                        )}
                        <div style={{ display: "flex", gap: "6px", marginTop: "auto", paddingTop: "4px" }}>
                          <select
                            value={b.shelf || ""}
                            onChange={(e) => patchBook(b.id, { shelf: e.target.value || undefined })}
                            aria-label={`Shelf for ${b.title}`}
                            style={{ flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-main)", fontSize: "11px" }}
                          >
                            <option value="">No shelf</option>
                            {shelves.filter((s) => s !== "All").map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setConfirmDelete(b)}
                            aria-label={`Remove ${b.title}`}
                            title="Remove from library"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "5px",
                              fontSize: "12px",
                              cursor: "pointer",
                              color: "var(--danger-ink)",
                              background: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))",
                              border: "1px solid color-mix(in srgb, var(--danger-ink) 80%, var(--panel-dark))",
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Remove book?"
        message={confirmDelete ? `Remove “${confirmDelete.title}” from your library? The EPUB file stored in FOSCL is deleted; your original file is not touched.` : ""}
        confirmLabel="Remove"
      />
    </div>
  );
};
