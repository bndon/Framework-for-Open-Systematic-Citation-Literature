import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCollections, getPapers, getClaims, getCollectionPapers } from "../lib/api";
import { ForceGraphView, type GraphNode, type GraphLink } from "../components/ForceGraphView";
import { toast } from "../lib/toast";
import type { Collection, Paper, Claim } from "../types";

export const KnowledgeGraph: React.FC = () => {
  const navigate = useNavigate();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [collPaperMap, setCollPaperMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // Filters & State
  const [filterType, setFilterType] = useState<"all" | "collections" | "papers" | "claims">(() => {
    return (localStorage.getItem("foscl:kg_filter") as any) || "all";
  });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    localStorage.setItem("foscl:kg_filter", filterType);
  }, [filterType]);

  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = async () => {
    setLoading(true);
    try {
      const colls = await getCollections();
      setCollections(colls);

      const paperList = await getPapers();
      setPapers(paperList);

      // Fetch papers per collection
      const collMap: Record<string, string[]> = {};
      for (const c of colls) {
        try {
          const cPapers = await getCollectionPapers(c.id);
          collMap[c.id] = cPapers.map((p) => p.id);
        } catch {}
      }
      setCollPaperMap(collMap);

      // Fetch all claims across all collections
      let allClaims: Claim[] = [];
      for (const c of colls) {
        try {
          const cClaims = await getClaims(c.id);
          allClaims = [...allClaims, ...cClaims];
        } catch {}
      }
      setClaims(allClaims);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load Knowledge Graph data");
    } finally {
      setLoading(false);
    }
  };

  // Convert raw DB models into nodes & graph links (memoized to prevent re-creation on node clicks)
  const { graphNodes, graphLinks } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // 1. Collections as major cluster hubs
    if (filterType === "all" || filterType === "collections") {
      collections.forEach((c) => {
        nodes.push({
          id: `coll_${c.id}`,
          label: `📁 ${c.name}`,
          type: "collection",
          color: "#845177",
          radius: 22,
          data: { type: "collection", entity: c },
        });
      });
    }

    // 2. Papers as nodes
    if (filterType === "all" || filterType === "papers") {
      papers.forEach((p) => {
        nodes.push({
          id: `paper_${p.id}`,
          label: p.title,
          type: "paper",
          color: "#a98bb8",
          radius: 16,
          data: { type: "paper", entity: p },
        });
      });
    }

    // 3. Claims as hypotheses nodes
    if (filterType === "all" || filterType === "claims") {
      claims.forEach((c) => {
        nodes.push({
          id: `claim_${c.id}`,
          label: `🧬 "${c.text.slice(0, 35)}…"`,
          type: "claim",
          color: "#7f9a78",
          radius: 14,
          data: { type: "claim", entity: c },
        });

        // Link Claim to its Collection
        if (filterType === "all") {
          links.push({
            source: `claim_${c.id}`,
            target: `coll_${c.collection_id}`,
            dashed: true,
            color: "rgba(16, 185, 129, 0.4)",
          });
        }

        // Link Claim to its Evidence papers
        if (c.evidence && c.evidence.length > 0) {
          c.evidence.forEach((ev) => {
            const stanceColor =
              ev.stance === "supports"
                ? "#7f9a78"
                : ev.stance === "contradicts"
                ? "#c97a86"
                : "#d9a441";

            links.push({
              source: `claim_${c.id}`,
              target: `paper_${ev.paper_id}`,
              label: ev.stance,
              color: stanceColor,
            });
          });
        }
      });
    }

    // 4. Link Collections to Papers they contain
    if (filterType === "all") {
      Object.entries(collPaperMap).forEach(([collId, paperIds]) => {
        paperIds.forEach((pId) => {
          links.push({
            source: `coll_${collId}`,
            target: `paper_${pId}`,
            label: "contains",
            color: "rgba(168, 85, 247, 0.45)",
          });
        });
      });
    }

    return { graphNodes: nodes, graphLinks: links };
  }, [collections, papers, claims, collPaperMap, filterType]);

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header bar */}
      <div
        style={{
          padding: "16px 28px",
          backgroundColor: "var(--panel-dark)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", color: "var(--text-main)", margin: "0 0 2px 0", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕸️</span> Knowledge Graph
          </h1>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
            Interactive Obsidian-style force graph connecting Papers, Collections, and Evidence Lineage.
          </p>
        </div>

        {/* Filter controls & stats */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "6px", backgroundColor: "var(--panel-dark)", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border)" }}>
            {[
              { id: "all", label: "All Items" },
              { id: "papers", label: `Papers (${papers.length})` },
              { id: "claims", label: `Claims (${claims.length})` },
              { id: "collections", label: `Collections (${collections.length})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id as any)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor: filterType === f.id ? "var(--accent)" : "transparent",
                  color: filterType === f.id ? "var(--on-accent)" : "var(--text-main)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadGraphData}
            style={{
              padding: "6px 12px",
              backgroundColor: "var(--panel-dark)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 600,
              color: "var(--text-main)",
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Main Graph Canvas & Inspector Drawer */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-ink)" }}>
            Synthesizing Knowledge Network…
          </div>
        ) : graphNodes.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", padding: "40px" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🌌</div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--text-main)" }}>Graph is currently empty</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px" }}>
              Add papers in Discover or create claims in Research Lineage to build your knowledge galaxy!
            </p>
            <button
              onClick={() => navigate("/discover")}
              style={{ padding: "8px 18px", backgroundColor: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}
            >
              🔍 Discover Papers
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, height: "100%" }}>
              <ForceGraphView
                nodes={graphNodes}
                links={graphLinks}
                selectedNodeId={selectedNode?.id}
                onNodeClick={handleNodeClick}
                height="100%"
              />
            </div>

            {/* Selected Node Details Drawer */}
            {selectedNode && (
              <div
                style={{
                  width: "340px",
                  backgroundColor: "var(--panel-dark)",
                  borderLeft: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  padding: "20px",
                  overflowY: "auto",
                  boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
                  zIndex: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor:
                        selectedNode.type === "paper"
                          ? "#F1E8F4"
                          : selectedNode.type === "claim"
                          ? "#EAF0E6"
                          : "var(--panel-dark)",
                      color:
                        selectedNode.type === "paper"
                          ? "#6b3f5f"
                          : selectedNode.type === "claim"
                          ? "#4f6b49"
                          : "var(--accent-ink)",
                    }}
                  >
                    {selectedNode.type}
                  </span>
                  <button
                    onClick={() => setSelectedNode(null)}
                    style={{ border: "none", background: "none", fontSize: "18px", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    ×
                  </button>
                </div>

                <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "var(--text-main)", lineHeight: 1.35 }}>
                  {selectedNode.label}
                </h3>

                {selectedNode.data?.type === "paper" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                      {selectedNode.data.entity.year && <div><strong>Year:</strong> {selectedNode.data.entity.year}</div>}
                      {selectedNode.data.entity.venue && <div><strong>Venue:</strong> {selectedNode.data.entity.venue}</div>}
                    </div>

                    <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "18px", backgroundColor: "var(--panel-dark)", padding: "10px", borderRadius: "6px" }}>
                      {selectedNode.data.entity.abstract || "No abstract available for this work."}
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <Link
                        to={`/paper/${selectedNode.data.entity.id}`}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          backgroundColor: "var(--accent)",
                          color: "var(--on-accent)",
                          borderRadius: "6px",
                          textAlign: "center",
                          textDecoration: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        📄 Open Details
                      </Link>
                      {selectedNode.data.entity.pdf_path && (
                        <Link
                          to={`/reader/${selectedNode.data.entity.id}`}
                          style={{
                            padding: "8px 14px",
                            backgroundColor: "var(--panel-dark)",
                            border: "1px solid var(--border)",
                            color: "var(--text-main)",
                            borderRadius: "6px",
                            textAlign: "center",
                            textDecoration: "none",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          📖 Read
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {selectedNode.data?.type === "claim" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--text-main)", marginBottom: "14px" }}>
                      <strong>Evidence links:</strong> {selectedNode.data.entity.evidence?.length || 0}
                      <br />
                      <strong>Revisions:</strong> {selectedNode.data.entity.revisions?.length || 0}
                    </div>
                    <Link
                      to={`/lineage?collectionId=${selectedNode.data.entity.collection_id}`}
                      style={{
                        display: "block",
                        padding: "8px 12px",
                        backgroundColor: "var(--accent)",
                        color: "var(--on-accent)",
                        borderRadius: "6px",
                        textAlign: "center",
                        textDecoration: "none",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      🧬 View in Research Lineage
                    </Link>
                  </div>
                )}

                {selectedNode.data?.type === "collection" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--text-main)", marginBottom: "14px" }}>
                      Topic Collection grouping papers and synthesis claims.
                    </div>
                    <Link
                      to={`/library`}
                      style={{
                        display: "block",
                        padding: "8px 12px",
                        backgroundColor: "var(--accent)",
                        color: "var(--on-accent)",
                        borderRadius: "6px",
                        textAlign: "center",
                        textDecoration: "none",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      📚 Open in Library
                    </Link>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

