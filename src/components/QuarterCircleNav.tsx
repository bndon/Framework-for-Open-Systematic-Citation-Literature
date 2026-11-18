import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { loadMenuAnim, saveMenuAnim, loadRecentRoutes, pushRecentRoute, type MenuAnim } from "../lib/settings";
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
  screening: { id: "screening", label: "Screening", sublabel: "Include / exclude · PRISMA", route: "/library?tab=screening", icon: "🧪", category: "research" },
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

/** Reading order of the menu (inner ring first). Also decides the Alt+1..9 shortcuts. */
const FLAT: NavAction[] = RINGS.flatMap((r) => r.ids).map((id) => NAV[id]);
const ROUTE_TO_NAV = new Map(FLAT.map((a) => [a.route, a]));

const R_INNER = 84; // radius where the first ring starts (button is 68px)
const THICKNESS = 88;
const GAP = 6;
// Every item is a box of ITEM_W x ITEM_H (dot + two label lines). Positions are chosen so that
// boxes never overlap each other, the corner button, or the screen edge (checked by script).
const ITEM_W = 56;
const ITEM_H = 58;
const STAGE = 470;

/**
 * Animation presets. In every mode the items are clickable from the very first frame;
 * the animation is only decoration. "fast" is roughly four times quicker than "full".
 */
