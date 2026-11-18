import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { getPaper, loadPdfBytes, getAnnotations, createAnnotation, updateAnnotation, deleteAnnotation } from "../lib/api";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { toast } from "../lib/toast";
import { saveTextFile } from "../lib/saveFile";
import { loadReaderSettings, saveReaderSettings } from "../lib/settings";
import type { Paper, Annotation } from "../types";

// Configure pdfjs worker to local bundled file in public
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ---------------------------------------------------------------------------
const COLORS = [
  { c: "#FFEB3B", n: "Yellow" },
  { c: "#A3E4D7", n: "Green" },
  { c: "#F5B7B1", n: "Red" },
  { c: "#D7BDE2", n: "Purple" },
  { c: "#FAD7A0", n: "Orange" },
];

const PROGRESS_KEY = (id: string) => `foscl:pdf_progress:${id}`;

/** Lower-case and drop all whitespace, so quotes match across line breaks and split text chunks. */
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

const leafSpans = (wrap: HTMLElement) =>
  Array.from(wrap.querySelectorAll<HTMLElement>(".textLayer span")).filter((s) => s.children.length === 0 && (s.textContent || "").length > 0);

const btn = (active = false): React.CSSProperties => ({
  padding: "5px 10px",
  borderRadius: "5px",
  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
  background: active ? "var(--accent)" : "var(--panel-dark)",
  color: active ? "var(--on-accent)" : "var(--text-main)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const field: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "5px 8px",
  fontSize: "12px",
  borderRadius: "5px",
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--text-main)",
};

type OutlineNode = { title: string; dest: any; depth: number };
type Hit = { page: number; snippet: string };
type LeftTab = "contents" | "pages" | "search";

// ---------------------------------------------------------------------------
/** Small lazily-rendered page preview. */
const Thumb: React.FC<{ doc: pdfjsLib.PDFDocumentProxy; n: number; current: boolean; onGo: (n: number) => void }> = ({ doc, n, current, onGo }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting || done.current) return;
        done.current = true;
        (async () => {
          try {
            const page = await doc.getPage(n);
            const v1 = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: 110 / v1.width });
            const c = ref.current;
            if (!c) return;
            c.width = viewport.width;
            c.height = viewport.height;
            const ctx = c.getContext("2d");
            if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
          } catch {}
        })();
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [doc, n]);

  return (
    <button
      ref={box}
      onClick={() => onGo(n)}
      aria-label={`Go to page ${n}`}
      aria-current={current ? "page" : undefined}
      style={{
        display: "block",
        margin: "0 auto 10px",
        padding: 4,
        minHeight: 120,
        background: "var(--panel)",
        cursor: "pointer",
        borderRadius: 6,
        border: current ? "3px solid var(--accent)" : "1px solid var(--border-strong, var(--border))",
      }}
    >
      <canvas ref={ref} style={{ display: "block", maxWidth: "100%", background: "#fff" }} />
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{n}</div>
    </button>
  );
};

