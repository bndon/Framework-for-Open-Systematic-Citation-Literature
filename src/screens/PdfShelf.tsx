import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { deletePaper, getPapers, loadPdfBytes, uploadPdf, upsertPaper } from "../lib/api";
import { BooksTabs } from "../components/BooksTabs";
import { deleteWithUndo } from "../lib/undo";
import { toast } from "../lib/toast";
import type { Paper } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PROGRESS_KEY = (id: string) => `foscl:pdf_progress:${id}`;
const COVER_KEY = (id: string) => `foscl:pdf_cover:${id}`;
const PAGES_KEY = (id: string) => `foscl:pdf_pages:${id}`;

interface Progress {
  page: number;
  numPages?: number;
  at?: number;
}

const readJson = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const authorsOf = (p: Paper): string => {
  try {
    const a = JSON.parse(p.authors_json || "[]") as string[];
    return a.length > 2 ? `${a[0]} et al.` : a.join(", ");
  } catch {
    return "";
  }
};

const btn = (primary = false): React.CSSProperties => ({
  padding: "7px 14px",
  borderRadius: 6,
  border: primary ? "1px solid transparent" : "1px solid var(--border-strong, var(--border))",
  background: primary ? "var(--accent)" : "var(--panel-dark)",
  color: primary ? "var(--on-accent)" : "var(--text-main)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
});

// Covers are made one at a time so opening the shelf never loads many large PDFs at once.
let coverQueue: Promise<unknown> = Promise.resolve();

const makeCover = (id: string): Promise<string | null> => {
  const job = coverQueue.then(async () => {
    try {
      const bytes = await loadPdfBytes(id);
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      try {
        localStorage.setItem(PAGES_KEY(id), String(doc.numPages));
      } catch {}
      const page = await doc.getPage(1);
      const v1 = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 240 / v1.width });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.72);
      try {
        localStorage.setItem(COVER_KEY(id), url);
      } catch {}
      doc.destroy();
      return url;
    } catch {
      return null;
    }
  });
  coverQueue = job.catch(() => null);
  return job;
};