const TIMING: Record<MenuAnim, { sweep: number; stagger: number; itemBase: number; pop: number; close: number }> = {
  full: { sweep: 480, stagger: 200, itemBase: 120, pop: 320, close: 160 },
  fast: { sweep: 150, stagger: 35, itemBase: 0, pop: 170, close: 90 },
  off: { sweep: 0, stagger: 0, itemBase: 0, pop: 0, close: 0 },
};
const ANIM_LABEL: Record<MenuAnim, string> = { full: "Full", fast: "Fast", off: "Off" };
const ANIM_NEXT: Record<MenuAnim, MenuAnim> = { fast: "full", full: "off", off: "fast" };

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
  const [anim, setAnim] = useState<MenuAnim>(loadMenuAnim);
  const [sel, setSel] = useState(0); // highlighted match (arrow keys / typing)
  const [arrowed, setArrowed] = useState(false); // has the user moved the highlight yet?
  const [altHeld, setAltHeld] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const closeTimer = useRef<number | undefined>(undefined);
  const t = TIMING[anim];

  const resetBar = () => {
    setSearch("");
    setSel(0);
    setArrowed(false);
    setAltHeld(false);
  };

  const openNav = () => {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setIsOpen(true);
  };
  const closeNav = () => {
    if (!isOpen || closing) return;
    if (t.close === 0) {
      setIsOpen(false);
      resetBar();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setIsOpen(false);
      setClosing(false);
      resetBar();
    }, t.close);
  };
  const toggleNav = () => (isOpen && !closing ? closeNav() : openNav());

  // Close immediately on route change, and remember the screen for the "recent" shortcuts
  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(false);
    setClosing(false);
    resetBar();
    if (ROUTE_TO_NAV.has(location.pathname)) pushRecentRoute(location.pathname);
  }, [location.pathname]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Keep in sync if the animation setting is changed from the Settings screen
  useEffect(() => {
    const onChange = (e: Event) => setAnim((e as CustomEvent<MenuAnim>).detail);
    window.addEventListener("foscl:menu_anim", onChange);
    return () => window.removeEventListener("foscl:menu_anim", onChange);
  }, []);

  const go = (route: string) => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(false);
    setClosing(false);
    resetBar();
    if (route !== location.pathname) navigate(route);
  };

  // Global keys: Esc toggles, Ctrl/Cmd+K or P toggles, Alt+1..9 jumps straight to a screen
  const stateRef = useRef({ isOpen, closing });
  stateRef.current = { isOpen, closing };
  const toggleRef = useRef(toggleNav);
  toggleRef.current = toggleNav;
  const closeRef = useRef(closeNav);
  closeRef.current = closeNav;
  const openRef = useRef(openNav);
  openRef.current = openNav;
  const goRef = useRef(go);
  goRef.current = go;
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
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code) && !document.querySelector("[data-modal]")) {
        const target = FLAT[Number(e.code.slice(5)) - 1];
        if (target) {
          e.preventDefault();
          goRef.current(target.route);
        }
      }
      if (e.key === "Alt") setAltHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    const onBlur = () => setAltHeld(false);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const q = search.trim().toLowerCase();
  const matches = (a: NavAction) =>
    (activeCategory === "all" || a.category === activeCategory) &&
    (!q || a.label.toLowerCase().includes(q) || a.sublabel.toLowerCase().includes(q));
  const matchList = FLAT.filter(matches);
  const selIdx = matchList.length ? Math.min(sel, matchList.length - 1) : -1;
  // Enter opens the highlighted match, but only once the user has typed or used the arrows
  const hlId = selIdx >= 0 && (q || arrowed) ? matchList[selIdx].id : null;

  const recent = useMemo(
    () =>
      isOpen
        ? loadRecentRoutes()
            .filter((r) => r !== location.pathname)
            .map((r) => ROUTE_TO_NAV.get(r))
            .filter((a): a is NavAction => !!a)
            .slice(0, 3)
        : [],
    [isOpen, location.pathname]
  );

  const cycleAnim = () => {
    const next = ANIM_NEXT[anim];
    setAnim(next);
    saveMenuAnim(next);
  };

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
        <div className={`qn-backdrop qn-anim-${anim}${closing ? " closing" : ""}`} onClick={closeNav}>
          <div className={`qn-stage${altHeld ? " show-num" : ""}`} onClick={(e) => e.stopPropagation()}>
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
                    style={{ stroke: ring.fill, ["--qn-delay" as string]: `${i * t.stagger}ms`, ["--qn-dur" as string]: `${t.sweep}ms` }}
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
              return ring.ids.map((id, k) => {
                const a = NAV[id];
                const frac = (k + 0.5) / n; // 0 = top edge, 1 = left edge
                const angle = aMin + (aMax - aMin) * frac;
                const x = r * Math.cos(rad(angle));
                const y = r * Math.sin(rad(angle));
                // pop in as the sweep reaches the item
                const progress = ring.reverse ? 1 - frac : frac;
                const delay = i * t.stagger + t.sweep * 0.55 * progress + t.itemBase;
                const current = location.pathname === a.route;
                const dim = !matches(a);
                const number = FLAT.indexOf(a) + 1;
                return (
                  <button
                    key={id}
                    className={`qn-item${current ? " current" : ""}${dim ? " dim" : ""}${hlId === id ? " hl" : ""}`}
                    title={`${a.label} — ${a.sublabel}${number <= 9 ? `  (Alt+${number})` : ""}`}
                    onClick={() => go(a.route)}
                    style={{
                      left: x,
                      top: y,
                      width: ITEM_W,
                      ["--qn-fg" as string]: ring.fg,
                      ["--qn-delay" as string]: `${delay}ms`,
                      ["--qn-pop" as string]: `${t.pop}ms`,
                    }}
                  >
                    <span className="qn-dot">
                      {a.icon}
                      {number <= 9 && <span className="qn-num">{number}</span>}
                    </span>
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!matchList.length) return;
                    const step = e.key === "ArrowDown" ? 1 : -1;
                    // the first arrow press just reveals the highlight; later presses move it
                    setSel(arrowed || q ? (selIdx + step + matchList.length) % matchList.length : 0);
                    setArrowed(true);
                  } else if (e.key === "Enter" && hlId) {
                    go(NAV[hlId].route);
                  }
                }}
                placeholder="Jump to a screen…  (type, ↑↓, Enter)"
                autoFocus
              />
              <span className="qn-kbd">ESC</span>
            </div>

            {recent.length > 0 && !q && (
              <div className="qn-recent">
                <span className="qn-recent-label">Recent</span>
                {recent.map((a) => (
                  <button key={a.id} className="qn-chip" onClick={() => go(a.route)}>
                    <span aria-hidden="true">{a.icon}</span> {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className="qn-pills">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  className={`qn-pill${activeCategory === c.id ? " active" : ""}`}
                  onClick={() => {
                    setActiveCategory(c.id);
                    setSel(0);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="qn-foot">
              <span>
                <strong>↵</strong> {hlId ? NAV[hlId].label : "open"} · <strong>Alt+1–9</strong> jump
              </span>
              <button className="qn-anim-btn" onClick={cycleAnim} title="Menu animation: Full / Fast / Off (also in Settings)">
                Animation: <strong>{ANIM_LABEL[anim]}</strong>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
