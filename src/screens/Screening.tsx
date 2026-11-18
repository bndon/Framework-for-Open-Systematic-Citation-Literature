import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  addPaperToCollection,
  createCollection,
  getCollectionPapers,
  getCollections,
  getPaperMetas,
  getScreening,
  getSearchLog,
  setScreening,
} from "../lib/api";
import { computePrisma, prismaSvg, prismaText, type PrismaPalette } from "../lib/prisma";
import { saveTextFile } from "../lib/saveFile";
import { toast } from "../lib/toast";
import type { Collection, Paper, ScreeningChoice, ScreeningDecision, ScreeningStage, SearchLogEntry } from "../types";

// ---------------------------------------------------------------------------
const LAST_KEY = "foscl:screening_collection";
const MANUAL_KEY = (cid: string) => `foscl:prisma_manual:${cid}`;

const REASONS = [
  "Wrong topic",
  "Wrong population",
  "Wrong study type",
  "Not peer reviewed",
  "Full text not available",
  "Not in English",
  "Duplicate of another record",
  "Outside date range",
];

const CHOICES: { id: ScreeningChoice; label: string; key: string; tone: string }[] = [
  { id: "include", label: "Include", key: "I", tone: "var(--success-ink)" },
  { id: "maybe", label: "Maybe", key: "M", tone: "var(--warn-ink)" },
  { id: "exclude", label: "Exclude", key: "X", tone: "var(--danger-ink)" },
];

const STAGES: { id: ScreeningStage; label: string; hint: string }[] = [
  { id: "title_abstract", label: "1 · Title & abstract", hint: "Decide from the title and abstract alone" },
  { id: "full_text", label: "2 · Full text", hint: "Papers you included or marked maybe in stage 1" },
];

type Filter = "all" | "todo" | ScreeningChoice;

function authorsOf(p: Paper): string {
  try {
    const a = JSON.parse(p.authors_json || "[]");
    if (Array.isArray(a) && a.length) return a.length > 3 ? `${a.slice(0, 3).join(", ")} et al.` : a.join(", ");
  } catch {}
  return "";
}