const Cover: React.FC<{ id: string; title: string }> = ({ id, title }) => {
  const [src, setSrc] = useState<string | null>(() => {
    try {
      return localStorage.getItem(COVER_KEY(id));
    } catch {
      return null;
    }
  });
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (src || failed || !ref.current) return;
    let alive = true;
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      makeCover(id).then((u) => alive && (u ? setSrc(u) : setFailed(true)));
    });
    io.observe(ref.current);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [id, src, failed]);

  return (
    <div ref={ref} style={{ aspectRatio: "3 / 4", background: "var(--panel-dark)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: "1px solid var(--border)" }}>
      {src ? (
        <img src={src} alt={`First page of ${title}`} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      ) : (
        <span aria-hidden style={{ fontSize: 34, opacity: 0.55 }}>
          📄
        </span>
      )}
    </div>
  );
};

export const PdfShelf: React.FC = () => {
  const navigate = useNavigate();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "added">("recent");
  const [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const all = await getPapers();
      setPapers(all.filter((p) => !!p.pdf_path));
    } catch (err: any) {
      toast.error("Could not load your PDFs: " + (err?.toString?.() ?? err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const progressOf = (id: string): Progress | null => readJson<Progress>(PROGRESS_KEY(id));
  const pagesOf = (id: string): number => {
    const p = progressOf(id);
    if (p?.numPages) return p.numPages;
    return parseInt(localStorage.getItem(PAGES_KEY(id)) || "0", 10) || 0;
  };

  const importFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setImporting(true);
    let added = 0;
    let skipped = 0;
    let failed = 0;
    const known = new Set(papers.map((p) => p.title.trim().toLowerCase()));
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let title = f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
        let authors: string[] = [];
        let year: number | undefined;
        try {
          const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
          const meta: any = await doc.getMetadata();
          const t = (meta?.info?.Title || "").toString().trim();
          // metadata titles like "untitled" or "Microsoft Word - report.docx" are worse than the file name
          if (t.length > 3 && !/^(untitled|microsoft word|document\d*|slide|presentation)|\.(docx?|tex|pptx?|indd)$/i.test(t)) title = t;
          const a = (meta?.info?.Author || "").toString().trim();
          if (a) authors = a.split(/\s*(?:;|,|\band\b)\s*/i).filter(Boolean);
          const y = /D:(\d{4})/.exec((meta?.info?.CreationDate || "").toString());
          if (y) year = parseInt(y[1], 10);
          doc.destroy();
        } catch {}
        if (known.has(title.toLowerCase())) {
          skipped++;
          continue;
        }
        const paper = await upsertPaper({ title, year, authors_json: authors.length ? JSON.stringify(authors) : undefined });
        await uploadPdf(paper.id, bytes);
        known.add(title.toLowerCase());
        added++;
      } catch (err) {
        console.error("PDF import failed", f.name, err);
        failed++;
      }
    }
    setImporting(false);
    await load();
    if (added) toast.success(added === 1 ? "PDF added to your shelf" : `${added} PDFs added to your shelf`);
    if (skipped) toast.info(`${skipped} already on your shelf, skipped`);
    if (failed) toast.error(`${failed} file${failed === 1 ? "" : "s"} could not be imported`);
  };

  const remove = (p: Paper) => {
    deleteWithUndo({
      label: `Deleted "${p.title.slice(0, 40)}${p.title.length > 40 ? "…" : ""}" with its highlights`,
      hide: () => setPapers((list) => list.filter((x) => x.id !== p.id)),
      show: () => setPapers((list) => (list.some((x) => x.id === p.id) ? list : [...list, p])),
      commit: () => deletePaper(p.id),
    });
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = papers.filter((p) => !q || p.title.toLowerCase().includes(q) || (p.authors_json || "").toLowerCase().includes(q));
    const at = (p: Paper) => progressOf(p.id)?.at ?? 0;
    return list.sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : sort === "added" ? (b.created_at || "").localeCompare(a.created_at || "") : at(b) - at(a) || (b.created_at || "").localeCompare(a.created_at || "")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, query, sort]);

  const resume = useMemo(() => {
    let best: { p: Paper; pr: Progress } | null = null;
    for (const p of papers) {
      const pr = progressOf(p.id);
      if (pr?.at && (!best || pr.at > (best.pr.at || 0))) best = { p, pr };
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple onChange={importFiles} style={{ display: "none" }} aria-label="Choose PDF files" />
      <div style={{ padding: "28px 40px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <BooksTabs active="pdf" />
        <header style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, color: "var(--text-main)", margin: "0 0 6px 0" }}>PDF papers</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
              {papers.length === 0 ? "Papers with a PDF, ready to read and highlight." : `${papers.length} PDF${papers.length === 1 ? "" : "s"} · highlights and notes are saved with each paper`}
            </p>
          </div>
          <button onClick={() => input.current?.click()} disabled={importing} style={{ ...btn(true), opacity: importing ? 0.7 : 1 }}>
            {importing ? "Importing…" : "+ Import PDF"}
          </button>
        </header>

        {resume && (
          <div style={{ marginBottom: 18, padding: "12px 16px", borderRadius: 10, background: "var(--panel)", border: "1px solid var(--border-strong, var(--border))", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-muted)" }}>Continue reading</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{resume.p.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Page {resume.pr.page}
                {pagesOf(resume.p.id) ? ` of ${pagesOf(resume.p.id)}` : ""}
              </div>
            </div>
            <Link to={`/reader/${resume.p.id}?from=shelf&page=${resume.pr.page}`} style={btn(true)}>
              Continue
            </Link>
          </div>
        )}

        {papers.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or author…"
              aria-label="Search your PDFs"
              style={{ flex: 1, minWidth: 220, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-strong, var(--border))", background: "var(--panel)", color: "var(--text-main)", fontSize: 13 }}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort PDFs" style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-strong, var(--border))", background: "var(--panel)", color: "var(--text-main)", fontSize: 13 }}>
              <option value="recent">Recently read</option>
              <option value="added">Recently added</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        )}

        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : papers.length === 0 ? (
          <div style={{ border: "2px dashed var(--border-strong, var(--border))", borderRadius: 14, padding: "60px 20px", textAlign: "center", background: "var(--panel)" }}>
            <div style={{ fontSize: 44 }}>📄</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-main)", margin: "8px 0 6px" }}>No PDFs yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 480, margin: "0 auto 18px", lineHeight: 1.6 }}>
              Import PDFs to read them here. Each one becomes a paper in your library, and FOSCL remembers your page and keeps your highlights and notes.
            </div>
            <button onClick={() => input.current?.click()} style={btn(true)}>
              Choose PDF files
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No PDFs match “{query}”.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 18 }}>
            {shown.map((p) => {
              const pr = progressOf(p.id);
              const total = pagesOf(p.id);
              const pct = pr && total ? Math.min(100, Math.round((pr.page / total) * 100)) : 0;
              const by = authorsOf(p);
              return (
                <div key={p.id} style={{ borderRadius: 10, overflow: "hidden", background: "var(--panel)", border: "1px solid var(--border-strong, var(--border))", display: "flex", flexDirection: "column" }}>
                  <button onClick={() => navigate(`/reader/${p.id}?from=shelf`)} aria-label={`Open ${p.title}`} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", display: "block" }}>
                    <Cover id={p.id} title={p.title} />
                  </button>
                  <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                    <div title={p.title} style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {p.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[by, p.year].filter(Boolean).join(" · ") || " "}
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--panel-dark)", boxShadow: "inset 0 0 0 1px var(--border-strong, var(--border))", overflow: "hidden", marginTop: 4 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pr ? `Page ${pr.page}${total ? ` of ${total}` : ""}` : total ? `${total} pages · not opened` : "Not opened yet"}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button onClick={() => navigate(`/reader/${p.id}?from=shelf`)} style={{ ...btn(true), flex: 1, padding: "6px 8px", fontSize: 12 }}>
                        Read
                      </button>
                      <Link to={`/paper/${p.id}`} style={{ ...btn(), padding: "6px 8px", fontSize: 12 }}>
                        Details
                      </Link>
                      <button
                        onClick={() => remove(p)}
                        title="Delete this paper, its PDF and highlights"
                        aria-label={`Delete ${p.title}`}
                        style={{ ...btn(), padding: "6px 8px", fontSize: 12, color: "var(--danger-ink)", border: "1px solid color-mix(in srgb, var(--danger-ink) 80%, var(--panel-dark))" }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
