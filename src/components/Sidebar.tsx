import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "../lib/settings";
import { getCollections, getCollectionPapers } from "../lib/api";
import type { Collection } from "../types";

export const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadSidebarCollapsed());
  const [collections, setCollections] = useState<(Collection & { paperCount?: number })[]>([]);
  const location = useLocation();

  useEffect(() => {
    saveSidebarCollapsed(collapsed);
  }, [collapsed]);

  // Load collections with paper counts for the tree view
  useEffect(() => {
    loadCollectionsData();
  }, [location.pathname]);

  const loadCollectionsData = async () => {
    try {
      const colls = await getCollections();
      const withCounts = await Promise.all(
        colls.map(async (c) => {
          try {
            const papers = await getCollectionPapers(c.id);
            return { ...c, paperCount: papers.length };
          } catch {
            return { ...c, paperCount: 0 };
          }
        })
      );
      setCollections(withCounts);
    } catch {
      // ignore
    }
  };

  // Keyboard shortcut Ctrl+\ or Cmd+\ to toggle sidebar like Obsidian / VS Code
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const primaryItems = [
    { to: "/", label: "Discover", icon: "🔍", tooltip: "Discover Papers (OpenAlex)" },
    { to: "/library", label: "Library", icon: "📚", tooltip: "Library & Collections" },
    { to: "/graph", label: "Knowledge Graph", icon: "🕸️", tooltip: "Obsidian Knowledge Graph" },
    { to: "/citations", label: "Citation Tree", icon: "🌳", tooltip: "Citation Network Tree" },
    { to: "/compare", label: "Comparison Table", icon: "📊", tooltip: "Paper Comparison Matrix" },
    { to: "/lineage", label: "Research Lineage", icon: "🧬", tooltip: "Claims & Evidence Lineage" },
    { to: "/templates", label: "Templates", icon: "📋", tooltip: "Extraction Templates" },
    { to: "/export", label: "Export", icon: "📤", tooltip: "Export Word / PDF" },
  ];

  const secondaryItems = [
    { to: "/epub", label: "EPUB Reader", icon: "📖", tooltip: "EPUB Classic Reader" },
  ];

  const simulatedItems = [
    { to: "/access-hub", label: "Access Hub", icon: "🏪", tag: "Sim", tooltip: "DOI & Publisher Hub" },
    { to: "/converter", label: "Conference Converter", icon: "📄", tag: "Sim", tooltip: "Format Parser (.docx)" },
    { to: "/pricing", label: "Subscription Tiers", icon: "💳", tag: "Concept", tooltip: "Pricing Plans" },
  ];

  return (
    <aside
      style={{
        width: collapsed ? "60px" : "250px",
        minWidth: collapsed ? "60px" : "250px",
        height: "100vh",
        backgroundColor: "var(--panel-dark)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        position: "relative",
        zIndex: 50,
      }}
    >
      {/* Top Header / Brand & Collapse Toggle */}
      <div
        style={{
          padding: collapsed ? "14px 10px" : "14px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--border)",
          minHeight: "56px",
          boxSizing: "border-box",
        }}
      >
        {!collapsed ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
            <img src="/logo.png" alt="" width={30} height={30} style={{ minWidth: "30px", imageRendering: "pixelated" }} />
            <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "16px",
                  fontWeight: 800,
                  letterSpacing: "1px",
                  color: "var(--text-main)",
                  lineHeight: 1.1,
                }}
              >
                FOSCL
              </div>
              <div
                style={{
                  fontSize: "9px",
                  color: "var(--accent-ink)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Research Workspace
              </div>
            </div>
          </div>
        ) : null}

        {/* Toggle Button (Obsidian-Style [◨] Icon) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar (Ctrl+\\)" : "Collapse sidebar (Ctrl+\\)"}
          style={{
            width: "32px",
            height: "32px",
            minWidth: "32px",
            borderRadius: "6px",
            backgroundColor: "transparent",
            border: "1px solid transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--panel)";
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-main)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {/* Obsidian Sidebar Icon SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            {collapsed ? (
              <polyline points="14 10 16 12 14 14" />
            ) : (
              <polyline points="6 10 4 12 6 14" />
            )}
          </svg>
        </button>
      </div>

      {/* Navigation Links Area */}
      <nav
        style={{
          flex: 1,
          padding: collapsed ? "12px 6px" : "12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {!collapsed && (
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text-muted)",
              padding: "4px 8px 2px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Workspace
          </div>
        )}

        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : "10px",
              padding: collapsed ? "9px 0" : "8px 12px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--panel-dark)" : "var(--text-main)",
              transition: "all 0.15s ease",
              position: "relative",
            })}
          >
            <span style={{ fontSize: "16px", minWidth: "20px", textAlign: "center" }}>{item.icon}</span>
            {!collapsed && (
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.label}
              </span>
            )}
          </NavLink>
        ))}

        {/* Collections Tree / Folder Preview (Obsidian style like in the image) */}
        {!collapsed && collections.length > 0 && (
          <>
            <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "10px 4px" }} />
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--text-muted)",
                padding: "2px 8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Collections</span>
              <span style={{ fontSize: "10px", color: "var(--accent-ink)" }}>{collections.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "150px", overflowY: "auto" }}>
              {collections.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/library?collection=${c.id}`}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: "4px",
                    textDecoration: "none",
                    fontSize: "12px",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                    backgroundColor: isActive ? "var(--nav-active-bg)" : "transparent",
                    transition: "all 0.1s ease",
                  })}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span>📁</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      padding: "1px 5px",
                      borderRadius: "8px",
                      backgroundColor: "var(--panel)",
                    }}
                  >
                    {c.paperCount ?? 0}
                  </span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "8px 4px" }} />

        {/* Books / EPUB */}
        {!collapsed && (
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text-muted)",
              padding: "4px 8px 2px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Books
          </div>
        )}
        {secondaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : "10px",
              padding: collapsed ? "8px 0" : "7px 12px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "12.5px",
              fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--panel-dark)" : "var(--text-main)",
              transition: "all 0.15s ease",
            })}
          >
            <span style={{ fontSize: "15px", minWidth: "20px", textAlign: "center" }}>{item.icon}</span>
            {!collapsed && (
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.label}
              </span>
            )}
          </NavLink>
        ))}

        {/* Extensions */}
        <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "8px 4px" }} />
        {!collapsed && (
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text-muted)",
              padding: "4px 8px 2px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Extensions
          </div>
        )}
        {simulatedItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "space-between",
              padding: collapsed ? "8px 0" : "7px 12px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "12px",
              fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--panel-dark)" : "var(--text-muted)",
              transition: "all 0.15s ease",
            })}
          >
            <div style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : "8px" }}>
              <span style={{ fontSize: "14px", minWidth: "20px", textAlign: "center" }}>{item.icon}</span>
              {!collapsed && (
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.label}
                </span>
              )}
            </div>
            {!collapsed && (
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: "3px",
                  backgroundColor: item.tag === "Sim" ? "#FFE082" : "color-mix(in srgb, var(--accent-ink) 30%, var(--panel-dark))",
                  color: item.tag === "Sim" ? "#8D6E63" : "#4A148C",
                }}
              >
                {item.tag}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Info */}
      <div
        style={{
          padding: collapsed ? "10px 4px" : "10px 14px",
          borderTop: "1px solid var(--border)",
          fontSize: "11px",
          color: "var(--accent-ink)",
          display: "flex",
          justifyContent: collapsed ? "center" : "space-between",
          alignItems: "center",
          boxSizing: "border-box",
        }}
      >
        {!collapsed ? (
          <>
            <span style={{ fontWeight: 600 }}>FOSCL v0.2.0</span>
            <span style={{ fontSize: "9px", background: "#E8DDD0", padding: "2px 6px", borderRadius: "3px", color: "var(--text-main)", fontWeight: 600 }}>
              Ctrl+\
            </span>
          </>
        ) : (
          <span
            title="Press Ctrl+\ to expand"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#10B981",
              boxShadow: "0 0 6px rgba(16, 185, 129, 0.5)",
            }}
          />
        )}
      </div>
    </aside>
  );
};