// ---------------------------------------------------------------------------
export const Reader: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();

  const savedSettings = useRef(loadReaderSettings()).current;

  const [paper, setPaper] = useState<Paper | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(savedSettings.scale || 1.25);
  const [darkMode, setDarkMode] = useState<boolean>(savedSettings.darkMode ?? false);
  const [colorInput, setColorInput] = useState(savedSettings.highlightColor || "#FFEB3B");
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState("1");

  const [leftOpen, setLeftOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>("contents");
  const [rightOpen, setRightOpen] = useState(true);
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);

  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [hitIdx, setHitIdx] = useState(0);

  const [pop, setPop] = useState<{ left: number; top: number; text: string; page: number } | null>(null);
  const [activeAnn, setActiveAnn] = useState<string | null>(null);
  const [annFilter, setAnnFilter] = useState("");

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualQuote, setManualQuote] = useState("");
  const [manualPage, setManualPage] = useState<number>(1);
  const [manualNote, setManualNote] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; annId: string }>({ isOpen: false, annId: "" });

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // values the imperative page code reads
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const scaleRef = useRef(scale);
  const wrapsRef = useRef<HTMLElement[]>([]);
  const sizesRef = useRef<{ doc: pdfjsLib.PDFDocumentProxy | null; list: [number, number][] }>({ doc: null, list: [] });
  const tasksRef = useRef<Map<number, any>>(new Map());
  const annsRef = useRef<Annotation[]>([]);
  const queryRef = useRef("");
  const pageRef = useRef(1);
  const textCache = useRef<Map<number, string>>(new Map());
  const startPage = useRef<number | null>(null);

  annsRef.current = annotations;
  scaleRef.current = scale;

  // ----- persist settings ------------------------------------------------------
  useEffect(() => {
    saveReaderSettings({ scale, darkMode, highlightColor: colorInput });
  }, [scale, darkMode, colorInput]);

  useEffect(() => {
    pageRef.current = page;
    setPageDraft(String(page));
    if (paperId && numPages) {
      try {
        localStorage.setItem(PROGRESS_KEY(paperId), JSON.stringify({ page, numPages, at: Date.now() }));
      } catch {}
    }
  }, [page, paperId, numPages]);

  // ----- load --------------------------------------------------------------------
  useEffect(() => {
    if (!paperId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setPdfDoc(null);
      setOutline(null);
      textCache.current.clear();
      try {
        const p = await getPaper(paperId);
        if (!alive) return;
        setPaper(p);
        const ann = await getAnnotations(paperId);
        if (!alive) return;
        setAnnotations(ann);

        // where to start: ?page=N wins, otherwise where you stopped last time
        let start = 1;
        const fromUrl = parseInt(new URLSearchParams(window.location.search).get("page") || "", 10);
        if (fromUrl > 0) start = fromUrl;
        else {
          try {
            const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY(paperId)) || "null");
            if (saved?.page > 0) start = saved.page;
          } catch {}
        }
        startPage.current = start;

        const bytes = await loadPdfBytes(paperId);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (!alive) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPage(Math.min(start, doc.numPages));

        doc
          .getOutline()
          .then((o: any) => {
            if (!alive) return;
            const flat: OutlineNode[] = [];
            const walk = (items: any[], depth: number) => {
              for (const it of items || []) {
                if (flat.length > 400) return;
                flat.push({ title: it.title || "Untitled", dest: it.dest, depth });
                if (it.items?.length) walk(it.items, depth + 1);
              }
            };
            walk(o || [], 0);
            setOutline(flat);
          })
          .catch(() => alive && setOutline([]));
      } catch (err: any) {
        console.error("Error loading PDF: ", err);
        toast.error("Error loading PDF: " + err?.toString());
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [paperId]);

  // ----- decorating a page: saved highlights + search hits ---------------------------
  const decorate = useCallback((wrap: HTMLElement) => {
    const n = Number(wrap.dataset.pageNumber);
    const spans = leafSpans(wrap);
    spans.forEach((s) => {
      s.style.background = "";
      s.style.mixBlendMode = "";
      s.classList.remove("foscl-hit");
      s.removeAttribute("data-ann");
    });
    if (!spans.length) return;

    let full = "";
    const owner: number[] = [];
    spans.forEach((s, i) => {
      const t = squash(s.textContent || "");
      for (let k = 0; k < t.length; k++) owner.push(i);
      full += t;
    });

    const mark = (q: string, fn: (i: number) => void, all: boolean) => {
      if (!q) return;
      let from = 0;
      for (;;) {
        const idx = full.indexOf(q, from);
        if (idx < 0) break;
        for (let k = idx; k < idx + q.length; k++) fn(owner[k]);
        if (!all) break;
        from = idx + q.length;
      }
    };

    annsRef.current
      .filter((a) => a.page === n)
      .forEach((a) => {
        let q = squash(a.quote);
        if (!q) return;
        if (full.indexOf(q) < 0) q = q.slice(0, 60); // a quote that runs onto the next page
        mark(
          q,
          (i) => {
            spans[i].style.background = `color-mix(in srgb, ${a.color || "#FFEB3B"} 65%, transparent)`;
            spans[i].style.mixBlendMode = "multiply";
            spans[i].dataset.ann = a.id;
          },
          false
        );
      });

    const sq = squash(queryRef.current);
    if (sq.length >= 2) mark(sq, (i) => spans[i].classList.add("foscl-hit"), true);
  }, []);

  const decorateAll = useCallback(() => {
    wrapsRef.current.forEach((w) => w && w.dataset.rendered && decorate(w));
  }, [decorate]);

  // ----- drawing one page --------------------------------------------------------------
  const renderPage = useCallback(
    async (n: number) => {
      const doc = docRef.current;
      const wrap = wrapsRef.current[n - 1];
      if (!doc || !wrap) return;
      const sc = scaleRef.current;
      const key = String(sc);
      if (wrap.dataset.rendered === key || wrap.dataset.busy === "1") return;
      wrap.dataset.busy = "1";
      try {
        const pg = await doc.getPage(n);
        if (docRef.current !== doc || scaleRef.current !== sc) return;
        const viewport = pg.getViewport({ scale: sc });
        wrap.textContent = "";
        wrap.style.setProperty("--scale-factor", String(sc));
        wrap.style.setProperty("--total-scale-factor", String(sc));

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.display = "block";
        wrap.appendChild(canvas);
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        wrap.appendChild(textDiv);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const task = pg.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
          tasksRef.current.set(n, task);
          await task.promise;
        }
        if (docRef.current !== doc || scaleRef.current !== sc) return;

        const tc = await pg.getTextContent();
        const TL = (pdfjsLib as any).TextLayer;
        if (TL) await new TL({ textContentSource: tc, container: textDiv, viewport }).render();
        wrap.dataset.rendered = key;
        decorate(wrap);
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error("Error rendering page", n, e);
      } finally {
        wrap.dataset.busy = "0";
        tasksRef.current.delete(n);
      }
    },
    [decorate]
  );

  const unrenderPage = (n: number) => {
    const wrap = wrapsRef.current[n - 1];
    if (!wrap) return;
    try {
      tasksRef.current.get(n)?.cancel();
    } catch {}
    wrap.textContent = "";
    wrap.dataset.rendered = "";
  };

  const goTo = useCallback((n: number, smooth = false) => {
    const sc = scrollRef.current;
    const wrap = wrapsRef.current[Math.max(1, n) - 1];
    if (!sc || !wrap) return;
    const top = wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12;
    sc.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // ----- build the page frames whenever the document or zoom changes ---------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!pdfDoc || !container) return;
    let alive = true;
    let io: IntersectionObserver | null = null;
    docRef.current = pdfDoc;

    (async () => {
      if (sizesRef.current.doc !== pdfDoc) {
        const list: [number, number][] = [];
        for (let i = 1; i <= pdfDoc.numPages; i += 20) {
          const batch = await Promise.all(
            Array.from({ length: Math.min(20, pdfDoc.numPages - i + 1) }, (_, k) => pdfDoc.getPage(i + k).then((p) => p.getViewport({ scale: 1 })))
          );
          batch.forEach((v) => list.push([v.width, v.height]));
        }
        sizesRef.current = { doc: pdfDoc, list };
      }
      if (!alive) return;

      container.textContent = "";
      const wraps: HTMLElement[] = [];
      sizesRef.current.list.forEach(([w, h], idx) => {
        const el = document.createElement("div");
        el.className = "pdf-page-wrapper";
        el.dataset.pageNumber = String(idx + 1);
        el.style.cssText = `position:relative;margin:0 auto 20px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,0.25);outline:1px solid var(--border-strong, var(--border));width:${w * scale}px;height:${h * scale}px;`;
        container.appendChild(el);
        wraps.push(el);
      });
      wrapsRef.current = wraps;

      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            const n = Number((e.target as HTMLElement).dataset.pageNumber);
            if (e.isIntersecting) renderPage(n);
            else unrenderPage(n);
          }),
        { root: scrollRef.current, rootMargin: "1200px 0px" }
      );
      wraps.forEach((w) => io!.observe(w));

      requestAnimationFrame(() => goTo(pageRef.current));
    })();

    return () => {
      alive = false;
      io?.disconnect();
      tasksRef.current.forEach((t) => {
        try {
          t.cancel();
        } catch {}
      });
      tasksRef.current.clear();
    };
  }, [pdfDoc, scale, renderPage, goTo]);

  // saved highlights or search terms changed: repaint the pages that are drawn
  useEffect(() => {
    queryRef.current = activeQuery;
    decorateAll();
  }, [annotations, activeQuery, decorateAll]);

  // ----- which page is on screen -----------------------------------------------------------
  const onScroll = () => {
    setPop(null);
    const sc = scrollRef.current;
    if (!sc) return;
    const limit = sc.getBoundingClientRect().top + sc.clientHeight * 0.35;
    let cur = 1;
    const w = wrapsRef.current;
    for (let i = 0; i < w.length; i++) {
      if (w[i].getBoundingClientRect().top <= limit) cur = i + 1;
      else break;
    }
    if (cur !== pageRef.current) setPage(cur);
  };

  const jump = (n: number) => {
    const t = Math.min(Math.max(1, Math.round(n) || 1), numPages || 1);
    setPage(t);
    goTo(t);
  };

  const fitWidth = () => {
    const sc = scrollRef.current;
    const first = sizesRef.current.list[0];
    if (!sc || !first) return;
    setScale(Math.min(3, Math.max(0.5, Math.round(((sc.clientWidth - 48) / first[0]) * 20) / 20)));
  };

  // ----- outline ---------------------------------------------------------------------------
  const goOutline = async (node: OutlineNode) => {
    if (!pdfDoc) return;
    try {
      let dest = node.dest;
      if (typeof dest === "string") dest = await pdfDoc.getDestination(dest);
      if (!Array.isArray(dest)) return;
      const ref = dest[0];
      const idx = typeof ref === "object" ? await pdfDoc.getPageIndex(ref) : Number(ref);
      jump(idx + 1);
    } catch {
      toast.error("Could not follow that entry");
    }
  };

  // ----- search ------------------------------------------------------------------------------
  const pageText = async (n: number) => {
    const cached = textCache.current.get(n);
    if (cached != null) return cached;
    const pg = await pdfDoc!.getPage(n);
    const tc = await pg.getTextContent();
    const t = tc.items.map((i: any) => i.str).join(" ").replace(/\s+/g, " ");
    textCache.current.set(n, t);
    return t;
  };

  useEffect(() => {
    const q = query.trim();
    const t = window.setTimeout(() => setActiveQuery(q.length >= 2 ? q : ""), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!pdfDoc) return;
    if (!activeQuery) {
      setHits([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    (async () => {
      const q = activeQuery.toLowerCase();
      const found: Hit[] = [];
      for (let n = 1; n <= pdfDoc.numPages && found.length < 300; n++) {
        const text = await pageText(n);
        if (!alive) return;
        const low = text.toLowerCase();
        let from = 0;
        let perPage = 0;
        while (perPage < 3) {
          const i = low.indexOf(q, from);
          if (i < 0) break;
          const s = Math.max(0, i - 40);
          found.push({ page: n, snippet: (s > 0 ? "…" : "") + text.slice(s, i + q.length + 60).trim() + "…" });
          perPage++;
          from = i + q.length;
        }
      }
      if (alive) {
        setHits(found);
        setHitIdx(0);
        setSearching(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery, pdfDoc]);

  const stepHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const i = (hitIdx + dir + hits.length) % hits.length;
    setHitIdx(i);
    jump(hits[i].page);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setLeftOpen(true);
        setLeftTab("search");
        window.setTimeout(() => searchRef.current?.focus(), 30);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ----- selecting text -----------------------------------------------------------------------
  const handleMouseUp = () => {
    window.setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().replace(/\s+/g, " ").trim() : "";
      if (!sel || sel.rangeCount === 0 || !text) return setPop(null);
      const node = sel.anchorNode as HTMLElement | null;
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      const wrap = el?.closest?.(".pdf-page-wrapper") as HTMLElement | null;
      if (!wrap) return setPop(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setPop({
        left: Math.min(Math.max(8, r.left), window.innerWidth - 300),
        top: Math.max(8, r.top - 48),
        text,
        page: Number(wrap.dataset.pageNumber) || pageRef.current,
      });
    }, 10);
  };

  const addHighlight = async (color: string, withNote: boolean) => {
    if (!paper || !pop) return;
    try {
      const created = await createAnnotation(paper.id, pop.page, pop.text, undefined, color);
      setAnnotations((a) => [...a, created]);
      window.getSelection()?.removeAllRanges();
      setPop(null);
      setColorInput(color);
      if (withNote) {
        setRightOpen(true);
        setActiveAnn(created.id);
      }
    } catch (err: any) {
      toast.error("Error saving annotation: " + err?.toString());
    }
  };

  const handleCreateManualAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paper || !manualQuote.trim()) return;
    try {
      const created = await createAnnotation(paper.id, manualPage > 0 ? manualPage : undefined, manualQuote.trim(), manualNote.trim() || undefined, "#FFEB3B");
      setAnnotations((a) => [...a, created]);
      setShowManualModal(false);
      setManualQuote("");
      setManualNote("");
      toast.success("Quote added");
    } catch (err: any) {
      toast.error("Error saving manual annotation: " + err?.toString());
    }
  };

  const changeAnn = async (a: Annotation, patch: { note?: string; color?: string }) => {
    const next = { ...a, ...patch };
    setAnnotations((list) => list.map((x) => (x.id === a.id ? next : x)));
    try {
      await updateAnnotation(a.id, a.quote, next.note, next.color);
    } catch (err: any) {
      setAnnotations((list) => list.map((x) => (x.id === a.id ? a : x)));
      toast.error("Could not save the change: " + err?.toString());
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotation(id);
      setAnnotations((list) => list.filter((a) => a.id !== id));
      if (activeAnn === id) setActiveAnn(null);
      toast.success("Annotation removed");
    } catch (err: any) {
      toast.error("Error deleting annotation: " + err?.toString());
    }
  };

  const flashAnn = (id: string) => {
    const spans = Array.from(document.querySelectorAll<HTMLElement>(`.textLayer span[data-ann="${id}"]`));
    spans.forEach((s) => s.classList.add("foscl-flash"));
    window.setTimeout(() => spans.forEach((s) => s.classList.remove("foscl-flash")), 1500);
  };

  const showAnn = (a: Annotation) => {
    setActiveAnn(a.id);
    if (a.page) {
      jump(a.page);
      window.setTimeout(() => flashAnn(a.id), 350);
    }
  };

  // ----- list and export ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = annFilter.trim().toLowerCase();
    return annotations
      .filter((a) => !q || a.quote.toLowerCase().includes(q) || (a.note || "").toLowerCase().includes(q))
      .sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || a.created_at.localeCompare(b.created_at));
  }, [annotations, annFilter]);

  const markdown = () => {
    let authors = "";
    try {
      authors = (JSON.parse(paper?.authors_json || "[]") as string[]).join(", ");
    } catch {}
    const lines = [`# Highlights: ${paper?.title || "Paper"}`, ""];
    if (authors) lines.push(`*${authors}${paper?.year ? ` (${paper.year})` : ""}*`, "");
    let last: number | undefined | null = null;
    [...annotations]
      .sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9))
      .forEach((a) => {
        if (a.page !== last) {
          lines.push(a.page ? `## Page ${a.page}` : "## Quotes without a page", "");
          last = a.page;
        }
        lines.push(`> ${a.quote}`, "");
        if (a.note) lines.push(`**Note:** ${a.note}`, "");
      });
    return lines.join("\n");
  };

  const exportNotes = async () => {
    try {
      const where = await saveTextFile(`${(paper?.title || "paper").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60)}_highlights.md`, markdown(), { name: "Markdown", extensions: ["md"] }, "text/markdown");
      if (where) toast.success(`Saved: ${where}`);
    } catch (err: any) {
      toast.error("Could not save: " + (err?.toString?.() ?? err));
    }
  };

  const copyNotes = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      toast.success("Highlights copied as Markdown");
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };

  const viewerBg = "color-mix(in srgb, var(--text-main) 14%, var(--panel-dark))";

  // ----- render -------------------------------------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--panel-dark)", overflow: "hidden" }}>
      {/* Top controls */}
      <div style={{ padding: "8px 14px", backgroundColor: "var(--panel)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", zIndex: 10 }}>
        <button onClick={() => navigate(`/paper/${paperId}`)} style={btn()}>
          ← Back to Paper
        </button>
        <button onClick={() => setLeftOpen((v) => !v)} aria-pressed={leftOpen} style={btn(leftOpen)} title="Contents, page previews and search">
          ☰ Contents
        </button>
        <div style={{ minWidth: 0, flex: "1 1 140px", fontSize: 14, fontWeight: 700, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {paper?.title}
        </div>

        {/* page */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => jump(page - 1)} disabled={page <= 1} style={btn()} aria-label="Previous page">
            ‹
          </button>
          <input
            value={pageDraft}
            onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && jump(parseInt(pageDraft, 10))}
            onBlur={() => setPageDraft(String(page))}
            aria-label="Page number"
            style={{ ...field, width: 46, textAlign: "center" }}
          />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>/ {numPages || "–"}</span>
          <button onClick={() => jump(page + 1)} disabled={!numPages || page >= numPages} style={btn()} aria-label="Next page">
            ›
          </button>
        </div>

        {/* zoom */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))} style={btn()} aria-label="Zoom out">
            −
          </button>
          <span style={{ fontSize: 12, minWidth: 40, textAlign: "center", color: "var(--text-main)" }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, +(s + 0.15).toFixed(2)))} style={btn()} aria-label="Zoom in">
            +
          </button>
          <button onClick={fitWidth} style={btn()} title="Fit the page to the window width">
            Fit width
          </button>
        </div>

        <button onClick={() => setDarkMode(!darkMode)} aria-pressed={darkMode} title="Toggle dark reading mode" style={btn(darkMode)}>
          {darkMode ? "☀️ Light" : "🌙 Night"}
        </button>
        <button onClick={() => setRightOpen((v) => !v)} aria-pressed={rightOpen} style={btn(rightOpen)} title="Your highlights and notes">
          🖍 Notes ({annotations.length})
        </button>
        <button onClick={() => setShowManualModal(true)} style={{ ...btn(), background: "var(--accent)", color: "var(--on-accent)", border: "1px solid transparent" }}>
          + Manual Quote
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left drawer */}
        {leftOpen && (
          <aside aria-label="Contents, pages and search" style={{ width: 270, minWidth: 270, background: "var(--panel)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
            <div role="tablist" style={{ display: "flex", gap: 4, padding: 8, borderBottom: "1px solid var(--border)" }}>
              {([
                ["contents", "Contents"],
                ["pages", "Pages"],
                ["search", "Search"],
              ] as [LeftTab, string][]).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={leftTab === id} onClick={() => setLeftTab(id)} style={{ ...btn(leftTab === id), flex: 1 }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {leftTab === "contents" &&
                (outline === null ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
                ) : outline.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    This PDF has no table of contents. Use the <b>Pages</b> tab to look through it, or <b>Search</b> to find a phrase.
                  </div>
                ) : (
                  outline.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => goOutline(o)}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: `5px 6px 5px ${6 + o.depth * 14}px`, fontSize: 12.5, color: "var(--text-main)", fontWeight: o.depth === 0 ? 700 : 500, borderRadius: 4 }}
                    >
                      {o.title}
                    </button>
                  ))
                ))}

              {leftTab === "pages" && pdfDoc && Array.from({ length: numPages }, (_, i) => <Thumb key={i} doc={pdfDoc} n={i + 1} current={page === i + 1} onGo={jump} />)}

              {leftTab === "search" && (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && stepHit(e.shiftKey ? -1 : 1)}
                      placeholder="Find in this PDF…"
                      aria-label="Find in this PDF"
                      style={{ ...field, flex: 1, minWidth: 0 }}
                    />
                    <button onClick={() => stepHit(-1)} disabled={!hits.length} style={btn()} aria-label="Previous match">
                      ↑
                    </button>
                    <button onClick={() => stepHit(1)} disabled={!hits.length} style={btn()} aria-label="Next match">
                      ↓
                    </button>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
                    {!activeQuery ? "Type at least two letters. Enter jumps to the next match." : searching ? "Searching…" : hits.length ? `${hits.length}${hits.length >= 300 ? "+" : ""} matches` : "No matches"}
                  </div>
                  {hits.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setHitIdx(i);
                        jump(h.page);
                      }}
                      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 6, padding: "6px 8px", borderRadius: 6, background: "var(--panel-dark)", border: i === hitIdx ? "2px solid var(--accent)" : "1px solid var(--border)", color: "var(--text-main)", fontSize: 12, lineHeight: 1.4 }}
                    >
                      <b style={{ color: "var(--accent-ink)" }}>p. {h.page}</b> {h.snippet}
                    </button>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}

        {/* PDF pages */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onMouseUp={handleMouseUp}
          onMouseDown={() => setPop(null)}
          style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "20px 16px", backgroundColor: viewerBg }}
        >
          {loading && <div style={{ color: "var(--text-main)", marginTop: 60, fontSize: 15, textAlign: "center" }}>Loading PDF document…</div>}
          {!loading && !pdfDoc && <div style={{ color: "var(--text-main)", marginTop: 60, fontSize: 14, textAlign: "center" }}>This paper has no readable PDF.</div>}
          <div
            ref={containerRef}
            style={{
              filter: darkMode ? "invert(90%) hue-rotate(180deg)" : "none",
              transition: "filter 0.25s ease",
              width: "fit-content",
              minWidth: "100%",
            }}
          />
        </div>

        {/* Right panel */}
        {rightOpen && (
          <aside aria-label="Highlights and notes" style={{ width: 320, minWidth: 320, backgroundColor: "var(--panel)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text-main)", flex: 1 }}>Annotations ({annotations.length})</h3>
                {annotations.length > 0 && (
                  <>
                    <button onClick={copyNotes} style={{ ...btn(), padding: "4px 9px", fontSize: 11 }}>
                      Copy
                    </button>
                    <button onClick={exportNotes} style={{ ...btn(), padding: "4px 9px", fontSize: 11 }}>
                      Save .md
                    </button>
                  </>
                )}
              </div>
              {annotations.length > 0 && <input type="text" placeholder="Search annotations…" aria-label="Search annotations" value={annFilter} onChange={(e) => setAnnFilter(e.target.value)} style={{ ...field, width: "100%" }} />}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {annotations.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "30px 10px", lineHeight: 1.6 }}>
                  Select text in the PDF and pick a colour to highlight it, or click “+ Manual Quote”.
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "20px 10px" }}>No annotations match “{annFilter}”.</div>
              ) : (
                filtered.map((a, i) => {
                  const newGroup = i === 0 || filtered[i - 1].page !== a.page;
                  const active = activeAnn === a.id;
                  return (
                    <div key={a.id}>
                      {newGroup && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-main)", margin: "10px 2px 6px" }}>{a.page ? `Page ${a.page}` : "Quotes without a page"}</div>}
                      <div
                        ref={(el) => {
                          if (el && active) el.scrollIntoView({ block: "nearest" });
                        }}
                        style={{ padding: "9px 10px", marginBottom: 8, borderRadius: 8, backgroundColor: "var(--panel-dark)", border: active ? "2px solid var(--accent)" : "1px solid var(--border)", borderLeft: `5px solid ${a.color || "#8A5A7A"}` }}
                      >
                        <button onClick={() => showAnn(a)} title={a.page ? "Go to this passage" : undefined} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: a.page ? "pointer" : "default", fontSize: 12.5, fontStyle: "italic", lineHeight: 1.45, color: "var(--text-main)" }}>
                          “{a.quote.length > 240 ? a.quote.slice(0, 240).trimEnd() + "…" : a.quote}”
                        </button>
                        <textarea
                          key={`${a.id}-${a.note || ""}`}
                          defaultValue={a.note || ""}
                          placeholder="Add a note…"
                          aria-label="Note for this highlight"
                          rows={a.note ? 2 : 1}
                          autoFocus={active && !a.note}
                          onBlur={(e) => e.target.value !== (a.note || "") && changeAnn(a, { note: e.target.value })}
                          style={{ ...field, width: "100%", marginTop: 6, resize: "vertical" }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          {COLORS.map((c) => (
                            <button key={c.c} onClick={() => changeAnn(a, { color: c.c })} aria-label={`Change to ${c.n}`} aria-pressed={a.color === c.c} title={c.n} style={{ width: 18, height: 18, borderRadius: "50%", background: c.c, cursor: "pointer", padding: 0, border: a.color === c.c ? "3px solid var(--text-main)" : "1px solid var(--border-strong, var(--border))" }} />
                          ))}
                          <button
                            onClick={() => setConfirmDialog({ isOpen: true, annId: a.id })}
                            title="Delete annotation"
                            style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "3px 9px", borderRadius: 5, color: "var(--danger-ink)", background: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))", border: "1px solid color-mix(in srgb, var(--danger-ink) 80%, var(--panel-dark))" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>

      {/* colour picker next to a selection */}
      {pop && (
        <div
          role="toolbar"
          aria-label="Highlight the selected text"
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: "fixed", left: pop.left, top: pop.top, zIndex: 60, display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border-strong, var(--border))", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}
        >
          {COLORS.map((c) => (
            <button key={c.c} onClick={() => addHighlight(c.c, false)} aria-label={`Highlight ${c.n}`} title={`Highlight ${c.n}`} style={{ width: 22, height: 22, borderRadius: "50%", background: c.c, border: "2px solid var(--panel)", outline: "1px solid var(--border-strong, var(--border))", cursor: "pointer", padding: 0 }} />
          ))}
          <button onClick={() => addHighlight(colorInput, true)} style={{ ...btn(), padding: "4px 10px" }}>
            ✎ Note
          </button>
        </div>
      )}

      {/* Manual Annotation Modal */}
      <Modal isOpen={showManualModal} onClose={() => setShowManualModal(false)} title="Add Manual Quote / Annotation">
        <form onSubmit={handleCreateManualAnnotation}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-main)", marginBottom: 4 }}>Passage Quote *</label>
            <textarea required rows={4} value={manualQuote} onChange={(e) => setManualQuote(e.target.value)} placeholder="Paste or write the quote from the paper..." style={{ ...field, width: "100%", padding: "8px 10px", fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-main)", marginBottom: 4 }}>Page Number (Optional)</label>
            <input type="number" min={1} value={manualPage} onChange={(e) => setManualPage(parseInt(e.target.value, 10) || 1)} style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-main)", marginBottom: 4 }}>Note / Observations (Optional)</label>
            <input type="text" value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="e.g. key finding on precision improvement..." style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={() => setShowManualModal(false)} style={{ ...btn(), padding: "8px 16px", fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit" disabled={!manualQuote.trim()} style={{ padding: "8px 16px", backgroundColor: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              Save Annotation
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, annId: "" })}
        onConfirm={() => {
          if (confirmDialog.annId) handleDeleteAnnotation(confirmDialog.annId);
        }}
        title="Delete Annotation"
        message="Are you sure you want to delete this annotation highlight? This cannot be undone."
        confirmLabel="Delete"
        isDanger={true}
      />
    </div>
  );
};
