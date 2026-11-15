import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./quarterNav.css";

type Category = "research" | "synthesis" | "tools";

interface NavAction {
  id: string;
  label: string;
  sublabel: string;
  route: string;
  icon: string;
  category: Category;
}

const NAV: Record<string, NavAction> = {
  dashboard: { id: "dashboard", label: "Overview", sublabel: "Bento workspace grid", route: "/", icon: "🍱", category: "research" },
  discover: { id: "discover", label: "Discover", sublabel: "250M+ OpenAlex papers", route: "/discover", icon: "🔍", category: "research" },
  library: { id: "library", label: "Library", sublabel: "Collections & archive", route: "/library", icon: "📚", category: "research" },
  epub: { id: "epub", label: "Books", sublabel: "EPUB local archive", route: "/epub", icon: "📖", category: "research" },
  compare: { id: "compare", label: "Compare Matrix", sublabel: "Cross-paper table", route: "/compare", icon: "📊", category: "synthesis" },
  lineage: { id: "lineage", label: "Lineage", sublabel: "Claim & evidence chains", route: "/lineage", icon: "🧬", category: "synthesis" },
  graph: { id: "graph", label: "Knowledge Graph", sublabel: "Interactive entity web", route: "/graph", icon: "🕸️", category: "synthesis" },
  citations: { id: "citations", label: "Citation Tree", sublabel: "Upstream & downstream", route: "/citations", icon: "🌳", category: "synthesis" },
  templates: { id: "templates", label: "Templates", sublabel: "Extraction schemas", route: "/templates", icon: "📋", category: "tools" },
  export: { id: "export", label: "Export", sublabel: "DOCX & PDF synthesis", route: "/export", icon: "📤", category: "tools" },
  hub: { id: "hub", label: "Access Hub", sublabel: "DOI & publisher access", route: "/access-hub", icon: "🔑", category: "tools" },
  converter: { id: "converter", label: "Manuscript Analyzer", sublabel: "IEEE/ACM compliance", route: "/converter", icon: "📄", category: "tools" },
  settings: { id: "settings", label: "Settings", sublabel: "Themes & preferences", route: "/settings", icon: "⚙️", category: "tools" },
};

/**
 * Rings, innermost first. Each ring sweeps out from the corner in turn;
 * `reverse` flips the sweep direction so the rings alternate
 * (top edge -> left edge, left edge -> top edge, ...).
 */
const RINGS: { ids: string[]; reverse: boolean; stroke: string; fg: string }[] = [
  { ids: ["dashboard", "discover", "library"], reverse: false, stroke: "var(--deep, var(--text-main))", fg: "#fff" },
  { ids: ["epub", "compare", "lineage", "graph"], reverse: true, stroke: "var(--accent)", fg: "#fff" },
  { ids: ["citations", "templates", "export", "hub", "converter", "settings"], reverse: false, stroke: "var(--panel)", fg: "var(--text-main)" },
];

const R_INNER = 88; // radius where the first ring starts (button is 80px)
const THICKNESS = 100;
const GAP = 6;
const SWEEP_MS = 520;
const RING_STAGGER_MS = 230;
const A_MIN = 8; // degrees of padding at each end of a ring
const A_MAX = 82;
const CLOSE_MS = 160;

const CATEGORIES: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "All Modules" },
  { id: "research", label: "Discovery & Library" },
  { id: "synthesis", label: "Synthesis & Graphs" },
  { id: "tools", label: "Output & Tools" },
];

const rad = (deg: number) => (deg * Math.PI) / 180;

