import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCollections, getPapers } from "../lib/api";
import type { Collection, Paper } from "../types";

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [colls, paperList] = await Promise.all([getCollections(), getPapers()]);
      setCollections(colls);
      setPapers(paperList);
    } catch {}
  };

  const getCardStyle = (id: string, custom?: React.CSSProperties): React.CSSProperties => {
    const isHovered = hoveredCard === id;
    return {
      background: "var(--panel)",
      border: `1px solid ${isHovered ? "var(--accent)" : "var(--border)"}`,
      borderRadius: "20px",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      boxShadow: isHovered
        ? "0 16px 36px -10px rgba(0, 0, 0, 0.22), 0 0 0 1px var(--accent)"
        : "0 4px 16px -4px rgba(0, 0, 0, 0.08)",
      transform: isHovered ? "translateY(-3px)" : "translateY(0)",
      transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      boxSizing: "border-box",
      ...custom,
    };
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
        padding: "24px 32px 28px 88px", // offset for the sleek top-left quarter circle
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* ── TOP HEADER / WORKSPACE OVERVIEW BAR ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "18px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "var(--accent)",
              color: "var(--panel-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: "18px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            }}
          >
            F
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "18px", color: "var(--text-main)", letterSpacing: "-0.3px", lineHeight: 1.15 }}>
              FOSCL Research Workspace
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
              {papers.length} Papers indexed • {collections.length} Curated Collections • Ready for synthesis
            </div>
          </div>
        </div>

        {/* Global Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            onClick={() => navigate("/discover")}
            style={{
              padding: "7px 16px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--text-main)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <span>🔍</span>
            <span>Quick Search (OpenAlex)</span>
            <kbd style={{ fontSize: "10px", padding: "1px 5px", background: "var(--panel-dark)", borderRadius: "4px", border: "1px solid var(--border)" }}>
              Ctrl+K
            </kbd>
          </div>

          <button
            onClick={() => navigate("/settings")}
            title="Theme Settings"
            style={{
              padding: "7px 14px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--text-main)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>🎨</span>
            <span>Themes</span>
          </button>
        </div>
      </div>

      {/* ── BENTO GRID CANVASES ── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.1fr",
          gridTemplateRows: "1.2fr 1fr 1fr",
          gap: "16px",
          minHeight: 0,
        }}
      >
        {/* CARD 1: DISCOVER PAPERS (Spans 2 columns on top left) */}
        <div
          onClick={() => navigate("/discover")}
          onMouseEnter={() => setHoveredCard("discover")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            ...getCardStyle("discover"),
            gridColumn: "1 / span 2",
            gridRow: 1,
            background: "linear-gradient(135deg, var(--panel) 0%, var(--panel-dark) 100%)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Literature Mining
              </span>
              <span style={{ fontSize: "18px" }}>🔍</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "20px", color: "var(--text-main)", marginBottom: "4px" }}>
              Discover Papers
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Query 250M+ cross-domain works on OpenAlex with automatic citation metrics and open access resolution.
            </div>
          </div>

          {/* Mini Search Pill Mockup */}
          <div
            style={{
              marginTop: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Search: "Deep Learning Foundations"</span>
            <span style={{ marginLeft: "auto", fontSize: "11px", padding: "2px 8px", background: "var(--accent)", color: "var(--panel-dark)", borderRadius: "6px", fontWeight: 700 }}>
              Search →
            </span>
          </div>
        </div>

        {/* CARD 2: COMPARISON TABLE (Center Top) */}
        <div
          onClick={() => navigate("/compare")}
          onMouseEnter={() => setHoveredCard("compare")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("compare"), gridColumn: 3, gridRow: 1 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Matrix Synthesis
              </span>
              <span style={{ fontSize: "18px" }}>📊</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "var(--text-main)", marginBottom: "4px" }}>
              Comparison Table
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Cross-paper feature extraction matrix comparing methodology, variables, and empirical claims.
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
            <span style={{ fontSize: "10.5px", padding: "3px 8px", background: "var(--nav-active-bg)", borderRadius: "6px", color: "var(--text-muted)" }}>
              Methods
            </span>
            <span style={{ fontSize: "10.5px", padding: "3px 8px", background: "var(--nav-active-bg)", borderRadius: "6px", color: "var(--text-muted)" }}>
              Variables
            </span>
            <span style={{ fontSize: "10.5px", padding: "3px 8px", background: "var(--nav-active-bg)", borderRadius: "6px", color: "var(--text-muted)" }}>
              Claims
            </span>
          </div>
        </div>

        {/* CARD 3: RESEARCH LINEAGE (Column 4 Top) */}
        <div
          onClick={() => navigate("/lineage")}
          onMouseEnter={() => setHoveredCard("lineage")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("lineage"), gridColumn: 4, gridRow: 1 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Evidence Chains
              </span>
              <span style={{ fontSize: "18px" }}>🧬</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "var(--text-main)", marginBottom: "4px" }}>
              Research Lineage
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Track core claims with structured stance links and immutable revision histories.
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
            <span style={{ fontSize: "10px", padding: "3px 8px", background: "#D1FAE5", color: "#065F46", borderRadius: "6px", fontWeight: 700 }}>
              SUPPORTS
            </span>
            <span style={{ fontSize: "10px", padding: "3px 8px", background: "#FEE2E2", color: "#991B1B", borderRadius: "6px", fontWeight: 700 }}>
              CONTRADICTS
            </span>
          </div>
        </div>

        {/* CARD 4: TEMPLATES (Tall card spanning Row 1 & 2 on Far Right) */}
        <div
          onClick={() => navigate("/templates")}
          onMouseEnter={() => setHoveredCard("templates")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("templates"), gridColumn: 5, gridRow: "1 / span 2" }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Extraction Schemas
              </span>
              <span style={{ fontSize: "18px" }}>📋</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "18px", color: "var(--text-main)", marginBottom: "6px" }}>
              Templates
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.4, marginBottom: "14px" }}>
              Define customized structured fields extracted from literature reviews.
            </div>

            {/* Template Fields Mini Preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {["#1 Research Question", "#2 Methodology", "#3 Primary Datasets", "#4 Main Findings", "#5 Limitations"].map((f, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 10px",
                    background: "var(--panel-dark)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "11.5px",
                    color: "var(--text-main)",
                    fontWeight: 500,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{f}</span>
                  <span style={{ opacity: 0.5 }}>⋮⋮</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px", textAlign: "right" }}>
            Reorder & edit schemas →
          </div>
        </div>

        {/* CARD 5: LIBRARY ARCHIVE (Tall Card spanning Row 2 & 3 on Column 1) */}
        <div
          onClick={() => navigate("/library")}
          onMouseEnter={() => setHoveredCard("library")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("library"), gridColumn: 1, gridRow: "2 / span 2" }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Topic Collections
              </span>
              <span style={{ fontSize: "18px" }}>📚</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "19px", color: "var(--text-main)", marginBottom: "4px" }}>
              Library
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.4, marginBottom: "14px" }}>
              Your indexed paper library with local offline caching and note highlights.
            </div>

            {/* Mini Collections List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(collections.length > 0 ? collections.slice(0, 3) : [
                { id: "1", name: "My Review" },
                { id: "2", name: "Deep Learning Foundations" },
              ]).map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "8px 12px",
                    background: "var(--panel-dark)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-main)" }}>📁 {c.name}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Active</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: "10px",
              background: "var(--nav-active-bg)",
              borderRadius: "8px",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--text-main)",
            }}
          >
            Open Full Library View →
          </div>
        </div>

        {/* CARD 6: KNOWLEDGE GRAPH (Column 2 Row 2) */}
        <div
          onClick={() => navigate("/graph")}
          onMouseEnter={() => setHoveredCard("graph")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("graph"), gridColumn: 2, gridRow: 2 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Interactive Force Web
              </span>
              <span style={{ fontSize: "18px" }}>🕸️</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "var(--text-main)", marginBottom: "4px" }}>
              Knowledge Graph
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Obsidian-style force network with rounded squircle entity nodes.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#22c55e" }} />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Collections</span>
            <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#38bdf8" }} />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Papers</span>
            <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#06b6d4" }} />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Claims</span>
          </div>
        </div>

        {/* CARD 7: CITATION TREE & NETWORK (Column 3 Row 2) */}
        <div
          onClick={() => navigate("/citations")}
          onMouseEnter={() => setHoveredCard("citations")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("citations"), gridColumn: 3, gridRow: 2 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Citation Lineage
              </span>
              <span style={{ fontSize: "18px" }}>🌳</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "var(--text-main)", marginBottom: "4px" }}>
              Citation Tree
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Upstream foundational literature references & downstream citations.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", background: "var(--panel-dark)", padding: "8px 12px", borderRadius: "8px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700 }}>UPSTREAM</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--accent)" }}>References</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700 }}>DOWNSTREAM</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--signal)" }}>Citations</div>
            </div>
          </div>
        </div>

        {/* CARD 8: BOOKS (ROYAL SAPPHIRE ACCENT CARD - Spans Row 2 & 3 in Col 4) */}
        <div
          onClick={() => navigate("/epub")}
          onMouseEnter={() => setHoveredCard("books")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            ...getCardStyle("books"),
            gridColumn: 4,
            gridRow: "2 / span 2",
            background: "linear-gradient(160deg, #1E1B4B 0%, #172554 50%, #0F172A 100%)",
            border: "1px solid #3B82F6",
            color: "#FFFFFF",
            padding: "20px 20px 0",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#60A5FA", textTransform: "uppercase", letterSpacing: "1px" }}>
                EPUB Archive
              </span>
              <span style={{ fontSize: "18px" }}>📖</span>
            </div>
            <div style={{ fontWeight: 900, fontSize: "20px", color: "#FFFFFF", marginBottom: "4px" }}>
              Books & Reader
            </div>
            <div style={{ fontSize: "12px", color: "#93C5FD", lineHeight: 1.4 }}>
              Classic local EPUB book archive with offline reading progress.
            </div>
          </div>

          {/* Minimalist Graphic Book Spines with Refined Typography */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: "8px",
              height: "140px",
              marginTop: "10px",
            }}
          >
            {/* Book Spine 1: Deep Cobalt */}
            <div
              style={{
                width: "24px",
                height: "82%",
                background: "#2563EB",
                borderRadius: "4px 4px 0 0",
                border: "1px solid rgba(255,255,255,0.2)",
                writingMode: "vertical-rl",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "8.5px",
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "1px",
              }}
            >
              DOT LINE
            </div>

            {/* Book Spine 2: Bright Off-White */}
            <div
              style={{
                width: "28px",
                height: "94%",
                background: "#F8FAFC",
                borderRadius: "4px 4px 0 0",
                writingMode: "vertical-rl",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
                fontWeight: 800,
                color: "#1E1B4B",
                letterSpacing: "0.5px",
              }}
            >
              GRAPHIC FEST
            </div>

            {/* Book Spine 3: Cyan Accent */}
            <div
              style={{
                width: "30px",
                height: "100%",
                background: "#0284C7",
                borderRadius: "4px 4px 0 0",
                writingMode: "vertical-rl",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
                fontWeight: 800,
                color: "#FFFFFF",
              }}
            >
              GRAPHITE ②
            </div>

            {/* Book Spine 4: Amber Foil */}
            <div
              style={{
                width: "26px",
                height: "88%",
                background: "#F59E0B",
                borderRadius: "4px 4px 0 0",
                writingMode: "vertical-rl",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "8.5px",
                fontWeight: 800,
                color: "#1E1B4B",
              }}
            >
              FOLK ART 5
            </div>
          </div>
        </div>

        {/* CARD 9: ACCESS HUB (Column 2 Row 3) */}
        <div
          onClick={() => navigate("/access-hub")}
          onMouseEnter={() => setHoveredCard("hub")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("hub"), gridColumn: 2, gridRow: 3 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                DOI & Publishers
              </span>
              <span style={{ fontSize: "16px" }}>🔑</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-main)" }}>
              Publisher Access Hub
            </div>
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Direct DOI lookup & institutional access links.
          </div>
        </div>

        {/* CARD 10: MANUSCRIPT ANALYZER (Column 3 Row 3) */}
        <div
          onClick={() => navigate("/converter")}
          onMouseEnter={() => setHoveredCard("converter")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("converter"), gridColumn: 3, gridRow: 3 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                Guidelines (.docx)
              </span>
              <span style={{ fontSize: "16px" }}>📄</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-main)" }}>
              Conference Analyzer
            </div>
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            IEEE, ACM, and Springer LNCS parser.
          </div>
        </div>

        {/* CARD 11: EXPORT & SYNTHESIS (Column 5 Row 3) */}
        <div
          onClick={() => navigate("/export")}
          onMouseEnter={() => setHoveredCard("export")}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ ...getCardStyle("export"), gridColumn: 5, gridRow: 3 }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                Formatted Output
              </span>
              <span style={{ fontSize: "16px" }}>📤</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-main)" }}>
              Export Synthesis
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <span style={{ fontSize: "11px", padding: "2px 7px", background: "var(--nav-active-bg)", borderRadius: "4px", color: "var(--text-main)", fontWeight: 600 }}>
              DOCX
            </span>
            <span style={{ fontSize: "11px", padding: "2px 7px", background: "var(--nav-active-bg)", borderRadius: "4px", color: "var(--text-main)", fontWeight: 600 }}>
              PDF
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
