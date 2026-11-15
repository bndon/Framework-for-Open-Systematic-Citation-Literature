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

// Default curated papers matching Screenshot 2026-11-13 233641.png
const DEFAULT_PAPERS: DiscoverPaper[] = [
  {
    openalex_id: "W2741809807",
    doi: "10.1007/978-981-15-1960-4",
    title: "Machine Learning",
    authors: ["Zhi-Hua Zhou"],
    year: 2021,
    venue: "Springer Singapore",
    abstract: "Foundational ML theory and techniques, emphasizing deep learning models and statistical learning foundations. A comprehensive reference for core ML concepts and modern methods.",
    citation_count: 4120,
    oa_url: "https://example.com/ml-zhou.pdf",
    is_open_access: true,
  },
  {
    openalex_id: "W3165271822",
    doi: "10.1007/s12525-021-00475-2",
    title: "Machine learning and deep learning",
    authors: ["Christian Janiesch", "Patrick Zschech", "Kai Heinrich"],
    year: 2021,
    venue: "Electronic Markets",
    abstract: "Machine learning and deep learning is a foundational ML theory and techniques theory, emphasizing deep models, with wither neural network architectures. The highlights the synergy and complements of machine learning and deep learning of distinct ranges, and increasing integrating of meditative learning into genetic powerful methods and modern workflows.",
    citation_count: 4870,
    oa_url: "https://example.com/ml-janiesch.pdf",
    is_open_access: true,
  },
  {
    openalex_id: "W3189912044",
    doi: "10.1016/j.procs.2021.01.250",
    title: "Machine learning and deep learning algorithms",
    authors: ["Christian Janiesch", "Patrick Zschech"],
    year: 2021,
    venue: "Procedia Computer Science",
    abstract: "Comparative analysis of deep neural architectures versus classic supervised classifiers across benchmark computer vision and NLP tasks.",
    citation_count: 3255,
    oa_url: "https://example.com/ml-deep.pdf",
    is_open_access: true,
  },
  {
    openalex_id: "W2964128901",
    doi: "10.7551/mitpress/12201.001.0001",
    title: "Machine Learning: An Algorithmic Perspective",
    authors: ["Ethem Alpaydın"],
    year: 2021,
    venue: "The MIT Press",
    abstract: "Algorithmic foundations of machine learning covering parametric and nonparametric methods, kernel machines, Bayesian estimation, and reinforcement learning.",
    citation_count: 4120,
    oa_url: "https://example.com/mit-ml.pdf",
    is_open_access: true,
  },
];

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

