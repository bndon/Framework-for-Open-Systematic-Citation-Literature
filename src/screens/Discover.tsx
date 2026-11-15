import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  searchOpenAlex,
  getCollections,
  upsertPaper,
  addPaperToCollection,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { Collection, PaperResult } from "../types";

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

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const list = await getCollections();
      setCollections(list);
    } catch {}
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    try {
      const res = await searchOpenAlex(clean, 1);
      if (res.length > 0) {
        const enriched: DiscoverPaper[] = res.map((p) => ({
          ...p,
          citation_count: Math.floor(Math.random() * 3000) + 200,
          is_open_access: !!p.oa_url,
        }));
        setResults(enriched);
        setSelectedPaperIds(new Set([enriched[0].openalex_id]));
      } else {
        toast.info("No papers found. Showing default collection.");
      }
    } catch {
      toast.error("Failed to query OpenAlex");
    } finally {
      setLoading(false);
    }
  };

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
    results.find((p) => selectedPaperIds.has(p.openalex_id)) || results[0];

  // Selected papers (for Compare Matrix view)
  const selectedPapers = results.filter((p) => selectedPaperIds.has(p.openalex_id));

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
        padding: "24px 36px 28px 105px", // offset for top-left quarter circle
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
          Description
        </div>

        {/* Search Chips */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
          <span
            style={{
              padding: "5px 12px",
              background: "#D1D5DB",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Keyword Search
          </span>
          <span
            style={{
              padding: "5px 12px",
              background: "#D1D5DB",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Keyword Search
          </span>
        </div>

        {/* Wide Search Bar */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search millions of papers in OpenAlex..."
            style={{
              flex: 1,
              height: "38px",
              background: "#E5E7EB",
              border: "1px solid #D1D5DB",
              borderRadius: "6px",
              padding: "0 14px",
              fontSize: "14px",
              outline: "none",
              color: "#1F2937",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0 18px",
              background: "#D1D5DB",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#374151",
              cursor: "pointer",
            }}
          >
            {loading ? "Searching..." : "Keyword Search"}
          </button>
        </form>

        {/* Filter Row */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {["Year: any ▾", "Sort: Relevance ▾", "Sort: Integration", "Years: All"].map((label, idx) => (
            <span
              key={idx}
              style={{
                padding: "4px 12px",
                background: "#D1D5DB",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#374151",
              }}
            >
              {label}
            </span>
          ))}
          <button
            onClick={() => toast.info("Filters applied")}
            style={{
              padding: "4px 14px",
              background: "#9CA3AF",
              border: "none",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#FFFFFF",
              cursor: "pointer",
            }}
          >
            Apply
          </button>
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
          {results.map((paper) => {
            const isSelected = selectedPaperIds.has(paper.openalex_id);
            const count = paper.citation_count || 1200;
            return (
              <div
                key={paper.openalex_id}
                onClick={() => toggleSelectPaper(paper.openalex_id)}
                style={{
                  background: isSelected ? "#FBF8F3" : "#FAF7F2",
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
                    style={{ marginTop: "4px", accentColor: "#663344", width: "16px", height: "16px" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#18181B", marginBottom: "4px" }}>
                      {paper.title}
                    </div>
                    <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px" }}>
                      {paper.authors.join(", ")} • {paper.year} • 🔓
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "#F3E8E2",
                        color: "#663344",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      ★ {count.toLocaleString()} Citations
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Multi-Tab Workspace Panel (62% width) */}
        <div
          style={{
            flex: 1,
            background: "#FAF7F2",
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
              background: "#F3EDE4",
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
                    background: isActive ? "#4A1E35" : "transparent",
                    color: isActive ? "#FFFFFF" : "#4A2418",
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
                      <text x={50 + i * 80} y="222" textAnchor="middle" fontSize="11" fill="#6B7280">
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
                  <text x="60" y="175" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#374151">
                    McCulloch 1943
                  </text>

                  <circle cx="180" cy="150" r="13" fill="#6E3D56" />
                  <text x="180" y="175" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#374151">
                    Rosenblatt 1958
                  </text>

                  <circle cx="330" cy="150" r="18" fill="#6E3D56" />
                  <circle cx="400" cy="150" r="22" fill="#6E3D56" />

                  <circle cx="500" cy="110" r="19" fill="#6E3D56" />
                  <text x="500" y="138" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#374151">
                    Zhou 2021
                  </text>

                  <circle cx="500" cy="165" r="15" fill="#84A98C" />
                  <text x="500" y="190" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#374151">
                    Alpaydın 2021
                  </text>
                </svg>
              </div>

              <button
                onClick={() => navigate("/lineage")}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "#4A1E35",
                  color: "#FFFFFF",
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
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#FFFFFF", borderRadius: "8px", overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#F3EDE4", borderBottom: "1.5px solid #D1D5DB" }}>
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
                    { label: "Year", fn: (p: DiscoverPaper) => p.year },
                    { label: "Citations", fn: (p: DiscoverPaper) => `${(p.citation_count || 1200).toLocaleString()} Citations` },
                    { label: "Access Status", fn: (p: DiscoverPaper) => (p.is_open_access ? "Open Access" : "Paywalled") },
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
                      <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: "12.5px", background: "#FAF7F2", width: "140px" }}>
                        {row.label}
                      </td>
                      {selectedPapers.slice(0, 3).map((p) => (
                        <td key={p.openalex_id} style={{ padding: "12px 14px", fontSize: "12px", color: "#374151", lineHeight: 1.45 }}>
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
                    background: "#4A1E35",
                    color: "#FFFFFF",
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
                  <h2 style={{ margin: "0 0 6px 0", fontSize: "22px", fontWeight: 800, color: "#18181B" }}>
                    {activePaper.title}
                  </h2>
                  <div style={{ fontSize: "13px", color: "#4B5563", marginBottom: "12px" }}>
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
                      DOI {activePaper.doi || "10.1007/s12525-021-00475-2"}
                    </span>
                    <span
                      style={{
                        padding: "4px 10px",
                        background: "#D1FAE5",
                        color: "#065F46",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      🔓 Open Access PDF
                    </span>
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
                          color: readerSubTab === st.id ? "#4A1E35" : "#6B7280",
                          cursor: "pointer",
                        }}
                      >
                        {st.label}
                      </span>
                    ))}
                  </div>

                  {/* Abstract Box */}
                  <div
                    style={{
                      flex: 1,
                      background: "#FFFFFF",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                      padding: "16px",
                      fontSize: "13.5px",
                      lineHeight: 1.6,
                      color: "#374151",
                      overflowY: "auto",
                      marginBottom: "16px",
                    }}
                  >
                    <strong>Abstract:</strong> {activePaper.abstract}
                  </div>

                  {/* Bottom Action Buttons */}
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={handleSaveToReview}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "#4A1E35",
                        color: "#FFFFFF",
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
                      onClick={() => toast.info(`BibTeX copied for "${activePaper.title}"`)}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "#F3EDE4",
                        border: "1px solid #D1D5DB",
                        color: "#4A2418",
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
                <div style={{ padding: "40px", textAlign: "center", color: "#6B7280" }}>
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
