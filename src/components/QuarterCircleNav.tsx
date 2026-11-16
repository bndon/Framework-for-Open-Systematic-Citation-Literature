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
const RINGS: { ids: string[]; reverse: boolean; fill: string; fg: string }[] = [
  { ids: ["dashboard"], reverse: false, fill: "var(--qn-r1)", fg: "var(--qn-r1-fg)" },
  { ids: ["discover", "library", "epub"], reverse: true, fill: "var(--qn-r2)", fg: "var(--qn-r2-fg)" },
  { ids: ["compare", "lineage", "graph", "citations"], reverse: false, fill: "var(--qn-r3)", fg: "var(--qn-r3-fg)" },
  { ids: ["templates", "export", "hub", "converter", "settings"], reverse: true, fill: "var(--qn-r4)", fg: "var(--qn-r4-fg)" },
];

const R_INNER = 84; // radius where the first ring starts (button is 68px)
const THICKNESS = 88;
const GAP = 6;
const SWEEP_MS = 480;
const RING_STAGGER_MS = 200;
// Every item is a box of ITEM_W x ITEM_H (dot + two label lines). Positions are chosen so that
// boxes never overlap each other, the corner button, or the screen edge (checked by script).
const ITEM_W = 56;
const ITEM_H = 58;
const STAGE = 470;
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
  const openRef = useRef(openNav);
  openRef.current = openNav;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-modal]")) {
        // Esc opens the menu; pressing it again closes it
        if (stateRef.current.isOpen && !stateRef.current.closing) closeRef.current();
        else openRef.current();
      }
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
  const open = isOpen;

  return (
    <>
      {/* Corner trigger */}
      <div className="qn-trigger">
        <button
          className={`qn-button${open && !closing ? " open" : ""}`}
          onClick={toggleNav}
          title="Quick Navigator (Esc or Ctrl+K)"
          aria-expanded={open}
        >
          <span className="qn-button-inner">
            <b>{open && !closing ? "✕" : "F"}</b>
            <small>{open && !closing ? "ESC" : "MENU"}</small>
          </span>
        </button>
      </div>

      {open && (
        <div className={`qn-backdrop${closing ? " closing" : ""}`} onClick={closeNav}>
          <div className="qn-stage" onClick={(e) => e.stopPropagation()}>
            <svg className="qn-svg" viewBox={`0 0 ${STAGE} ${STAGE}`} aria-hidden="true">
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
                    style={{ stroke: ring.fill, ["--qn-delay" as string]: `${i * RING_STAGGER_MS}ms`, ["--qn-dur" as string]: `${SWEEP_MS}ms` }}
                    strokeWidth={THICKNESS}
                  />
                );
              })}
            </svg>

            {RINGS.map((ring, i) => {
              const r = R_INNER + i * (THICKNESS + GAP) + THICKNESS / 2;
              const n = ring.ids.length;
              // keep the whole item box inside the screen edges
              const aMin = (Math.asin(Math.min(1, (ITEM_H / 2 + 6) / r)) * 180) / Math.PI;
              const aMax = (Math.acos(Math.min(1, (ITEM_W / 2 + 6) / r)) * 180) / Math.PI;
              const width = ITEM_W;
              return ring.ids.map((id, k) => {
                const a = NAV[id];
                const frac = (k + 0.5) / n; // 0 = top edge, 1 = left edge
                const angle = aMin + (aMax - aMin) * frac;
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