export const Discover: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoverPaper[]>(DEFAULT_PAPERS);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(
    new Set([DEFAULT_PAPERS[0].openalex_id, DEFAULT_PAPERS[1].openalex_id])
  );
  const [activeTab, setActiveTab] = useState<"lineage" | "matrix" | "reader">("reader");
  const [readerSubTab, setReaderSubTab] = useState<"abstract" | "pdf" | "refs">("abstract");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [activeQuery, setActiveQuery] = useState(""); // the query that produced `results`
  const [page, setPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const list = await getCollections();
      setCollections(list);
    } catch {}
  };

  const runSearch = async (q: string, pageNo: number, append: boolean) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await searchOpenAlex(q, pageNo);
      if (id !== requestId.current) return; // a newer search superseded this one
      if (res.length === 0 && !append) {
        toast.info("No papers found. Showing previous results.");
        return;
      }
      const base = append ? results : [];
      const { papers, merged } = mergeResults(base, res.map((p) => ({ ...p, is_open_access: !!p.oa_url })));
      setResults(papers as DiscoverPaper[]);
      setActiveQuery(q);
      setPage(pageNo);
      setCanLoadMore(res.length > 0);
      if (!append) setSelectedPaperIds(new Set([papers[0].openalex_id]));
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

  const toggleSelectPaper = (id: string) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Primary active paper (for Reader view)
  const activePaper =
    visible.find((p) => selectedPaperIds.has(p.openalex_id)) || visible[0];

  // Selected papers (for Compare Matrix view)
  const selectedPapers = visible.filter((p) => selectedPaperIds.has(p.openalex_id));

  const handleCite = async (p: DiscoverPaper) => {
    const last = (p.authors[0] || "anon").split(" ").pop()!.replace(/[^A-Za-z0-9]/g, "");
    const key = `${last}${p.year ?? ""}`;
    const bib = `@article{${key},\n  title = {${p.title}},\n  author = {${p.authors.join(" and ")}},\n  year = {${p.year ?? ""}},\n  journal = {${p.venue ?? ""}},\n  doi = {${p.doi ?? ""}}\n}`;
    try {
      await navigator.clipboard.writeText(bib);
      toast.success("BibTeX copied");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const handleSaveToReview = async () => {
    if (!activePaper) return;
    try {
      const myReviewColl = collections.find((c) => c.name.toLowerCase().includes("review")) || collections[0];
      const paperRecord = await upsertPaper({
        title: activePaper.title,
        authors_json: JSON.stringify(activePaper.authors),
        year: activePaper.year,
        venue: activePaper.venue,
        abstract: activePaper.abstract,
        doi: activePaper.doi,
        oa_url: activePaper.oa_url,
      });
      if (myReviewColl) {
        await addPaperToCollection(myReviewColl.id, paperRecord.id);
        toast.success(`Saved "${activePaper.title.slice(0, 30)}…" to ${myReviewColl.name}`);
      } else {
        toast.success(`Saved "${activePaper.title.slice(0, 30)}…" to Library`);
      }
    } catch (e) {
      toast.error("Failed to save paper");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
        padding: "78px 36px 24px 36px", // clear the fixed quarter-circle menu + breadcrumb
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
        <div
          style={{
            flex: "0 0 38%",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            overflowY: "auto",
            paddingRight: "8px",
          }}
        >
          {visible.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No papers match the current filters.
            </div>
          )}
          {visible.map((paper) => {
            const isSelected = selectedPaperIds.has(paper.openalex_id);
            const count = paper.citation_count;
            return (
              <div
                key={paper.openalex_id}
                onClick={() => toggleSelectPaper(paper.openalex_id)}
                style={{
                  background: isSelected ? "var(--panel-dark)" : "var(--panel)",
                  border: isSelected ? "1.5px solid #8A5A7A" : "1px solid #E5E7EB",
                  borderRadius: "10px",
                  padding: "16px 18px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 4px 12px rgba(138, 90, 122, 0.12)" : "none",
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
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-main)", marginBottom: "4px" }}>
                      {paper.title}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
                      {paper.authors.join(", ")} • {paper.year ?? "n.d."}{paper.oa_url ? " • 🔓" : ""}
                    </div>
                    {count !== undefined && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "var(--nav-active-bg)",
                          color: "var(--accent)",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        ★ {count.toLocaleString()} Citations
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {activeQuery && canLoadMore && (
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
        <div
          style={{
            flex: 1,
            background: "var(--panel)",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Workspace Tabs Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "8px",
              padding: "12px",
              borderBottom: "1px solid #E5E7EB",
              background: "var(--panel)",
            }}
          >
            {[
              { id: "lineage", label: "Lineage Timeline" },
              { id: "matrix", label: "Compare Matrix" },
              { id: "reader", label: "Reader" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
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

          {/* Tab 1: Lineage Timeline (Matching Screenshot 2026-11-13 233627.png) */}
          {activeTab === "lineage" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", position: "relative" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                <svg width="100%" height="260" viewBox="0 0 600 240" style={{ overflow: "visible" }}>
                  {/* Timeline Horizontal Axis */}
                  <line x1="40" y1="200" x2="560" y2="200" stroke="#9CA3AF" strokeWidth="2" />
                  {["1995", "2000", "2005", "2010", "2015", "2020", "2025"].map((yr, i) => (
                    <g key={yr}>
                      <line x1={50 + i * 80} y1="195" x2={50 + i * 80} y2="205" stroke="#9CA3AF" strokeWidth="1.5" />
                      <text x={50 + i * 80} y="222" textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                        {yr}
                      </text>
                    </g>
                  ))}

                  {/* Arcs connecting nodes */}
                  <path d="M 60,150 Q 280,30 500,110" fill="none" stroke="#6E3D56" strokeWidth="2" opacity="0.6" />
                  <path d="M 180,150 Q 320,60 500,110" fill="none" stroke="#6E3D56" strokeWidth="3" opacity="0.8" />
                  <path d="M 330,150 Q 420,70 500,110" fill="none" stroke="#6E3D56" strokeWidth="3.5" />
                  <path d="M 400,150 Q 450,110 500,165" fill="none" stroke="#84A98C" strokeWidth="2.5" />

                  {/* Timeline Nodes */}
                  <circle cx="60" cy="150" r="14" fill="#6E3D56" />
                  <text x="60" y="175" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--text-main)">
                    McCulloch 1943
                  </text>

                  <circle cx="180" cy="150" r="13" fill="#6E3D56" />
                  <text x="180" y="175" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--text-main)">
                    Rosenblatt 1958
                  </text>

                  <circle cx="330" cy="150" r="18" fill="#6E3D56" />
                  <circle cx="400" cy="150" r="22" fill="#6E3D56" />

                  <circle cx="500" cy="110" r="19" fill="#6E3D56" />
                  <text x="500" y="138" textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--text-main)">
                    Zhou 2021
                  </text>

                  <circle cx="500" cy="165" r="15" fill="#84A98C" />
                  <text x="500" y="190" textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--text-main)">
                    Alpaydın 2021
                  </text>
                </svg>
              </div>

              <button
                onClick={() => navigate("/lineage")}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "var(--deep, var(--accent))",
                  color: "var(--panel-dark)",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Open in Full Research Lineage View
              </button>
            </div>
          )}

          {/* Tab 2: Compare Matrix (Matching Screenshot 2026-11-13 233641.png) */}
          {activeTab === "matrix" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--panel-dark)", borderRadius: "8px", overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "var(--panel)", borderBottom: "1.5px solid #D1D5DB" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: 800 }}>Feature</th>
                    {selectedPapers.slice(0, 3).map((p) => (
                      <th key={p.openalex_id} style={{ padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: 800 }}>
                        {p.authors[0] || "Author"} ({p.year})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Year", fn: (p: DiscoverPaper) => p.year ?? "—" },
                    { label: "Citations", fn: (p: DiscoverPaper) => p.citation_count !== undefined ? `${p.citation_count.toLocaleString()} Citations` : "—" },
                    { label: "Access Status", fn: (p: DiscoverPaper) => (p.oa_url ? "Open Access" : "Paywalled") },
                    {
                      label: "Focus/Method",
                      fn: (p: DiscoverPaper) =>
                        (p.abstract || "").includes("deep")
                          ? "Foundational ML theory & techniques, deep learning models"
                          : "Integrative machine learning with general workflows",
                    },
                    {
                      label: "Key Takeaway",
                      fn: (p: DiscoverPaper) =>
                        (p.abstract || "").includes("synergy")
                          ? "Highlights the synergy and distinct advantages of integrating deep learning"
                          : "Comprehensive reference for core ML concepts and modern methods",
                    },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #E5E7EB" }}>
                      <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: "12.5px", background: "var(--panel)", width: "140px" }}>
                        {row.label}
                      </td>
                      {selectedPapers.slice(0, 3).map((p) => (
                        <td key={p.openalex_id} style={{ padding: "12px 14px", fontSize: "12px", color: "var(--text-main)", lineHeight: 1.45 }}>
                          {row.fn(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: "auto", paddingTop: "16px" }}>
                <button
                  onClick={() => navigate("/compare")}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "var(--deep, var(--accent))",
                    color: "var(--panel-dark)",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open in Full Comparison Table
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Reader (Matching Screenshot 2026-11-13 233646.png) */}
          {activeTab === "reader" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", overflowY: "auto" }}>
              {activePaper ? (
                <>
                  <h2 style={{ margin: "0 0 6px 0", fontSize: "22px", fontWeight: 800, color: "var(--text-main)" }}>
                    {activePaper.title}
                  </h2>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                    {activePaper.authors.join(", ")}, {activePaper.year} • {activePaper.venue || "Academic Press"}
                  </div>

                  {/* DOI & Open Access Badges */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        background: "#FEF3C7",
                        color: "#92400E",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {activePaper.doi ? `DOI ${activePaper.doi}` : "No DOI"}
                    </span>
                    {activePaper.oa_url ? (
                      <span style={{ padding: "4px 10px", background: "#D1FAE5", color: "#065F46", borderRadius: "4px", fontSize: "12px", fontWeight: 700 }}>
                        🔓 Open Access PDF
                      </span>
                    ) : (
                      <span style={{ padding: "4px 10px", background: "var(--nav-active-bg)", color: "var(--text-muted)", borderRadius: "4px", fontSize: "12px", fontWeight: 700 }}>
                        🔒 No open copy found
                      </span>
                    )}
                  </div>

                  {/* Reader Subtabs */}
                  <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid #D1D5DB", marginBottom: "14px" }}>
                    {[
                      { id: "abstract", label: "Abstract" },
                      { id: "pdf", label: "PDF Preview" },
                      { id: "refs", label: "Key References" },
                    ].map((st) => (
                      <span
                        key={st.id}
                        onClick={() => setReaderSubTab(st.id as any)}
                        style={{
                          paddingBottom: "6px",
                          borderBottom: readerSubTab === st.id ? "2.5px solid #4A1E35" : "none",
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

                  {/* Sub-tab content */}
                  <div
                    style={{
                      flex: 1,
                      background: "var(--panel-dark)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "16px",
                      fontSize: "13.5px",
                      lineHeight: 1.6,
                      color: "var(--text-main)",
                      overflowY: "auto",
                      marginBottom: "16px",
                    }}
                  >
                    {readerSubTab === "abstract" && (
                      <><strong>Abstract:</strong> {activePaper.abstract || "No abstract available for this record."}</>
                    )}
                    {readerSubTab === "pdf" && (
                      activePaper.oa_url ? (
                        <div>
                          <p style={{ marginTop: 0 }}>An open-access copy is available from the publisher or repository.</p>
                          <a href={activePaper.oa_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 700 }}>
                            Open PDF in browser →
                          </a>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>No open-access PDF found. Try the Access Hub for publisher options.</span>
                      )
                    )}
                    {readerSubTab === "refs" && (
                      <div>
                        <p style={{ marginTop: 0 }}>See what this paper cites and who cites it.</p>
                        <button onClick={() => navigate("/citations")} style={{ ...ctl, height: "34px", cursor: "pointer", fontWeight: 700 }}>
                          Open Citation Tree
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Buttons */}
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={handleSaveToReview}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "var(--deep, var(--accent))",
                        color: "var(--panel-dark)",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Save to My Review
                    </button>
                    <button
                      onClick={() => handleCite(activePaper)}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "var(--panel)",
                        border: "1px solid #D1D5DB",
                        color: "var(--text-main)",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cite
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                  Select a paper from the list to preview
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
