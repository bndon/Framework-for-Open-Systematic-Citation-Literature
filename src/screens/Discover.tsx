import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  searchOpenAlex,
  getCollections,
  upsertPaper,
  addPaperToCollection,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { Collection, PaperResult } from "../types";
import { mergeResults, applyFilters, countActiveFilters, DEFAULT_FILTERS } from "../lib/papers";
import type { DiscoverFilters, SortMode } from "../lib/papers";

export interface DiscoverPaper extends PaperResult {
  citation_count?: number;
  is_open_access?: boolean;
}

type Tab = "lineage" | "matrix" | "reader";
type ReaderSub = "abstract" | "pdf" | "refs";

/** Survives leaving and re-opening the screen (cleared when the app reloads). */
const session: {
  query: string;
  results: DiscoverPaper[];
  selected: string[]; // ids, in the order they were picked
  activeQuery: string;
  searched: boolean;
  page: number;
  canLoadMore: boolean;
  filters: DiscoverFilters;
  tab: Tab;
  readerId: string | null;
} = {
  query: "",
  results: [],
  selected: [],
  activeQuery: "",
  searched: false,
  page: 1,
  canLoadMore: false,
  filters: DEFAULT_FILTERS,
  tab: "reader",
  readerId: null,
};

const ctl: React.CSSProperties = {
  height: "30px",
  background: "var(--panel-dark)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  padding: "0 8px",
  fontSize: "12px",
  color: "var(--text-main)",
  outline: "none",
};
const lbl: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" };
const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  background: "var(--deep, var(--accent))",
  color: "var(--panel-dark)",
  border: "none",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
};

const EmptyState: React.FC<{ icon: string; title: string; text: string }> = ({ icon, title, text }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
    <div style={{ fontSize: "34px", opacity: 0.8 }}>{icon}</div>
    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-main)" }}>{title}</div>
    <div style={{ fontSize: "13px", maxWidth: "320px", lineHeight: 1.5 }}>{text}</div>
  </div>
);

const surname = (p: DiscoverPaper) => (p.authors[0] || "Unknown").split(" ").pop() as string;
const shortLabel = (p: DiscoverPaper) => `${surname(p)} ${p.year ?? "n.d."}`;

/** 1, 2, 5, 10, 25 ... year steps so the axis never gets crowded. */
function yearStep(span: number): number {
  for (const s of [1, 2, 5, 10, 25, 50]) if (span / s <= 8) return s;
  return 100;
}

