import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { fetchCitations, getPapers } from "../lib/api";
import { ForceGraphView, type GraphNode, type GraphLink } from "../components/ForceGraphView";
import { toast } from "../lib/toast";
import type { CitationGraph as CitationGraphType, CitationNode, Paper } from "../types";

export const CitationGraph: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const openalexId = searchParams.get("id") || "";
  const paperTitle = searchParams.get("title") || "Paper";

  const [graph, setGraph] = useState<CitationGraphType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<"graph" | "list">(() => {
    return (localStorage.getItem("foscl:citation_view_mode") as any) || "graph";
  });
  const [graphFilter, setGraphFilter] = useState<"all" | "references" | "cited_by">("all");
  const [activeTab, setActiveTab] = useState<"references" | "cited_by">("references");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    localStorage.setItem("foscl:citation_view_mode", viewMode);
  }, [viewMode]);

  // Empty state helper: library papers
  const [libraryPapers, setLibraryPapers] = useState<Paper[]>([]);
  const [customIdInput, setCustomIdInput] = useState("");

  useEffect(() => {
    if (openalexId) {
      loadGraph(openalexId);
    } else {
      loadLibraryFallback();
    }
  }, [openalexId]);

  const loadLibraryFallback = async () => {
    try {
      const papers = await getPapers();
      setLibraryPapers(papers.filter((p) => p.openalex_id || p.doi));
    } catch {
      // ignore
    }
  };

  const loadGraph = async (id: string) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const data = await fetchCitations(id);
      setGraph(data);
    } catch (err: any) {
      const msg = "Failed to load citation data: " + (err?.toString() || "");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customIdInput.trim();
    if (!trimmed) return;
    setSearchParams({ id: trimmed, title: trimmed });
  };

  const pivotToNode = (node: CitationNode) => {
    setSearchParams({ id: node.openalex_id, title: node.title });
  };

  // Build Graph Nodes and Links (memoized to avoid simulation resets on selection)
  const { graphNodes, graphLinks } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    if (graph) {
      // 1. Center node
      const centerId = graph.center.openalex_id || "center_root";
      nodes.push({
        id: centerId,
        label: graph.center.title,
        type: "center",
        color: "#d9a441",
        radius: 24,
        data: { ...graph.center, category: "Center Work" },
      });

      // 2. References (Papers cited by center)
      if (graphFilter === "all" || graphFilter === "references") {
        graph.references.forEach((ref, idx) => {
          const refId = ref.openalex_id || `ref_${idx}`;
          nodes.push({
            id: refId,
            label: ref.title,
            type: "reference",
            color: "#a98bb8",
            radius: 15,
            data: { ...ref, category: "Reference (Cited by this work)" },
          });

          links.push({
            source: refId,
            target: centerId,
            label: "cites",
            color: "rgba(169, 139, 184, 0.55)",
          });
        });
      }

      // 3. Cited By (Papers citing center)
      if (graphFilter === "all" || graphFilter === "cited_by") {
        graph.cited_by.forEach((cite, idx) => {
          const citeId = cite.openalex_id || `cite_${idx}`;
          nodes.push({
            id: citeId,
            label: cite.title,
            type: "cited_by",
            color: "#c97a86",
            radius: 15,
            data: { ...cite, category: "Citation (Cites this work)" },
          });

          links.push({
            source: centerId,
            target: citeId,
            label: "cited by",
            color: "rgba(201, 122, 134, 0.55)",
          });
        });
      }
    }

    return { graphNodes: nodes, graphLinks: links };
  }, [graph, graphFilter]);

  const activeList = graph ? (activeTab === "references" ? graph.references : graph.cited_by) : [];

  return (
    <div style={{ padding: "28px 36px", maxWidth: "1200px", margin: "0 auto", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <div>
          <button
            onClick={() => navigate(-1)}
            style={{
              border: "none",
              background: "none",
              color: "#8A5A7A",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "13px",
              padding: 0,
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: "24px", color: "#4A2418", margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🌳</span> Citation Tree & Network
          </h1>
          {openalexId ? (
            <p style={{ color: "#7A6458", fontSize: "14px", margin: 0, fontStyle: "italic", maxWidth: "700px" }}>
              Focus: "{paperTitle}"
            </p>
          ) : (
            <p style={{ color: "#7A6458", fontSize: "13px", margin: 0 }}>
              Explore connected references and downstream citations visually like Obsidian.
            </p>
          )}
        </div>

        {/* View Switcher */}
        {graph && (
          <div
            style={{
              display: "flex",
              backgroundColor: "#EFE6D8",
              padding: "3px",
              borderRadius: "8px",
              border: "1px solid #D5C8B8",
            }}
          >
            <button
              onClick={() => setViewMode("graph")}
              style={{
                border: "none",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                backgroundColor: viewMode === "graph" ? "#8A5A7A" : "transparent",
                color: viewMode === "graph" ? "#FAF5EC" : "#4A2418",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>🕸️</span> Graph Tree
            </button>
            <button
              onClick={() => setViewMode("list")}
              style={{
                border: "none",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                backgroundColor: viewMode === "list" ? "#8A5A7A" : "transparent",
                color: viewMode === "list" ? "#FAF5EC" : "#4A2418",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>📋</span> List View
            </button>
          </div>
        )}
      </div>

      {/* Empty State / ID Picker */}
      {!openalexId ? (
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: "30px" }}>
          <div
            style={{
              padding: "36px",
              backgroundColor: "#FAF7F2",
              borderRadius: "12px",
              border: "1px dashed #D5C8B8",
              marginBottom: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🌳</div>
            <h2 style={{ fontSize: "18px", color: "#4A2418", margin: "0 0 8px 0" }}>Choose a Paper to Explore Citations</h2>
            <p style={{ color: "#7A6458", fontSize: "14px", maxWidth: "560px", margin: "0 auto 20px" }}>
              Search citation trees, upstream literature references, and downstream papers that cite your target work.
            </p>

            <form onSubmit={handleManualSearch} style={{ display: "flex", gap: "8px", maxWidth: "500px", margin: "0 auto" }}>
              <input
                type="text"
                placeholder="Enter OpenAlex Work ID (e.g. W2741809807)..."
                value={customIdInput}
                onChange={(e) => setCustomIdInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  border: "1px solid #D5C8B8",
                  borderRadius: "6px",
                  fontSize: "13px",
                  backgroundColor: "#fff",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "10px 18px",
                  backgroundColor: "#8A5A7A",
                  color: "#FAF5EC",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Inspect Network
              </button>
            </form>
          </div>

          {libraryPapers.length > 0 && (
            <div>
              <h3 style={{ fontSize: "15px", color: "#4A2418", marginBottom: "12px" }}>
                Or select from your Library papers:
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                {libraryPapers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (p.openalex_id) {
                        setSearchParams({ id: p.openalex_id, title: p.title });
                      } else if (p.doi) {
                        setSearchParams({ id: `https://doi.org/${p.doi}`, title: p.title });
                      }
                    }}
                    style={{
                      padding: "16px",
                      backgroundColor: "#fff",
                      border: "1px solid #E8DFD3",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#8A5A7A")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E8DFD3")}
                  >
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#4A2418", lineHeight: 1.35, marginBottom: "6px" }}>
                      {p.title}
                    </div>
                    <div style={{ fontSize: "12px", color: "#7A6458" }}>
                      {p.year && <span>{p.year} • </span>}
                      {p.venue && <span>{p.venue} • </span>}
                      <span style={{ color: "#8A5A7A", fontWeight: 600 }}>Explore Citations →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : loading ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <div style={{ fontSize: "36px", animation: "spin 2s linear infinite", marginBottom: "12px" }}>🌀</div>
          <div style={{ color: "#8A5A7A", fontSize: "16px", fontWeight: 600 }}>Loading citation tree from OpenAlex...</div>
          <p style={{ color: "#7A6458", fontSize: "13px", marginTop: "6px" }}>Connecting references and citing nodes</p>
        </div>
      ) : error ? (
        <div
          style={{
            padding: "20px",
            backgroundColor: "#FDEDEC",
            color: "#C0392B",
            border: "1px solid #F5B7B1",
            borderRadius: "8px",
            margin: "20px 0",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>⚠️ Could not load citation data</div>
          <div style={{ fontSize: "13px", marginBottom: "12px" }}>{error}</div>
          <button
            onClick={() => loadGraph(openalexId)}
            style={{
              padding: "6px 14px",
              backgroundColor: "#C0392B",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      ) : graph ? (
        <>
          {/* Quick Stat Highlights */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div
              style={{
                flex: 1,
                padding: "12px 16px",
                backgroundColor: "#FAF7F2",
                border: "1px solid #E4DACB",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#7a5a8e", textTransform: "uppercase" }}>
                  References (Upstream)
                </div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#4A2418" }}>{graph.references.length}</div>
              </div>
              <span style={{ fontSize: "24px" }}>📚</span>
            </div>

            <div
              style={{
                flex: 1,
                padding: "12px 16px",
                backgroundColor: "#FAF7F2",
                border: "1px solid #E4DACB",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#a8546a", textTransform: "uppercase" }}>
                  Citations (Downstream)
                </div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#4A2418" }}>{graph.cited_by.length}</div>
              </div>
              <span style={{ fontSize: "24px" }}>🌟</span>
            </div>

            <div
              style={{
                flex: 1,
                padding: "12px 16px",
                backgroundColor: "#FAF7F2",
                border: "1px solid #E4DACB",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#8A5A7A", textTransform: "uppercase" }}>
                  Total Nodes in Graph
                </div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#4A2418" }}>
                  {1 + graph.references.length + graph.cited_by.length}
                </div>
              </div>
              <span style={{ fontSize: "24px" }}>🕸️</span>
            </div>
          </div>

          {/* GRAPH MODE */}
          {viewMode === "graph" ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "620px", position: "relative" }}>
              {/* Graph Toolbar Controls */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  backgroundColor: "#FAF7F2",
                  border: "1px solid #E4DACB",
                  borderRadius: "8px 8px 0 0",
                  borderBottom: "none",
                }}
              >
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#7A6458", textTransform: "uppercase", marginRight: "4px" }}>
                    Filter:
                  </span>
                  {[
                    { key: "all", label: `All (${graphNodes.length})` },
                    { key: "references", label: `References only (${graph.references.length})` },
                    { key: "cited_by", label: `Cited By only (${graph.cited_by.length})` },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setGraphFilter(f.key as any)}
                      style={{
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "1px solid",
                        cursor: "pointer",
                        backgroundColor: graphFilter === f.key ? "#8A5A7A" : "#fff",
                        borderColor: graphFilter === f.key ? "#8A5A7A" : "#D5C8B8",
                        color: graphFilter === f.key ? "#FAF5EC" : "#4A2418",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Graph Legend */}
                <div style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "11px", color: "#7A6458" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#8A5A7A" }} />
                    <span style={{ fontWeight: 600 }}>Center Work</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#7a5a8e" }} />
                    <span>References (Cites)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#a8546a" }} />
                    <span>Cited By (Citations)</span>
                  </div>
                </div>
              </div>

              {/* Force Canvas Container */}
              <div
                style={{
                  flex: 1,
                  minHeight: "560px",
                  border: "1px solid #E4DACB",
                  borderRadius: "0 0 8px 8px",
                  overflow: "hidden",
                  position: "relative",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                <ForceGraphView
                  nodes={graphNodes}
                  links={graphLinks}
                  selectedNodeId={selectedNode?.id}
                  height={560}
                  onNodeClick={(node) => setSelectedNode(node)}
                />

                {/* Selected Node Popover Inspector */}
                {selectedNode && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "20px",
                      right: "20px",
                      width: "360px",
                      backgroundColor: "#FAF7F2",
                      border: "1px solid #8A5A7A",
                      borderRadius: "10px",
                      padding: "18px",
                      boxShadow: "0 8px 24px rgba(74, 36, 24, 0.15)",
                      zIndex: 30,
                      animation: "fadeIn 0.2s ease-out",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor:
                            selectedNode.type === "center"
                              ? "#8A5A7A"
                              : selectedNode.type === "reference"
                              ? "#7a5a8e"
                              : "#a8546a",
                          color: "#fff",
                        }}
                      >
                        {selectedNode.data?.category || selectedNode.type}
                      </span>
                      <button
                        onClick={() => setSelectedNode(null)}
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          color: "#7A6458",
                          fontSize: "16px",
                          lineHeight: 1,
                          padding: "0 4px",
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#4A2418", margin: "0 0 8px 0", lineHeight: 1.35 }}>
                      {selectedNode.data?.title || selectedNode.label}
                    </h3>

                    <div style={{ fontSize: "12px", color: "#7A6458", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {selectedNode.data?.year && <div><strong>Year:</strong> {selectedNode.data.year}</div>}
                      {selectedNode.data?.doi && (
                        <div>
                          <strong>DOI:</strong>{" "}
                          <a
                            href={`https://doi.org/${selectedNode.data.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#8A5A7A", textDecoration: "none" }}
                          >
                            {selectedNode.data.doi} ↗
                          </a>
                        </div>
                      )}
                      {selectedNode.data?.openalex_id && (
                        <div><strong>ID:</strong> {selectedNode.data.openalex_id}</div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      {selectedNode.type !== "center" && selectedNode.data?.openalex_id && (
                        <button
                          onClick={() => pivotToNode(selectedNode.data)}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            backgroundColor: "#8A5A7A",
                            color: "#FAF5EC",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          <span>🚀</span> Pivot Tree Here
                        </button>
                      )}
                      {selectedNode.data?.doi && (
                        <a
                          href={`https://doi.org/${selectedNode.data.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "8px 12px",
                            backgroundColor: "#fff",
                            color: "#4A2418",
                            border: "1px solid #D5C8B8",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          View Paper ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* LIST VIEW MODE */
            <div>
              {/* Tab selector */}
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <button
                  onClick={() => setActiveTab("references")}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    backgroundColor: activeTab === "references" ? "#8A5A7A" : "#FAF7F2",
                    color: activeTab === "references" ? "#FAF5EC" : "#4A2418",
                    border: `1px solid ${activeTab === "references" ? "#8A5A7A" : "#E4DACB"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  References ({graph.references.length})
                </button>
                <button
                  onClick={() => setActiveTab("cited_by")}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    backgroundColor: activeTab === "cited_by" ? "#8A5A7A" : "#FAF7F2",
                    color: activeTab === "cited_by" ? "#FAF5EC" : "#4A2418",
                    border: `1px solid ${activeTab === "cited_by" ? "#8A5A7A" : "#E4DACB"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Cited By ({graph.cited_by.length})
                </button>
              </div>

              {activeList.length === 0 ? (
                <div
                  style={{
                    padding: "36px",
                    textAlign: "center",
                    color: "#8A796F",
                    backgroundColor: "#FAF7F2",
                    borderRadius: "8px",
                    border: "1px dashed #D5C8B8",
                  }}
                >
                  No {activeTab === "references" ? "references" : "citations"} found for this work in OpenAlex.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {activeList.map((node, idx) => (
                    <div
                      key={node.openalex_id || idx}
                      style={{
                        padding: "16px 20px",
                        backgroundColor: "#fff",
                        border: "1px solid #E8DFD3",
                        borderRadius: "8px",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, paddingRight: "16px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#4A2418", lineHeight: 1.35, marginBottom: "6px" }}>
                          {node.title}
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                          {node.year && <span style={{ fontSize: "12px", color: "#7A6458" }}>Year: {node.year}</span>}
                          {node.doi && (
                            <a
                              href={`https://doi.org/${node.doi}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "11px",
                                backgroundColor: "#F0EAE1",
                                color: "#6E4363",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                textDecoration: "none",
                                fontWeight: 500,
                              }}
                            >
                              DOI: {node.doi} ↗
                            </a>
                          )}
                        </div>
                      </div>

                      {node.openalex_id && (
                        <button
                          onClick={() => pivotToNode(node)}
                          style={{
                            padding: "8px 14px",
                            backgroundColor: "#FAF5EC",
                            border: "1px solid #8A5A7A",
                            color: "#8A5A7A",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#8A5A7A";
                            e.currentTarget.style.color = "#FAF5EC";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#FAF5EC";
                            e.currentTarget.style.color = "#8A5A7A";
                          }}
                        >
                          🌳 Explore Tree →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