const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, var(--panel-dark))`;

const chip = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: "16px",
  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
  background: active ? "var(--accent)" : "var(--panel-dark)",
  color: active ? "var(--on-accent)" : "var(--text-main)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
});

const smallBtn = (primary = false): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: "6px",
  border: primary ? "1px solid transparent" : "1px solid var(--border)",
  background: primary ? "var(--accent)" : "var(--panel-dark)",
  color: primary ? "var(--on-accent)" : "var(--text-main)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
});

function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
export const Screening: React.FC<{ collectionId?: string; embedded?: boolean }> = ({ collectionId, embedded = false }) => {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cid, setCid] = useState<string>("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [decisions, setDecisions] = useState<ScreeningDecision[]>([]);
  const [searches, setSearches] = useState<SearchLogEntry[]>([]);
  const [cites, setCites] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<ScreeningStage>("title_abstract");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // ----- load ---------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const cs = await getCollections();
        setCollections(cs);
        let last = "";
        try {
          last = localStorage.getItem(LAST_KEY) || "";
        } catch {}
        if (!embedded) setCid(cs.find((c) => c.id === last)?.id || cs[0]?.id || "");
      } catch {
        toast.error("Could not load collections");
      } finally {
        setLoading(false);
      }
    })();
    getPaperMetas()
      .then((ms) => {
        const m: Record<string, number> = {};
        ms.forEach((x) => {
          if (x.cited_by_count != null) m[x.paper_id] = x.cited_by_count;
        });
        setCites(m);
      })
      .catch(() => {});
  }, []);

  // inside the Library the collection comes from the Library's own selection
  useEffect(() => {
    if (embedded) setCid(collectionId || "");
  }, [embedded, collectionId]);

  useEffect(() => {
    if (!cid) {
      setPapers([]);
      setDecisions([]);
      setSearches([]);
      return;
    }
    try {
      localStorage.setItem(LAST_KEY, cid);
      setManual(localStorage.getItem(MANUAL_KEY(cid)) || "");
    } catch {
      setManual("");
    }
    setCursor(0);
    (async () => {
      try {
        const [ps, ds, log] = await Promise.all([getCollectionPapers(cid), getScreening(cid), getSearchLog(500)]);
        setPapers(ps);
        setDecisions(ds);
        setSearches(log.filter((s) => s.collection_id === cid));
      } catch {
        toast.error("Could not load this collection");
      }
    })();
  }, [cid]);

  // ----- derived --------------------------------------------------------------
  const d1 = useMemo(() => new Map(decisions.filter((d) => d.stage === "title_abstract").map((d) => [d.paper_id, d])), [decisions]);
  const d2 = useMemo(() => new Map(decisions.filter((d) => d.stage === "full_text").map((d) => [d.paper_id, d])), [decisions]);
  const dMap = stage === "title_abstract" ? d1 : d2;

  // stage 2 only looks at papers that passed stage 1 (include or maybe)
  const pool = useMemo(
    () => (stage === "title_abstract" ? papers : papers.filter((p) => ["include", "maybe"].includes(d1.get(p.id)?.decision || ""))),
    [papers, stage, d1]
  );

  const counts = useMemo(() => {
    const c = { all: pool.length, todo: 0, include: 0, maybe: 0, exclude: 0 };
    pool.forEach((p) => {
      const d = dMap.get(p.id);
      if (!d) c.todo++;
      else c[d.decision]++;
    });
    return c;
  }, [pool, dMap]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((p) => {
      const d = dMap.get(p.id);
      if (filter === "todo" && d) return false;
      if (filter !== "all" && filter !== "todo" && d?.decision !== filter) return false;
      if (q && !(p.title.toLowerCase().includes(q) || (p.abstract || "").toLowerCase().includes(q) || authorsOf(p).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [pool, dMap, filter, query]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const manualNum = manual.trim() === "" || isNaN(Number(manual)) ? null : Math.max(0, Math.floor(Number(manual)));
  const prisma = useMemo(() => computePrisma(papers, decisions, searches, manualNum), [papers, decisions, searches, manualNum]);
  const collName = collections.find((c) => c.id === cid)?.name || "Collection";

  // ----- actions ---------------------------------------------------------------
  const decide = useCallback(
    async (paperId: string, choice: ScreeningChoice | "", reason?: string) => {
      if (!cid) return;
      const prev = decisions;
      const existing = decisions.find((d) => d.paper_id === paperId && d.stage === stage);
      const keepReason = reason !== undefined ? reason : choice === "exclude" ? existing?.reason : undefined;
      // update the screen straight away, undo it if saving fails
      setDecisions((ds) => {
        const rest = ds.filter((d) => !(d.paper_id === paperId && d.stage === stage));
        return choice
          ? [...rest, { collection_id: cid, paper_id: paperId, stage, decision: choice, reason: keepReason || undefined, updated_at: new Date().toISOString() }]
          : rest;
      });
      try {
        await setScreening(cid, paperId, stage, choice, keepReason);
      } catch (err: any) {
        setDecisions(prev);
        toast.error("Could not save the decision: " + (err?.toString?.() ?? err));
      }
    },
    [cid, stage, decisions]
  );

  // keyboard: j/k move, i/m/x decide (then move on), u clears, Enter shows the abstract
  const decideRef = useRef(decide);
  decideRef.current = decide;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("[data-modal]")) return;
      const p = visible[cursor];
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(visible.length - 1, c + 1));
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (p && ["i", "m", "x", "u"].includes(k)) {
        e.preventDefault();
        decideRef.current(p.id, k === "i" ? "include" : k === "m" ? "maybe" : k === "x" ? "exclude" : "");
        if (k !== "u") setCursor((c) => Math.min(visible.length - 1, c + 1));
      } else if (p && e.key === "Enter") {
        e.preventDefault();
        setOpen((o) => ({ ...o, [p.id]: !o[p.id] }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, cursor]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const saveManual = (v: string) => {
    setManual(v);
    try {
      if (v.trim() === "") localStorage.removeItem(MANUAL_KEY(cid));
      else localStorage.setItem(MANUAL_KEY(cid), v);
    } catch {}
  };

  const includedFinal = useMemo(() => papers.filter((p) => d2.get(p.id)?.decision === "include"), [papers, d2]);

  const makeIncludedCollection = async () => {
    if (!includedFinal.length) return;
    try {
      const created = await createCollection(`${collName} — included`);
      for (const p of includedFinal) await addPaperToCollection(created.id, p.id);
      setCollections((cs) => [created, ...cs]);
      toast.success(`Created "${created.name}" with ${includedFinal.length} paper${includedFinal.length === 1 ? "" : "s"}`);
    } catch (err: any) {
      toast.error("Could not create the collection: " + (err?.toString?.() ?? err));
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(prismaText(prisma, collName));
      toast.success("PRISMA summary copied");
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };

  const downloadSvg = async () => {
    const { svg } = prismaSvg(prisma, {
      bg: "#ffffff",
      box: "#f6f6f6",
      stroke: "#333333",
      text: "#111111",
      muted: "#444444",
      accent: "#1f5f3a",
      accentText: "#ffffff",
    });
    try {
      const where = await saveTextFile(`${collName.replace(/[^a-zA-Z0-9_-]/g, "_")}_prisma.svg`, svg, { name: "SVG image", extensions: ["svg"] }, "image/svg+xml");
      if (where) toast.success(`Saved the flow diagram: ${where}`);
    } catch (err: any) {
      toast.error("Could not save: " + (err?.toString?.() ?? err));
    }
  };

  const palette: PrismaPalette = {
    bg: "var(--panel-dark)",
    box: "var(--panel)",
    stroke: "var(--border-strong, var(--border))",
    text: "var(--text-main)",
    muted: "var(--text-muted)",
    accent: "var(--deep, var(--accent))",
    accentText: "var(--on-deep, #ffffff)",
  };
  const diagram = useMemo(() => prismaSvg(prisma, palette).svg, [prisma]); // eslint-disable-line react-hooks/exhaustive-deps
  void cssVar;

  const decidedNow = counts.all - counts.todo;
  const pct = counts.all ? Math.round((decidedNow / counts.all) * 100) : 0;

  // ----- render ------------------------------------------------------------------
  if (loading) return <div style={{ padding: 40, color: "var(--text-muted)" }}>Loading…</div>;

  if (collections.length === 0) {
    return (
      <div style={{ padding: "60px 40px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 34 }} aria-hidden="true">🧪</div>
        <h2 style={{ color: "var(--text-main)", margin: "8px 0" }}>Nothing to screen yet</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
          Search in Discover, select the papers worth a closer look and add them to a collection. Then come back here to decide which ones to include.
        </p>
        <button onClick={() => navigate("/discover")} style={smallBtn(true)}>
          Go to Discover
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ padding: "14px 28px", borderBottom: "1px solid var(--border)", background: "var(--panel)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {!embedded && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>
          Collection
          <select
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            aria-label="Collection to screen"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-dark)", color: "var(--text-main)", fontSize: 13, maxWidth: 260 }}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>}
        <div style={{ display: "flex", gap: 6 }} role="group" aria-label="Screening stage">
          {STAGES.map((s) => (
            <button key={s.id} onClick={() => { setStage(s.id); setFilter("all"); setCursor(0); }} aria-pressed={stage === s.id} title={s.hint} style={chip(stage === s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", minWidth: 180 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3, textAlign: "right" }}>
            {decidedNow} of {counts.all} decided · {pct}%
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--panel-dark)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* list */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 28px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
            {([
              ["all", `All ${counts.all}`],
              ["todo", `To do ${counts.todo}`],
              ["include", `Include ${counts.include}`],
              ["maybe", `Maybe ${counts.maybe}`],
              ["exclude", `Exclude ${counts.exclude}`],
            ] as [Filter, string][]).map(([id, label]) => (
              <button key={id} onClick={() => { setFilter(id); setCursor(0); }} aria-pressed={filter === id} style={chip(filter === id)}>
                {label}
              </button>
            ))}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, author or abstract…"
              aria-label="Filter papers"
              style={{ marginLeft: "auto", flex: "0 1 260px", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-dark)", color: "var(--text-main)", fontSize: 12 }}
            />
          </div>
          <div style={{ padding: "6px 28px", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            Keys: <b>J</b>/<b>K</b> move · <b>I</b> include · <b>M</b> maybe · <b>X</b> exclude · <b>U</b> clear · <b>Enter</b> abstract
          </div>

          <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 28px 40px" }}>
            {papers.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 8 }}>
                This collection has no papers yet. Add some from Discover or the Library.
              </div>
            ) : pool.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 8 }}>
                No papers have passed the title &amp; abstract stage yet. Mark papers as Include or Maybe in stage 1 and they appear here.
              </div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 8 }}>
                Nothing matches this filter.
              </div>
            ) : (
              visible.map((p, i) => {
                const d = dMap.get(p.id);
                const prior = stage === "full_text" ? d1.get(p.id) : undefined;
                const isOpen = !!open[p.id];
                const active = i === cursor;
                const tone = CHOICES.find((c) => c.id === d?.decision)?.tone;
                return (
                  <div
                    key={p.id}
                    data-row={i}
                    onClick={() => setCursor(i)}
                    style={{
                      marginBottom: 12,
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "var(--panel-dark)",
                      border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
                      borderLeft: tone ? `5px solid ${tone}` : undefined,
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", lineHeight: 1.35 }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                          {[authorsOf(p), p.year, p.venue].filter(Boolean).join(" · ")}
                          {cites[p.id] != null && <span> · cited {cites[p.id].toLocaleString()}×</span>}
                        </div>
                        {prior && (
                          <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 10, border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                            Stage 1: {prior.decision}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }} role="group" aria-label={`Decision for ${p.title}`}>
                        {CHOICES.map((c) => {
                          const on = d?.decision === c.id;
                          return (
                            <button
                              key={c.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                decide(p.id, on ? "" : c.id);
                              }}
                              aria-pressed={on}
                              title={`${c.label} (${c.key})${on ? " — click again to clear" : ""}`}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                color: on ? "var(--text-main)" : c.tone,
                                background: on ? tint(c.tone, 22) : "var(--panel-dark)",
                                border: `${on ? 2 : 1}px solid color-mix(in srgb, ${c.tone} ${on ? 100 : 75}%, var(--panel-dark))`,
                              }}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {d?.decision === "exclude" && (
                      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }} htmlFor={`reason-${p.id}`}>
                          Reason
                        </label>
                        <input
                          id={`reason-${p.id}`}
                          list="screening-reasons"
                          defaultValue={d.reason || ""}
                          key={`${p.id}-${d.reason || ""}`}
                          placeholder={stage === "full_text" ? "Why is it excluded? (shown in the PRISMA diagram)" : "Optional"}
                          onBlur={(e) => {
                            if ((e.target.value || "") !== (d.reason || "")) decide(p.id, "exclude", e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          style={{ flex: 1, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-main)", fontSize: 12 }}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 8 }}>
                      {p.abstract ? (
                        <>
                          <div
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.55,
                              color: "var(--text-main)",
                              ...(isOpen ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
                            }}
                          >
                            {p.abstract}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen((o) => ({ ...o, [p.id]: !o[p.id] }));
                            }}
                            style={{ marginTop: 4, border: "none", background: "none", padding: 0, color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            {isOpen ? "Show less" : "Show more"}
                          </button>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No abstract available for this paper.</div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/paper/${p.id}`);
                        }}
                        style={{ marginLeft: 14, border: "none", background: "none", padding: 0, color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Open paper ›
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <datalist id="screening-reasons">
              {REASONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </div>

        {/* PRISMA rail */}
        <aside style={{ width: 480, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--panel)", overflowY: "auto", padding: "16px 16px 28px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>PRISMA flow</div>
          <div
            role="img"
            aria-label="PRISMA flow diagram"
            style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}
            dangerouslySetInnerHTML={{ __html: diagram.replace(/width="\d+" height="\d+"/, 'width="100%"') }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={copySummary} style={smallBtn()}>
              Copy summary
            </button>
            <button onClick={downloadSvg} style={smallBtn()}>
              Save diagram (SVG)
            </button>
          </div>

          <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: "var(--panel-dark)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            <label htmlFor="prisma-manual" style={{ display: "block", fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Records identified
            </label>
            <input
              id="prisma-manual"
              type="number"
              min={0}
              value={manual}
              onChange={(e) => saveManual(e.target.value)}
              placeholder={prisma.identifiedSource === "manual" ? "" : String(prisma.identified)}
              style={{ width: 110, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-main)", fontSize: 13 }}
            />
            <div style={{ marginTop: 6 }}>
              {prisma.identifiedSource === "log"
                ? `Counted from ${prisma.searches} logged search${prisma.searches === 1 ? "" : "es"} linked to this collection.`
                : prisma.identifiedSource === "manual"
                ? "Your own number is used. Clear it to count from the search log."
                : "No logged search is linked to this collection, so the collection size is used. Searches in Discover are linked automatically when you add papers to a collection; or type the number from other databases here."}
            </div>
          </div>

          <button
            onClick={makeIncludedCollection}
            disabled={!includedFinal.length}
            style={{ ...smallBtn(true), width: "100%", marginTop: 14, padding: "9px 12px", opacity: includedFinal.length ? 1 : 0.5, cursor: includedFinal.length ? "pointer" : "not-allowed" }}
          >
            Make a collection from the {includedFinal.length} included
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
            Papers included after full-text screening. Use the new collection for Compare, Lineage and Export.
          </div>
        </aside>
      </div>
    </div>
  );
};
