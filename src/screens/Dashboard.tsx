import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPapers, getCollections, getCollectionPapers, getScreening } from "../lib/api";
import type { Collection } from "../types";
import "../dashboard.css";

/**
 * Bento dashboard — 6 columns x 4 rows, with three round buttons sitting on grid-line
 * intersections and biting a circular notch out of every tile they touch.
 *
 * ALL layout lives in the tables below. Nothing else needs to change to move things.
 *
 *   COLS / ROWS   track sizes as relative weights (measured from the wireframe)
 *   TILES         where each tile sits (col/row are 1-based and inclusive) and which
 *                 overlays notch it
 *   OVERLAYS      where each circle sits. A number is a grid LINE: `3` is the line
 *                 after column/row 3. A pair [a, b] is the CENTRE of tracks a..b.
 */

const COLS = [219, 115, 107, 139, 147, 229];
const ROWS = [107, 106, 88, 185];

type Span = [start: number, end: number];
type Pos = number | [number, number];

interface TileDef {
  id: string;
  to: string;
  title: string;
  blurb: string;
  icon: string;
  col: Span;
  row: Span;
  /** Overlay ids whose circle cuts into this tile. */
  notches?: string[];
  /** Where the text sits. Pick the side that is clear of this tile's notches. */
  anchor: "top" | "bottom";
  tag?: string;
  variant?: "feature" | "deep";
}

const TILES: TileDef[] = [
  { id: "about", to: "/about", title: "About", icon: "ℹ️", col: [1, 1], row: [1, 1], anchor: "bottom",
    blurb: "What FOSCL is and how it fits together." },
  { id: "discover", to: "/discover", title: "Discover", icon: "🔍", col: [1, 1], row: [2, 2], anchor: "bottom",
    blurb: "Search OpenAlex or look up a DOI." },
  { id: "library", to: "/library", title: "Library", icon: "📚", col: [2, 3], row: [1, 3], anchor: "top", variant: "feature",
    notches: ["graph", "citations"],
    blurb: "Collections, PDFs and annotations." },
  { id: "export", to: "/export", title: "Export", icon: "📤", col: [1, 1], row: [3, 4], anchor: "bottom",
    notches: ["graph"],
    blurb: "Word and PDF, ready to hand in." },
  { id: "access", to: "/access-hub", title: "Access Hub", icon: "🔑", col: [2, 2], row: [4, 4], anchor: "bottom", tag: "🔒 Pro",
    notches: ["graph"],
    blurb: "DOI and publisher access." },
  { id: "converter", to: "/converter", title: "Conference Converter", icon: "📄", col: [3, 3], row: [4, 4], anchor: "bottom", tag: "🔒 Pro",
    blurb: "Check a manuscript against a style." },
  { id: "compare", to: "/compare", title: "Comparison Table", icon: "📊", col: [4, 4], row: [1, 2], anchor: "top",
    notches: ["citations"],
    blurb: "Papers and fields, side by side." },
  { id: "lineage", to: "/lineage", title: "Research Lineage", icon: "🧬", col: [5, 5], row: [1, 2], anchor: "top",
    blurb: "Claims, evidence and revisions." },
  { id: "books", to: "/epub", title: "Books", icon: "📖", col: [4, 5], row: [3, 4], anchor: "bottom", variant: "deep",
    notches: ["citations", "settings"],
    blurb: "Your EPUB and PDF shelf." },
  { id: "templates", to: "/templates", title: "Template", icon: "📋", col: [6, 6], row: [1, 4], anchor: "top",
    notches: ["settings"],
    blurb: "The fields every comparison table is built from." },
];

interface OverlayDef {
  id: string;
  to: string;
  label: string;
  icon: string;
  x: Pos;
  y: Pos;
  size: "sm" | "lg";
  tone: "plum" | "sage" | "deep";
}

const OVERLAYS: OverlayDef[] = [
  { id: "graph", to: "/graph", label: "Knowledge Graph", icon: "🕸️", x: 1, y: 3, size: "sm", tone: "plum" },
  { id: "citations", to: "/citations", label: "Citation Tree", icon: "🌳", x: 3, y: 2, size: "lg", tone: "sage" },
  { id: "settings", to: "/settings", label: "Settings", icon: "⚙️", x: 5, y: [3, 4], size: "lg", tone: "deep" },
];

// ---------------------------------------------------------------------------
// Geometry. Everything is emitted as CSS calc() so the grid stays fluid. --W / --H are
// the total track width / height (frame size minus gaps), defined in styles.css.
// ---------------------------------------------------------------------------
const sum = (a: number[], n: number) => a.slice(0, n).reduce((s, v) => s + v, 0);
const TOTAL_C = sum(COLS, COLS.length);
const TOTAL_R = sum(ROWS, ROWS.length);