export const Discover: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState(session.query);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoverPaper[]>(session.results);
  const [selected, setSelected] = useState<string[]>(session.selected);
  const [searched, setSearched] = useState(session.searched);
  const [activeTab, setActiveTab] = useState<Tab>(session.tab);
  const [readerSubTab, setReaderSubTab] = useState<ReaderSub>("abstract");
  const [readerId, setReaderId] = useState<string | null>(session.readerId);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filters, setFilters] = useState<DiscoverFilters>(session.filters);
  const [activeQuery, setActiveQuery] = useState(session.activeQuery); // the query that produced `results`
  const [page, setPage] = useState(session.page);
  const [canLoadMore, setCanLoadMore] = useState(session.canLoadMore);
  const requestId = useRef(0);

  // keep the session cache in step with the screen
  useEffect(() => {
    Object.assign(session, { query, results, selected, activeQuery, searched, page, canLoadMore, filters, tab: activeTab, readerId });
  });

  useEffect(() => {
    getCollections().then(setCollections).catch(() => {});
  }, []);

  const runSearch = async (q: string, pageNo: number, append: boolean) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await searchOpenAlex(q, pageNo);
      if (id !== requestId.current) return; // a newer search superseded this one
      const base = append ? results : [];
      const { papers, merged } = mergeResults(base, res.map((p) => ({ ...p, is_open_access: !!p.oa_url })));
      setResults(papers as DiscoverPaper[]);
      setActiveQuery(q);
      setSearched(true);
      setPage(pageNo);
      setCanLoadMore(res.length > 0);
      if (!append) {
        setSelected([]);
        setReaderId(null);
      }
      if (res.length === 0 && !append) toast.info("No papers found");
      if (merged > 0) toast.info(`Merged ${merged} duplicate record${merged === 1 ? "" : "s"}`);
    } catch {
      if (id === requestId.current) toast.error("Failed to query OpenAlex");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    runSearch(clean, 1, false);
  };

  const patchFilters = (patch: Partial<DiscoverFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeFilterCount = countActiveFilters(filters);

  const visible = useMemo(() => applyFilters(results, filters) as DiscoverPaper[], [results, filters]);

  const toggleSelectPaper = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Everything on the right is derived from the picks, so it updates the moment you tick a paper.
  const selectedPapers = useMemo(
    () => selected.map((id) => results.find((p) => p.openalex_id === id)).filter((p): p is DiscoverPaper => !!p),
    [selected, results]
  );

  // Reader: one pick opens straight away; several picks show a menu until you choose one.
  const readerPaper: DiscoverPaper | undefined =
    selectedPapers.length === 1
      ? selectedPapers[0]
      : selectedPapers.find((p) => p.openalex_id === readerId);

  const openInReader = (id: string) => {
    setReaderId(id);
    setReaderSubTab("abstract");
    setActiveTab("reader");
  };

  const handleCite = async (p: DiscoverPaper) => {
    const last = surname(p).replace(/[^A-Za-z0-9]/g, "");
    const key = `${last}${p.year ?? ""}`;
    const bib = `@article{${key},\n  title = {${p.title}},\n  author = {${p.authors.join(" and ")}},\n  year = {${p.year ?? ""}},\n  journal = {${p.venue ?? ""}},\n  doi = {${p.doi ?? ""}}\n}`;
    try {
      await navigator.clipboard.writeText(bib);
      toast.success("BibTeX copied");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const handleSaveToReview = async (paper: DiscoverPaper) => {
    try {
      const myReviewColl = collections.find((c) => c.name.toLowerCase().includes("review")) || collections[0];
      const paperRecord = await upsertPaper({
        title: paper.title,
        authors_json: JSON.stringify(paper.authors),
        year: paper.year,
        venue: paper.venue,
        abstract: paper.abstract,
        doi: paper.doi,
        oa_url: paper.oa_url,
      });
      if (myReviewColl) {
        await addPaperToCollection(myReviewColl.id, paperRecord.id);
        toast.success(`Saved "${paper.title.slice(0, 30)}…" to ${myReviewColl.name}`);
      } else {
        toast.success(`Saved "${paper.title.slice(0, 30)}…" to Library`);
      }
    } catch {
      toast.error("Failed to save paper");
    }
  };

  // ── Lineage timeline geometry (from the selected papers) ─────────────
  const timeline = useMemo(() => {
    const dated = selectedPapers.filter((p) => p.year != null).sort((a, b) => (a.year as number) - (b.year as number));
    if (dated.length === 0) return null;
    let minY = dated[0].year as number;
    let maxY = dated[dated.length - 1].year as number;
    if (maxY - minY < 4) {
      const pad = Math.ceil((4 - (maxY - minY)) / 2);
      minY -= pad;
      maxY += pad;
    }
    const span = maxY - minY;
    const step = yearStep(span);
    const ticks: number[] = [];
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) ticks.push(y);
    const X0 = 70;
    const X1 = 530;
    const xOf = (y: number) => X0 + ((y - minY) / span) * (X1 - X0);
    const maxCites = Math.max(1, ...dated.map((p) => p.citation_count ?? 0));
    const nodes = dated.map((p, i) => ({
      paper: p,
      x: xOf(p.year as number),
      y: i % 2 === 0 ? 150 : 100,
      r: p.citation_count !== undefined ? 11 + 12 * Math.sqrt((p.citation_count ?? 0) / maxCites) : 15,
    }));
    return { nodes, ticks, xOf, undated: selectedPapers.length - dated.length };
  }, [selectedPapers]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
        padding: "92px 36px 24px 36px", // clear the fixed quarter-circle menu
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Header Section (from Screenshot 2026-11-13 233641.png) */}
      <div style={{ marginBottom: "16px", flexShrink: 0 }}>
        <h1 style={{ margin: "0 0 2px 0", fontSize: "28px", fontWeight: 800, color: "var(--text-main)" }}>
          Discover Papers
        </h1>
        <div style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "12px" }}>
          Search OpenAlex, compare papers side by side, and save the ones you need.
        </div>

        {/* Wide Search Bar */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search millions of papers in OpenAlex..."
            style={{ ...ctl, flex: 1, height: "38px", padding: "0 14px", fontSize: "14px" }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding: "0 18px", background: "var(--accent)", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, color: "var(--panel-dark)", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Filter Row */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={lbl}>Year</span>
          <input type="number" placeholder="from" value={filters.yearFrom} onChange={(e) => patchFilters({ yearFrom: e.target.value })} style={{ ...ctl, width: "76px" }} />
          <span style={lbl}>–</span>
          <input type="number" placeholder="to" value={filters.yearTo} onChange={(e) => patchFilters({ yearTo: e.target.value })} style={{ ...ctl, width: "76px" }} />
          <select value={filters.sort} onChange={(e) => patchFilters({ sort: e.target.value as SortMode })} style={ctl}>
            <option value="relevance">Sort: Relevance</option>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="title">Sort: Title A–Z</option>
          </select>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
            <input type="checkbox" checked={filters.openAccessOnly} onChange={(e) => patchFilters({ openAccessOnly: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
            Open access
          </label>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
            <input type="checkbox" checked={filters.hasAbstract} onChange={(e) => patchFilters({ hasAbstract: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
            Has abstract
          </label>
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ ...ctl, cursor: "pointer", fontWeight: 600 }}>
              Reset ({activeFilterCount})
            </button>
          )}
          <span style={{ ...lbl, marginLeft: "auto" }}>
            {visible.length === results.length ? `${results.length} papers` : `${visible.length} of ${results.length} papers`}
          </span>
        </div>
      </div>

      {/* Split Columns Workspace */}
      <div style={{ flex: 1, display: "flex", gap: "20px", minHeight: 0 }}>
        {/* Left Column: Paper Selection List (38% width) */}
        <div style={{ flex: "0 0 38%", display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
          {results.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...lbl, flexShrink: 0 }}>
              <span>{selected.length} selected</span>
              {selected.length > 0 && (
                <button onClick={() => setSelected([])} style={{ ...ctl, height: "24px", cursor: "pointer", fontWeight: 600 }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {results.length === 0 && (
            <EmptyState
              icon="🔍"
              title={searched ? `No papers found for “${activeQuery}”` : "Search to get started"}
              text={searched ? "Try different keywords or a DOI." : "Results from OpenAlex appear here. Tick papers to compare them and read them on the right."}
            />
          )}
          {results.length > 0 && visible.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No papers match the current filters.
            </div>
          )}

          {visible.map((paper) => {
            const isSelected = selected.includes(paper.openalex_id);
            const count = paper.citation_count;
            return (
              <div
                key={paper.openalex_id}
                onClick={() => toggleSelectPaper(paper.openalex_id)}
                style={{
                  background: isSelected ? "var(--panel-dark)" : "var(--panel)",
                  border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "16px 18px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    style={{ marginTop: "4px", accentColor: "var(--accent)", width: "16px", height: "16px" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-main)", marginBottom: "4px" }}>{paper.title}</div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: count !== undefined ? "8px" : 0 }}>
                      {paper.authors.join(", ")} • {paper.year ?? "n.d."}{paper.oa_url ? " • 🔓" : ""}
                    </div>
                    {count !== undefined && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--nav-active-bg)", color: "var(--accent)", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
                        ★ {count.toLocaleString()} Citations
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {activeQuery && canLoadMore && results.length > 0 && (
            <button
              onClick={() => runSearch(activeQuery, page + 1, true)}
              disabled={loading}
              style={{ ...ctl, height: "36px", cursor: loading ? "wait" : "pointer", fontWeight: 700, flexShrink: 0 }}
            >
              {loading ? "Loading..." : `Load more for "${activeQuery}"`}
            </button>
          )}
        </div>

        {/* Right Column: Multi-Tab Workspace Panel (62% width) */}
        <div style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Workspace Tabs Header */}
          <div style={{ display: "flex", justifyContent: "center", gap: "8px", padding: "12px", borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
            {([
              { id: "lineage", label: "Lineage Timeline" },
              { id: "matrix", label: "Compare Matrix" },
              { id: "reader", label: "Reader" },
            ] as { id: Tab; label: string }[]).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "8px 24px",
                    borderRadius: "6px",
                    border: "none",
                    background: isActive ? "var(--deep, var(--accent))" : "transparent",
                    color: isActive ? "var(--panel-dark)" : "var(--text-main)",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab 1: Lineage Timeline — built live from the selected papers */}
          {activeTab === "lineage" && (
            selectedPapers.length === 0 ? (
              <EmptyState icon="🧬" title="No papers selected" text="Tick one or more papers on the left and their timeline is drawn here." />
            ) : !timeline ? (
              <EmptyState icon="📅" title="No publication years" text="None of the selected records include a year, so they can't be placed on a timeline." />
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", minHeight: 0 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="100%" height="270" viewBox="0 0 600 250" style={{ overflow: "visible" }}>
                    <line x1="40" y1="215" x2="560" y2="215" stroke="var(--text-muted)" strokeWidth="2" opacity="0.6" />
                    {timeline.ticks.map((yr) => (
                      <g key={yr}>
                        <line x1={timeline.xOf(yr)} y1="210" x2={timeline.xOf(yr)} y2="220" stroke="var(--text-muted)" strokeWidth="1.5" opacity="0.6" />
                        <text x={timeline.xOf(yr)} y="236" textAnchor="middle" fontSize="11" fill="var(--text-muted)">{yr}</text>
                      </g>
                    ))}

                    {/* chronological chain between neighbours */}
                    {timeline.nodes.slice(1).map((n, i) => {
                      const a = timeline.nodes[i];
                      const midY = Math.min(a.y, n.y) - 40;
                      return (
                        <path key={n.paper.openalex_id} d={`M ${a.x},${a.y} Q ${(a.x + n.x) / 2},${midY} ${n.x},${n.y}`} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" opacity="0.7" />
                      );
                    })}

                    {timeline.nodes.map((n) => (
                      <g key={n.paper.openalex_id} style={{ cursor: "pointer" }} onClick={() => openInReader(n.paper.openalex_id)}>
                        <title>{`${n.paper.title} (${n.paper.year}) — click to read`}</title>
                        <line x1={n.x} y1={n.y + n.r} x2={n.x} y2="215" stroke="var(--border)" strokeWidth="1.5" />
                        <circle cx={n.x} cy={n.y} r={n.r} fill={n.paper.oa_url ? "var(--accent)" : "var(--deep, var(--accent))"} stroke="var(--panel)" strokeWidth="3" />
                        <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--text-main)">{shortLabel(n.paper)}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
                  Papers placed by publication year; dashed lines join neighbours in time, not citations. Node size follows citation count when known. Click a node to read it.
                  {timeline.undated > 0 && ` ${timeline.undated} selected paper${timeline.undated === 1 ? " has" : "s have"} no year and ${timeline.undated === 1 ? "is" : "are"} not shown.`}
                </div>
                <button onClick={() => navigate("/lineage")} style={primaryBtn}>Open in Full Research Lineage View</button>
              </div>
            )
          )}

          {/* Tab 2: Compare Matrix — one column per selected paper */}
          {activeTab === "matrix" && (
            selectedPapers.length === 0 ? (
              <EmptyState icon="📊" title="No papers selected" text="Tick two or more papers on the left to compare them side by side." />
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", overflowY: "auto" }}>
                {selectedPapers.length === 1 && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px" }}>Select another paper to compare against.</div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--panel-dark)", borderRadius: "8px", overflow: "hidden", tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--panel)", borderBottom: "1.5px solid var(--border)" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: 800, width: "110px" }}>Feature</th>
                      {selectedPapers.slice(0, 4).map((p) => (
                        <th key={p.openalex_id} style={{ padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: 800, verticalAlign: "top" }}>
                          <div>{shortLabel(p)}</div>
                          <div style={{ fontWeight: 500, fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.3 }}>{p.title}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Authors", fn: (p: DiscoverPaper) => (p.authors.length ? p.authors.join(", ") : "—") },
                      { label: "Year", fn: (p: DiscoverPaper) => p.year ?? "—" },
                      { label: "Venue", fn: (p: DiscoverPaper) => p.venue || "—" },
                      { label: "Citations", fn: (p: DiscoverPaper) => (p.citation_count !== undefined ? p.citation_count.toLocaleString() : "—") },
                      { label: "Access", fn: (p: DiscoverPaper) => (p.oa_url ? "Open access" : "No open copy found") },
                      { label: "DOI", fn: (p: DiscoverPaper) => p.doi || "—" },
                      {
                        label: "Abstract",
                        fn: (p: DiscoverPaper) => {
                          const a = (p.abstract || "").trim();
                          return a ? (a.length > 260 ? a.slice(0, 260).trimEnd() + "…" : a) : "—";
                        },
                      },
                    ].map((row) => (
                      <tr key={row.label} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: "12.5px", background: "var(--panel)", verticalAlign: "top" }}>{row.label}</td>
                        {selectedPapers.slice(0, 4).map((p) => (
                          <td key={p.openalex_id} style={{ padding: "12px 14px", fontSize: "12px", color: "var(--text-main)", lineHeight: 1.45, verticalAlign: "top", wordBreak: "break-word" }}>
                            {row.fn(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedPapers.length > 4 && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>Showing the first 4 of {selectedPapers.length} selected papers.</div>
                )}
                <div style={{ marginTop: "auto", paddingTop: "16px" }}>
                  <button onClick={() => navigate("/compare")} style={primaryBtn}>Open in Full Comparison Table</button>
                </div>
              </div>
            )
          )}

          {/* Tab 3: Reader — pick which selected paper to open, then read it */}
          {activeTab === "reader" && (
            selectedPapers.length === 0 ? (
              <EmptyState icon="📖" title="No paper to read" text="Tick a paper on the left. One selected paper opens right away; with several, you choose which to open first." />
            ) : !readerPaper ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", overflowY: "auto", gap: "10px" }}>
                <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-main)" }}>Which paper do you want to open?</div>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "4px" }}>{selectedPapers.length} papers selected</div>
                {selectedPapers.map((p) => (
                  <button
                    key={p.openalex_id}
                    onClick={() => openInReader(p.openalex_id)}
                    style={{ textAlign: "left", padding: "14px 16px", background: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "10px", cursor: "pointer", color: "var(--text-main)" }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "3px" }}>{p.title}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{p.authors.join(", ")} • {p.year ?? "n.d."}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", overflowY: "auto" }}>
                {selectedPapers.length > 1 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                    {selectedPapers.map((p) => {
                      const on = p.openalex_id === readerPaper.openalex_id;
                      return (
                        <button
                          key={p.openalex_id}
                          onClick={() => openInReader(p.openalex_id)}
                          title={p.title}
                          style={{ ...ctl, cursor: "pointer", fontWeight: 700, background: on ? "var(--accent)" : "var(--panel-dark)", color: on ? "var(--panel-dark)" : "var(--text-main)", border: on ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                        >
                          {shortLabel(p)}
                        </button>
                      );
                    })}
                    <button onClick={() => setReaderId(null)} style={{ ...ctl, cursor: "pointer", color: "var(--text-muted)" }}>All…</button>
                  </div>
                )}

                <h2 style={{ margin: "0 0 6px 0", fontSize: "22px", fontWeight: 800, color: "var(--text-main)" }}>{readerPaper.title}</h2>
                <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                  {readerPaper.authors.join(", ")}{readerPaper.year ? `, ${readerPaper.year}` : ""} • {readerPaper.venue || "Venue unknown"}
                </div>

                <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                  <span style={{ padding: "4px 10px", background: "var(--nav-active-bg)", color: "var(--accent)", borderRadius: "4px", fontSize: "12px", fontWeight: 700 }}>
                    {readerPaper.doi ? `DOI ${readerPaper.doi}` : "No DOI"}
                  </span>
                  <span style={{ padding: "4px 10px", background: readerPaper.oa_url ? "#D1FAE5" : "var(--nav-active-bg)", color: readerPaper.oa_url ? "#065F46" : "var(--text-muted)", borderRadius: "4px", fontSize: "12px", fontWeight: 700 }}>
                    {readerPaper.oa_url ? "🔓 Open Access PDF" : "🔒 No open copy found"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid var(--border)", marginBottom: "14px" }}>
                  {([
                    { id: "abstract", label: "Abstract" },
                    { id: "pdf", label: "PDF Preview" },
                    { id: "refs", label: "Key References" },
                  ] as { id: ReaderSub; label: string }[]).map((st) => (
                    <span
                      key={st.id}
                      onClick={() => setReaderSubTab(st.id)}
                      style={{
                        paddingBottom: "6px",
                        borderBottom: readerSubTab === st.id ? "2.5px solid var(--deep, var(--accent))" : "2.5px solid transparent",
                        fontWeight: 700,
                        fontSize: "13px",
                        color: readerSubTab === st.id ? "var(--deep, var(--accent))" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      {st.label}
                    </span>
                  ))}
                </div>

                <div style={{ flex: 1, background: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px", fontSize: "13.5px", lineHeight: 1.6, color: "var(--text-main)", overflowY: "auto", marginBottom: "16px" }}>
                  {readerSubTab === "abstract" && (<><strong>Abstract:</strong> {readerPaper.abstract || "No abstract available for this record."}</>)}
                  {readerSubTab === "pdf" &&
                    (readerPaper.oa_url ? (
                      <div>
                        <p style={{ marginTop: 0 }}>An open-access copy is available from the publisher or repository.</p>
                        <a href={readerPaper.oa_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 700 }}>Open PDF in browser →</a>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>No open-access PDF found. Try the Access Hub for publisher options.</span>
                    ))}
                  {readerSubTab === "refs" && (
                    <div>
                      <p style={{ marginTop: 0 }}>See what this paper cites and who cites it.</p>
                      <button onClick={() => navigate("/citations")} style={{ ...ctl, height: "34px", cursor: "pointer", fontWeight: 700 }}>Open Citation Tree</button>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <button onClick={() => handleSaveToReview(readerPaper)} style={{ ...primaryBtn, flex: 1, width: "auto" }}>+ Save to My Review</button>
                  <button onClick={() => handleCite(readerPaper)} style={{ ...primaryBtn, flex: 1, width: "auto", background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text-main)" }}>Cite</button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