export const QuarterCircleNav: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const closeTimer = useRef<number | undefined>(undefined);

  const openNav = () => {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setIsOpen(true);
  };
  const closeNav = () => {
    if (!isOpen || closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setIsOpen(false);
      setClosing(false);
      setSearch("");
    }, CLOSE_MS);
  };
  const toggleNav = () => (isOpen && !closing ? closeNav() : openNav());

  // Close immediately on route change
  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(false);
    setClosing(false);
    setSearch("");
  }, [location.pathname]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Escape closes; Ctrl/Cmd + K or P toggles
  const stateRef = useRef({ isOpen, closing });
  stateRef.current = { isOpen, closing };
  const toggleRef = useRef(toggleNav);
  toggleRef.current = toggleNav;
  const closeRef = useRef(closeNav);
  closeRef.current = closeNav;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "p")) {
        e.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = search.trim().toLowerCase();
  const matches = (a: NavAction) =>
    (activeCategory === "all" || a.category === activeCategory) &&
    (!q || a.label.toLowerCase().includes(q) || a.sublabel.toLowerCase().includes(q));

  const go = (route: string) => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(false);
    setClosing(false);
    setSearch("");
    navigate(route);
  };

  const firstMatch = RINGS.flatMap((r) => r.ids).map((id) => NAV[id]).find(matches);
  const isHome = location.pathname === "/";
  const open = isOpen;

  return (
    <>
      {/* Corner trigger */}
      <div className="qn-trigger">
        <button
          className={`qn-button${open && !closing ? " open" : ""}`}
          onClick={toggleNav}
          title="Open Quick Navigator (Ctrl+K)"
          aria-expanded={open}
        >
          <span className="qn-button-inner">
            <b>{open && !closing ? "✕" : "F"}</b>
            <small>{open && !closing ? "ESC" : "MENU"}</small>
          </span>
        </button>

        {!isHome && !open && (
          <div className="qn-crumb" onClick={() => navigate("/")} title="Return to Home Dashboard">
            <span>←</span>
            <span>Dashboard</span>
          </div>
        )}
      </div>

      {open && (
        <div className={`qn-backdrop${closing ? " closing" : ""}`} onClick={closeNav}>
          <div className="qn-stage" onClick={(e) => e.stopPropagation()}>
            <svg className="qn-svg" viewBox="0 0 440 440" aria-hidden="true">
              {RINGS.map((ring, i) => {
                const r = R_INNER + i * (THICKNESS + GAP) + THICKNESS / 2;
                // Arc from the top edge (angle 0) to the left edge (angle 90), or backwards.
                const d = ring.reverse ? `M 0 ${r} A ${r} ${r} 0 0 0 ${r} 0` : `M ${r} 0 A ${r} ${r} 0 0 1 0 ${r}`;
                return (
                  <path
                    key={i}
                    className="qn-arc"
                    d={d}
                    pathLength={100}
                    stroke={ring.stroke}
                    strokeWidth={THICKNESS}
                    style={{ ["--qn-delay" as string]: `${i * RING_STAGGER_MS}ms`, ["--qn-dur" as string]: `${SWEEP_MS}ms` }}
                  />
                );
              })}
            </svg>

            {RINGS.map((ring, i) => {
              const r = R_INNER + i * (THICKNESS + GAP) + THICKNESS / 2;
              const n = ring.ids.length;
              const arc = ((A_MAX - A_MIN) / 180) * Math.PI * r; // length of the usable arc
              const width = Math.max(46, Math.min(70, arc / n - 4));
              return ring.ids.map((id, k) => {
                const a = NAV[id];
                const frac = (k + 0.5) / n; // 0 = top edge, 1 = left edge
                const angle = A_MIN + (A_MAX - A_MIN) * frac;
                const x = r * Math.cos(rad(angle));
                const y = r * Math.sin(rad(angle));
                // pop in as the sweep reaches the item
                const progress = ring.reverse ? 1 - frac : frac;
                const delay = i * RING_STAGGER_MS + SWEEP_MS * 0.55 * progress + 120;
                const current = location.pathname === a.route;
                const dim = !matches(a);
                return (
                  <button
                    key={id}
                    className={`qn-item${current ? " current" : ""}${dim ? " dim" : ""}`}
                    title={`${a.label} — ${a.sublabel}`}
                    onClick={() => go(a.route)}
                    style={{
                      left: x,
                      top: y,
                      width,
                      ["--qn-fg" as string]: ring.fg,
                      ["--qn-delay" as string]: `${delay}ms`,
                    }}
                  >
                    <span className="qn-dot">{a.icon}</span>
                    <span className="qn-label">{a.label}</span>
                  </button>
                );
              });
            })}
          </div>

          {/* Search + category filter */}
          <div className="qn-bar" onClick={(e) => e.stopPropagation()}>
            <div className="qn-search">
              <span style={{ opacity: 0.7 }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && firstMatch) go(firstMatch.route);
                }}
                placeholder="Jump to workspace module..."
                autoFocus
              />
              <span className="qn-kbd">ESC</span>
            </div>
            <div className="qn-pills">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={`qn-pill${activeCategory === c.id ? " active" : ""}`} onClick={() => setActiveCategory(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="qn-foot">
              <span>FOSCL Research Workspace</span>
              <span>
                <strong>↵</strong> open {firstMatch ? firstMatch.label : "—"} · <strong>ESC</strong> close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