function axis(pos: Pos, tracks: number[], total: number, size: string): string {
  if (typeof pos === "number") {
    return `calc(${sum(tracks, pos) / total} * ${size} + ${pos} * var(--gap) - var(--gap) / 2)`;
  }
  const [a, b] = pos;
  const mid = (sum(tracks, a - 1) + sum(tracks, b)) / (2 * total);
  return `calc(${mid} * ${size} + ${(a + b - 2) / 2} * var(--gap))`;
}

function origin(start: number, tracks: number[], total: number, size: string): string {
  return `calc(${sum(tracks, start - 1) / total} * ${size} + ${start - 1} * var(--gap))`;
}

const overlayX = (o: OverlayDef) => axis(o.x, COLS, TOTAL_C, "var(--W)");
const overlayY = (o: OverlayDef) => axis(o.y, ROWS, TOTAL_R, "var(--H)");

function cellStyle(tile: TileDef): React.CSSProperties {
  const style: Record<string, string> = {
    gridColumn: `${tile.col[0]} / ${tile.col[1] + 1}`,
    gridRow: `${tile.row[0]} / ${tile.row[1] + 1}`,
  };
  const x0 = origin(tile.col[0], COLS, TOTAL_C, "var(--W)");
  const y0 = origin(tile.row[0], ROWS, TOTAL_R, "var(--H)");
  (tile.notches ?? []).slice(0, 3).forEach((id, i) => {
    const o = OVERLAYS.find((ov) => ov.id === id);
    if (!o) return;
    style[`--n${i}x`] = `calc(${overlayX(o)} - ${x0})`;
    style[`--n${i}y`] = `calc(${overlayY(o)} - ${y0})`;
    style[`--n${i}r`] = `calc(var(--d-${o.size}) / 2 + var(--ring) + var(--outline))`;
  });
  return style as React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
const Tile: React.FC<{ tile: TileDef; children?: React.ReactNode }> = ({ tile, children }) => {
  const n = Math.min(tile.notches?.length ?? 0, 3);
  const notch = n === 0 ? "" : ` n${n}`;
  const variant = tile.variant ? ` ${tile.variant}` : "";
  return (
    <Link to={tile.to} className="bento-cell" style={cellStyle(tile)} aria-label={tile.title}>
      <span className={`bento-outline${notch}${tile.variant === "deep" ? " on-deep" : ""}`} aria-hidden="true" />
      <div className={`bento-card${notch}${variant} anchor-${tile.anchor}`}>
        <span className="bento-arrow" aria-hidden="true">↗</span>
        <div className="bento-icon" aria-hidden="true">{tile.icon}</div>
        {tile.anchor === "bottom" ? (
          <>
            <div className="bento-spacer" />
            {children}
            {tile.tag && <span className="bento-tag">{tile.tag}</span>}
            <h2 className="bento-title">{tile.title}</h2>
            <p className="bento-blurb">{tile.blurb}</p>
          </>
        ) : (
          <>
            {tile.tag && <span className="bento-tag">{tile.tag}</span>}
            <h2 className="bento-title">{tile.title}</h2>
            <p className="bento-blurb">{tile.blurb}</p>
            {children}
            <div className="bento-spacer" />
          </>
        )}
      </div>
    </Link>
  );
};

/** Original illustration: a shelf of book spines in the theme colours. */
const BookShelf: React.FC = () => (
  <svg className="bento-shelf" viewBox="0 0 260 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <rect x="4" y="160" width="252" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
    <g>
      <rect x="18" y="62" width="26" height="98" rx="3" fill="#f9f4ec" />
      <rect x="18" y="76" width="26" height="4" fill="#845177" />
      <rect x="18" y="140" width="26" height="4" fill="#845177" />

      <rect x="48" y="38" width="30" height="122" rx="3" fill="#a7bca1" />
      <circle cx="63" cy="64" r="6" fill="none" stroke="#3e0d33" strokeWidth="2" />
      <rect x="55" y="96" width="16" height="3" fill="#3e0d33" />
      <rect x="55" y="104" width="16" height="3" fill="#3e0d33" />

      <rect x="82" y="72" width="22" height="88" rx="3" fill="#c98aa9" />
      <rect x="82" y="86" width="22" height="3" fill="#f9f4ec" />

      <rect x="108" y="22" width="32" height="138" rx="3" fill="#845177" />
      <rect x="108" y="40" width="32" height="5" fill="#f9f4ec" />
      <rect x="108" y="52" width="32" height="2" fill="#f9f4ec" />
      <circle cx="124" cy="132" r="7" fill="#f9f4ec" />

      <rect x="144" y="56" width="24" height="104" rx="3" fill="#e0b25a" />
      <rect x="144" y="70" width="24" height="3" fill="#3e0d33" />
      <rect x="144" y="146" width="24" height="3" fill="#3e0d33" />

      <rect x="172" y="46" width="28" height="114" rx="3" fill="#f9f4ec" />
      <rect x="179" y="60" width="14" height="14" rx="7" fill="#653756" />
      <rect x="179" y="84" width="14" height="3" fill="#653756" />
      <rect x="179" y="92" width="14" height="3" fill="#653756" />

      <g transform="rotate(14 222 160)">
        <rect x="206" y="64" width="30" height="96" rx="3" fill="#a7bca1" />
        <rect x="206" y="80" width="30" height="4" fill="#3e0d33" />
        <rect x="206" y="136" width="30" height="4" fill="#3e0d33" />
      </g>
    </g>
  </svg>
);

const TEMPLATE_FIELDS = ["Research question", "Methodology", "Dataset", "Findings", "Limitations"];

export const Dashboard: React.FC = () => {
  const [paperCount, setPaperCount] = useState<number | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [screen, setScreen] = useState<{ name: string; total: number; done: number; included: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [papers, colls] = await Promise.all([getPapers(), getCollections()]);
        if (!alive) return;
        setPaperCount(papers.length);
        setCollections(colls);
        // screening progress for the collection you last worked on
        let last = "";
        try {
          last = localStorage.getItem("foscl:screening_collection") || "";
        } catch {}
        const c = colls.find((x) => x.id === last) || colls[0];
        if (c) {
          const [ps, ds] = await Promise.all([getCollectionPapers(c.id), getScreening(c.id)]);
          const s1 = ds.filter((d) => d.stage === "title_abstract");
          if (alive && ps.length && s1.length) {
            setScreen({ name: c.name, total: ps.length, done: s1.length, included: s1.filter((d) => d.decision === "include").length });
          }
        }
      } catch {
        // Counts are a nicety; the dashboard works without them.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const byId = (id: string) => TILES.find((t) => t.id === id)!;
  const collectionCount = collections?.length ?? null;
  const summary =
    paperCount === null || collectionCount === null
      ? "Find · Organize · Synthesize · Cite · Link"
      : `${paperCount} paper${paperCount === 1 ? "" : "s"} · ${collectionCount} collection${collectionCount === 1 ? "" : "s"}`;

  return (
    <div className="dash-root">
      <header className="dash-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span className="brand-text">
            <span className="brand-name">FOSCL</span>
            <span className="brand-sub">Research workspace</span>
          </span>
        </div>
        <div className="dash-summary">{summary}</div>
      </header>

      <div className="bento-frame">
        <div
          className="bento"
          style={{
            gridTemplateColumns: COLS.map((c) => `minmax(0, ${c}fr)`).join(" "),
            gridTemplateRows: ROWS.map((r) => `minmax(0, ${r}fr)`).join(" "),
          }}
        >
          <Tile tile={byId("about")} />
          <Tile tile={byId("discover")} />

          <Tile tile={byId("library")}>
            <div className="bento-stat-row">
              <span className="bento-stat">{paperCount ?? "—"}</span>
              <span className="bento-stat-label">papers saved</span>
            </div>
            {screen && (
              <div className="bento-screen" title={`Screening: ${screen.name}`}>
                <div className="bento-screen-text">
                  🧪 {screen.done}/{screen.total} screened · {screen.included} in
                </div>
                <div className="bento-screen-bar">
                  <div style={{ width: `${Math.round((screen.done / screen.total) * 100)}%` }} />
                </div>
              </div>
            )}
            {collections && collections.length > 0 && (
              <div className="bento-chips lib-chips">
                {collections.slice(0, 4).map((c) => (
                  <span key={c.id} className="bento-chip">{c.name}</span>
                ))}
                {collections.length > 4 && <span className="bento-chip">+{collections.length - 4}</span>}
              </div>
            )}
          </Tile>

          <Tile tile={byId("export")} />
          <Tile tile={byId("access")} />
          <Tile tile={byId("converter")} />
          <Tile tile={byId("compare")} />
          <Tile tile={byId("lineage")} />

          <Tile tile={byId("books")}>
            <BookShelf />
          </Tile>

          <Tile tile={byId("templates")}>
            <div className="bento-chips tmpl-chips">
              {TEMPLATE_FIELDS.map((f) => (
                <span key={f} className="bento-chip">{f}</span>
              ))}
            </div>
          </Tile>
        </div>

        {OVERLAYS.map((o) => (
          <Link
            key={o.id}
            to={o.to}
            title={o.label}
            aria-label={o.label}
            className={`bento-ov ${o.size} ${o.tone}`}
            style={{ "--ox": overlayX(o), "--oy": overlayY(o) } as React.CSSProperties}
          >
            <span className="bento-ov-ring" aria-hidden="true" />
            <span className="bento-ov-icon" aria-hidden="true">{o.icon}</span>
            <span className="bento-ov-label">{o.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};
