import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface NavAction {
  id: string;
  label: string;
  sublabel: string;
  route: string;
  icon: string;
  shortcut?: string;
  category: "research" | "synthesis" | "tools";
}

const NAV_ACTIONS: NavAction[] = [
  // Research
  { id: "dashboard", label: "Overview", sublabel: "Bento workspace grid", route: "/", icon: "🍱", shortcut: "H", category: "research" },
  { id: "discover", label: "Discover", sublabel: "250M+ OpenAlex papers", route: "/discover", icon: "🔍", shortcut: "D", category: "research" },
  { id: "library", label: "Library", sublabel: "Collections & archive", route: "/library", icon: "📚", shortcut: "L", category: "research" },
  { id: "epub", label: "Books", sublabel: "EPUB local archive", route: "/epub", icon: "📖", shortcut: "B", category: "research" },

  // Synthesis
  { id: "compare", label: "Compare Matrix", sublabel: "Cross-paper table", route: "/compare", icon: "📊", shortcut: "C", category: "synthesis" },
  { id: "lineage", label: "Lineage", sublabel: "Claim & evidence chains", route: "/lineage", icon: "🧬", shortcut: "R", category: "synthesis" },
  { id: "graph", label: "Knowledge Graph", sublabel: "Interactive entity web", route: "/graph", icon: "🕸️", shortcut: "G", category: "synthesis" },
  { id: "citations", label: "Citation Tree", sublabel: "Upstream & downstream", route: "/citations", icon: "🌳", shortcut: "T", category: "synthesis" },

  // Tools
  { id: "templates", label: "Templates", sublabel: "Extraction schemas", route: "/templates", icon: "📋", shortcut: "M", category: "tools" },
  { id: "export", label: "Export", sublabel: "DOCX & PDF synthesis", route: "/export", icon: "📤", shortcut: "E", category: "tools" },
  { id: "hub", label: "Access Hub", sublabel: "DOI & publisher access", route: "/access-hub", icon: "🔑", shortcut: "A", category: "tools" },
  { id: "converter", label: "Manuscript Analyzer", sublabel: "IEEE/ACM compliance", route: "/converter", icon: "📄", shortcut: "P", category: "tools" },
  { id: "settings", label: "Settings", sublabel: "Themes & preferences", route: "/settings", icon: "⚙️", shortcut: "S", category: "tools" },
];

export const QuarterCircleNav: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"all" | "research" | "synthesis" | "tools">("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // Close on Escape or Route Change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
      // Cmd+K or Ctrl+K opens the quick navigator
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "p")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filtered = NAV_ACTIONS.filter((item) => {
    const matchCat = activeCategory === "all" || item.category === activeCategory;
    const matchSearch =
      !search.trim() ||
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.sublabel.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleNavigate = (route: string) => {
    setIsOpen(false);
    navigate(route);
  };

  const isHome = location.pathname === "/";

  return (
    <>
      {/* ── TOP-LEFT FLOATING QUARTER-CIRCLE TRIGGER ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title="Open Quick Navigator (Ctrl+K)"
          style={{
            width: "68px",
            height: "68px",
            background: isOpen ? "var(--accent)" : "var(--panel)",
            color: isOpen ? "var(--panel-dark)" : "var(--text-main)",
            border: "1px solid var(--border)",
            borderTop: "none",
            borderLeft: "none",
            borderBottomRightRadius: "36px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 0 10px 10px",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.12)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.06)";
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "17px", fontWeight: 900, letterSpacing: "-0.5px" }}>
              {isOpen ? "✕" : "F"}
            </span>
            <span style={{ fontSize: "9px", opacity: 0.65, fontWeight: 700, letterSpacing: "1px" }}>
              {isOpen ? "ESC" : "MENU"}
            </span>
          </div>
        </button>

        {/* Small floating breadcrumb on non-home pages */}
        {!isHome && !isOpen && (
          <div
            onClick={() => navigate("/")}
            title="Return to Home Dashboard"
            style={{
              marginTop: "8px",
              padding: "5px 12px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
              backdropFilter: "blur(10px)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-main)";
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <span>←</span>
            <span>Dashboard</span>
          </div>
        )}
      </div>

      {/* ── EXPANDED RADIAL / COMMAND NAVIGATOR MODAL ── */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 12, 16, 0.55)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            zIndex: 9998,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            padding: "80px 0 0 80px",
            animation: "navFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Main Navigator Dialog */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "560px",
              maxHeight: "calc(100vh - 120px)",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "22px",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              animation: "navSlideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header / Search Input */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "var(--panel-dark)",
              }}
            >
              <span style={{ fontSize: "16px", opacity: 0.7 }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Jump to workspace module or press key..."
                autoFocus
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "14px",
                  color: "var(--text-main)",
                  fontWeight: 500,
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  background: "var(--nav-active-bg)",
                  color: "var(--text-muted)",
                  borderRadius: "5px",
                  border: "1px solid var(--border)",
                }}
              >
                ESC
              </span>
            </div>

            {/* Category Filter Pills */}
            <div
              style={{
                display: "flex",
                gap: "6px",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border)",
                background: "var(--panel)",
              }}
            >
              {[
                { id: "all", label: "All Modules" },
                { id: "research", label: "Discovery & Library" },
                { id: "synthesis", label: "Synthesis & Graphs" },
                { id: "tools", label: "Output & Tools" },
              ].map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id as any)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "14px",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: isActive ? "var(--accent)" : "var(--nav-active-bg)",
                      color: isActive ? "var(--panel-dark)" : "var(--text-muted)",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Action Grid List */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px",
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "8px",
              }}
            >
              {filtered.map((item) => {
                const isCurrent = location.pathname === item.route;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNavigate(item.route)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background: isCurrent ? "var(--nav-active-bg)" : "transparent",
                      border: `1px solid ${isCurrent ? "var(--accent)" : "transparent"}`,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      transition: "all 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--nav-active-bg)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "transparent";
                      }
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: isCurrent ? "var(--accent)" : "var(--panel-dark)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "17px",
                        flexShrink: 0,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {item.icon}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.sublabel}
                      </div>
                    </div>
                    {item.shortcut && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "var(--panel-dark)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {item.shortcut}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "10px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--panel-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "var(--text-muted)",
              }}
            >
              <span>FOSCL Research Workspace</span>
              <div style={{ display: "flex", gap: "10px" }}>
                <span><strong>↑↓</strong> navigate</span>
                <span><strong>↵</strong> select</span>
                <span><strong>ESC</strong> close</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes navFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes navSlideDown {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
};
