import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  loadGraphSettings,
  saveGraphSettings,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_STATUS_COLORS,
  inkOn,
  withAlpha,
  shadeColor,
  isDarkColor,
  type GraphBackground,
  type GraphColorMode,
  type StatusColors,
} from "../lib/settings";

export type NodeStatus = "alert" | "warn" | "ok";

export interface GraphNode {
  id: string;
  label: string;
  type: "collection" | "paper" | "claim" | "center" | "reference" | "cited_by" | string;
  radius?: number;
  color?: string;
  /** used by the "By status" colour mode (missing = "ok") */
  status?: NodeStatus;
  /** short reason shown next to a flagged node, e.g. "Contradicts 1 claim" */
  statusNote?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  data?: any;
}

export interface GraphLink {
  source: string;
  target: string;
  label?: string;
  color?: string;
  dashed?: boolean;
}

interface ForceGraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNodeId?: string | null;
  onNodeClick?: (node: GraphNode) => void;
  height?: number | string;
  /** names for the three statuses, in this screen's own words */
  statusLabels?: Partial<Record<NodeStatus, string>>;
}

/** Built-in colour, size and icon of every node type. Colours can be overridden in Graph Settings → Colors. */
export const DEFAULT_TYPE_COLORS: Record<string, { fill: string; size: number; icon: string; label: string }> = {
  collection: { fill: "#845177", size: 44, icon: "⇄", label: "Collection" },
  paper: { fill: "#a98bb8", size: 32, icon: "◼", label: "Paper" },
  claim: { fill: "#7f9a78", size: 28, icon: "⬡", label: "Claim" },
  center: { fill: "#d9a441", size: 48, icon: "★", label: "Center work" },
  reference: { fill: "#a98bb8", size: 26, icon: "→", label: "Reference" },
  cited_by: { fill: "#c97a86", size: 26, icon: "←", label: "Cited by" },
};

const DEFAULT_STATUS_LABELS: Record<NodeStatus, string> = {
  alert: "Problem",
  warn: "Needs attention",
  ok: "No issues",
};

const SEVERITY: Record<NodeStatus, number> = { ok: 0, warn: 1, alert: 2 };

interface Palette {
  bg: string;
  text: string;
  muted: string;
  halo: string;
  linkNeutral: string;
  linkDim: string;
  ui: string; // floating panels
  uiBorder: string;
  uiText: string;
  uiMuted: string;
  field: string; // inputs inside panels
  accent: string; // active / selected highlight
  isDark: boolean;
}

const FIXED_PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    bg: "#111216",
    text: "#e2e8f0",
    muted: "#a3afc0",
    halo: "rgba(17, 18, 22, 0.85)",
    linkNeutral: "rgba(226, 232, 240, 0.38)",
    linkDim: "rgba(255, 255, 255, 0.08)",
    ui: "#1e2028",
    uiBorder: "#5b6275",
    uiText: "#e2e8f0",
    uiMuted: "#a3afc0",
    field: "#181a20",
    accent: "#d0617f",
    isDark: true,
  },
  light: {
    bg: "#f9f4ec",
    text: "#4a2418",
    muted: "#6f564b",
    halo: "rgba(255, 255, 255, 0.85)",
    linkNeutral: "rgba(74, 36, 24, 0.36)",
    linkDim: "rgba(74, 36, 24, 0.08)",
    ui: "#ffffff",
    uiBorder: "#a89683",
    uiText: "#4a2418",
    uiMuted: "#6f564b",
    field: "#f9f4ec",
    accent: "#a8445f",
    isDark: false,
  },
};

/** Palette that follows whatever app theme is active (reads the theme's own tokens). */
function appPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const g = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const bg = g("--bg", "#1c2225");
  const text = g("--text-main", "#edf2f4");
  const muted = g("--text-muted", "#96a1a7");
  const border = g("--border-strong", g("--border", "#5b6275"));
  return {
    bg,
    text,
    muted,
    halo: withAlpha(bg, 0.85),
    linkNeutral: withAlpha(text, 0.36),
    linkDim: withAlpha(text, 0.08),
    ui: g("--panel", "#2b3337"),
    uiBorder: border,
    uiText: text,
    uiMuted: muted,
    field: g("--panel-dark", "#161c1e"),
    accent: g("--accent", "#a8445f"),
    isDark: isDarkColor(bg),
  };
}

const BG_LABELS: [GraphBackground, string][] = [
  ["app", "App theme"],
  ["dark", "Dark"],
  ["light", "Cream"],
];
const MODE_LABELS: [GraphColorMode, string][] = [
  ["type", "By type"],
  ["status", "By status"],
  ["mono", "One color"],
];

// ── Small UI building blocks (module level so they keep their identity between renders) ──
const Seg = <T extends string>({ p, value, options, onChange }: { p: Palette; value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div style={{ display: "flex", border: `1px solid ${p.uiBorder}`, borderRadius: "6px", overflow: "hidden" }}>
    {options.map(([id, label], i) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        aria-pressed={value === id}
        style={{
          flex: 1,
          padding: "5px 6px",
          border: "none",
          borderLeft: i ? `1px solid ${p.uiBorder}` : "none",
          background: value === id ? p.accent : p.field,
          color: value === id ? inkOn(p.accent) : p.uiText,
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    ))}
  </div>
);

const Slider = ({ p, label, value, min, max, step, onChange, digits = 2 }: { p: Palette; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; digits?: number }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
      <span>{label}</span>
      <span style={{ color: p.uiMuted }}>{value.toFixed(digits)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: p.accent }} />
  </div>
);

const Check = ({ p, label, checked, onChange }: { p: Palette; label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", cursor: "pointer" }}>
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ cursor: "pointer", accentColor: p.accent }} />
  </label>
);

const ColorRow = ({ p, label, value, isDefault, onPick, onReset }: { p: Palette; label: string; value: string; isDefault: boolean; onPick: (v: string) => void; onReset: () => void }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
    <input
      type="color"
      value={value}
      onChange={(e) => onPick(e.target.value)}
      aria-label={`${label} color`}
      style={{ width: "30px", height: "22px", padding: 0, border: `1px solid ${p.uiBorder}`, borderRadius: "4px", background: "none", cursor: "pointer" }}
    />
    <span style={{ flex: 1 }}>{label}</span>
    <code style={{ fontSize: "11px", color: p.uiMuted }}>{value}</code>
    <button
      onClick={onReset}
      disabled={isDefault}
      title="Back to the default color"
      style={{ border: "none", background: "none", color: p.uiMuted, cursor: isDefault ? "default" : "pointer", opacity: isDefault ? 0.3 : 1, fontSize: "13px", padding: "0 2px" }}
    >
      ↺
    </button>
  </div>
);


export const ForceGraphView: React.FC<ForceGraphViewProps> = ({
  nodes: initialNodes,
  links: initialLinks,
  selectedNodeId = null,
  onNodeClick,
  height = "600px",
  statusLabels,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Settings State (Loaded and Saved with Persistence)
  const initialSettings = useRef(loadGraphSettings()).current;

  const [background, setBackground] = useState<GraphBackground>(initialSettings.background);
  const [colorMode, setColorMode] = useState<GraphColorMode>(initialSettings.colorMode);
  const [typeColors, setTypeColors] = useState<Record<string, string>>(initialSettings.typeColors);
  const [statusColors, setStatusColors] = useState<StatusColors>(initialSettings.statusColors);
  const [colorLinks, setColorLinks] = useState(initialSettings.colorLinks);
  const [showSettings, setShowSettings] = useState(false);
  const [openSections, setOpenSections] = useState({ filters: false, colors: true, display: false, forces: false });

  // Filters Settings
  const [searchQuery, setSearchQuery] = useState("");
  const [hideOrphans, setHideOrphans] = useState(initialSettings.hideOrphans);
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(initialSettings.enabledTypes);

  // Display Settings
  const [showArrows, setShowArrows] = useState(initialSettings.showArrows);
  const [textFadeThreshold, setTextFadeThreshold] = useState(initialSettings.textFadeThreshold);
  const [nodeSize, setNodeSize] = useState(initialSettings.nodeSize);
  const [linkThickness, setLinkThickness] = useState(initialSettings.linkThickness);

  // Forces Settings
  const [centerForceMult, setCenterForceMult] = useState(initialSettings.centerForceMult);
  const [repelForceMult, setRepelForceMult] = useState(initialSettings.repelForceMult);
  const [linkForceMult, setLinkForceMult] = useState(initialSettings.linkForceMult);
  const [linkDistance, setLinkDistance] = useState(initialSettings.linkDistance);

  // Auto-save any setting change to persistent localStorage
  useEffect(() => {
    saveGraphSettings({
      background,
      colorMode,
      typeColors,
      statusColors,
      colorLinks,
      showArrows,
      textFadeThreshold,
      nodeSize,
      linkThickness,
      centerForceMult,
      repelForceMult,
      linkForceMult,
      linkDistance,
      hideOrphans,
      enabledTypes,
    });
  }, [
    background,
    colorMode,
    typeColors,
    statusColors,
    colorLinks,
    showArrows,
    textFadeThreshold,
    nodeSize,
    linkThickness,
    centerForceMult,
    repelForceMult,
    linkForceMult,
    linkDistance,
    hideOrphans,
    enabledTypes,
  ]);

  // Resolve the palette (re-read whenever the app theme or the background choice changes)
  const themeKey = document.documentElement.getAttribute("data-theme") || "";
  const palette = useMemo<Palette>(
    () => (background === "app" ? appPalette() : FIXED_PALETTES[background]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [background, themeKey]
  );
  const labels = { ...DEFAULT_STATUS_LABELS, ...(statusLabels || {}) };

  // Camera & Zoom
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [zoomLevel, setZoomLevel] = useState(100);
  const isInitializedRef = useRef(false);

  // Simulation state
  const simNodesRef = useRef<(GraphNode & { x: number; y: number; vx: number; vy: number })[]>([]);
  const simLinksRef = useRef<GraphLink[]>([]);
  const draggingNodeRef = useRef<any>(null);
  const hoveredNodeRef = useRef<any>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const mouseDownPosRef = useRef({ x: 0, y: 0, time: 0 });
  const hasDraggedRef = useRef(false);

  // Keep references to forces for animation loop without causing effect re-runs
  const forcesRef = useRef<any>({});
  useEffect(() => {
    forcesRef.current = {
      centerForceMult,
      repelForceMult,
      linkForceMult,
      linkDistance,
      showArrows,
      textFadeThreshold,
      nodeSize,
      linkThickness,
      searchQuery,
      hideOrphans,
      enabledTypes,
      selectedNodeId,
      palette,
      colorMode,
      typeColors,
      statusColors,
      colorLinks,
    };
  });

  // 1. Sync simulation nodes smoothly WITHOUT resetting positions or camera
  useEffect(() => {
    const width = containerRef.current?.clientWidth || 800;
    const canvasHeight = typeof height === "number" ? height : containerRef.current?.clientHeight || 600;

    const oldNodes = simNodesRef.current;
    const oldMap = new Map(oldNodes.map((n) => [n.id, n]));

    const nextNodes = initialNodes.map((n, i) => {
      const existing = oldMap.get(n.id);
      if (existing) {
        // Keep smooth existing position and velocity
        return { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy };
      }
      // New node: seed radially
      const angle = (i / Math.max(initialNodes.length, 1)) * 2 * Math.PI;
      const dist = 60 + Math.random() * 140;
      return {
        ...n,
        x: n.x ?? width / 2 + Math.cos(angle) * dist,
        y: n.y ?? canvasHeight / 2 + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
      };
    });

    simNodesRef.current = nextNodes;
    simLinksRef.current = initialLinks;

    // Center camera ONLY on first mount
    if (!isInitializedRef.current) {
      transformRef.current = { x: 0, y: 0, k: 1 };
      setZoomLevel(100);
      isInitializedRef.current = true;
    }
  }, [initialNodes, initialLinks, height]);

  // Pulse animation kick (Animate button)
  const triggerAnimatePulse = useCallback(() => {
    for (const node of simNodesRef.current) {
      node.vx += (Math.random() - 0.5) * 6;
      node.vy += (Math.random() - 0.5) * 6;
    }
  }, []);

  // Main 60 FPS Physics and Rendering Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const runPhysicsTick = () => {
      const nodes = simNodesRef.current;
      const links = simLinksRef.current;
      const forces = forcesRef.current;
      if (forces.repelForceMult === undefined) return;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // 1. Repulsion between all node pairs (Coulomb force)
      const repelBase = forces.repelForceMult * 100;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 450) {
            const force = (repelBase / distSq) * 1.5;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (a !== draggingNodeRef.current) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (b !== draggingNodeRef.current) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }
      }

      // 2. Link spring attraction (Hooke's law)
      const desiredDist = forces.linkDistance;
      const springStiffness = 0.035 * forces.linkForceMult;
      for (const link of links) {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const springForce = (dist - desiredDist) * springStiffness;

        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        if (source !== draggingNodeRef.current) {
          source.vx += fx;
          source.vy += fy;
        }
        if (target !== draggingNodeRef.current) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // 3. Centering gravity pull
      const dpr = window.devicePixelRatio || 1;
      const centerX = canvas.width / dpr / 2;
      const centerY = canvas.height / dpr / 2;
      const centerFactor = 0.003 * forces.centerForceMult;

      for (const node of nodes) {
        if (node === draggingNodeRef.current) continue;

        node.vx += (centerX - node.x) * centerFactor;
        node.vy += (centerY - node.y) * centerFactor;

        // Friction damping (0.86)
        node.vx *= 0.86;
        node.vy *= 0.86;

        node.x += node.vx;
        node.y += node.vy;
      }
    };

    const render = () => {
      runPhysicsTick();

      const forces = forcesRef.current;
      const pal: Palette | undefined = forces.palette;
      if (!pal) {
        animId = requestAnimationFrame(render);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const mode: GraphColorMode = forces.colorMode;
      const statusColors: StatusColors = forces.statusColors;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply Pan & Zoom Transform
      const { x, y, k } = transformRef.current;
      ctx.scale(dpr, dpr);
      ctx.translate(x, y);
      ctx.scale(k, k);

      const nodes = simNodesRef.current;
      const links = simLinksRef.current;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      const statusOf = (n: GraphNode): NodeStatus => n.status ?? "ok";
      const fillFor = (n: GraphNode): string => {
        if (mode === "status") return statusColors[statusOf(n)];
        if (mode === "mono") return pal.accent;
        return forces.typeColors[n.type] || (DEFAULT_TYPE_COLORS[n.type] || DEFAULT_TYPE_COLORS.paper).fill;
      };

      // Active / Focused Node detection (Hovered or Selected)
      const hovered = hoveredNodeRef.current;
      const activeNode = hovered || (forces.selectedNodeId ? nodeMap.get(forces.selectedNodeId) : null);
      const activeNodeId = activeNode ? activeNode.id : null;

      // Calculate connected neighbors & links for active node
      const connectedNodeIds = new Set<string>();
      const connectedLinkIndices = new Set<number>();
      const nodeDegreeMap = new Map<string, number>();

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        nodeDegreeMap.set(link.source, (nodeDegreeMap.get(link.source) || 0) + 1);
        nodeDegreeMap.set(link.target, (nodeDegreeMap.get(link.target) || 0) + 1);

        if (activeNodeId) {
          if (link.source === activeNodeId) {
            connectedNodeIds.add(link.target);
            connectedLinkIndices.add(i);
          } else if (link.target === activeNodeId) {
            connectedNodeIds.add(link.source);
            connectedLinkIndices.add(i);
          }
        }
      }
      if (activeNodeId) connectedNodeIds.add(activeNodeId);

      // Search matching
      const searchLower = forces.searchQuery.toLowerCase().trim();
      const isSearchActive = searchLower.length > 0;

      // 1. Draw Links
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) continue;

        // Skip if either node's type is disabled
        if (forces.enabledTypes[source.type] === false || forces.enabledTypes[target.type] === false) continue;

        const isConnectedToActive = activeNodeId ? connectedLinkIndices.has(i) : false;
        const isDimmed = activeNodeId ? !isConnectedToActive : false;

        // base colour of the link
        let base = pal.linkNeutral;
        let weight = 1.2;
        if (mode === "status") {
          const sv = SEVERITY[statusOf(source)] >= SEVERITY[statusOf(target)] ? statusOf(source) : statusOf(target);
          if (sv !== "ok") {
            base = withAlpha(statusColors[sv], 0.85);
            weight = 1.8;
          }
        } else if (mode === "type" && forces.colorLinks && link.color) {
          base = link.color;
        }

        ctx.save();
        if (isDimmed) {
          ctx.strokeStyle = pal.linkDim;
          ctx.lineWidth = 0.8 * forces.linkThickness;
        } else if (isConnectedToActive) {
          ctx.strokeStyle = pal.accent;
          ctx.lineWidth = 2.4 * forces.linkThickness;
        } else {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = base;
          ctx.lineWidth = weight * forces.linkThickness;
        }

        if (link.dashed) ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Directional Arrowhead
        if (forces.showArrows && !isDimmed) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetR = ((DEFAULT_TYPE_COLORS[target.type]?.size || 32) / 2) * forces.nodeSize;
          const arrowX = target.x - (dx / dist) * (targetR + 4);
          const arrowY = target.y - (dy / dist) * (targetR + 4);
          const angle = Math.atan2(dy, dx);
          const arrowLen = 6 * forces.linkThickness;

          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(arrowX - arrowLen * Math.cos(angle - Math.PI / 6), arrowY - arrowLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(arrowX - arrowLen * Math.cos(angle + Math.PI / 6), arrowY - arrowLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }

        ctx.restore();
      }

      // 2. Draw Nodes
      for (const node of nodes) {
        if (forces.enabledTypes[node.type] === false) continue;
        if (forces.hideOrphans && (nodeDegreeMap.get(node.id) || 0) === 0) continue;

        const isActive = activeNodeId === node.id;
        const isConnected = activeNodeId ? connectedNodeIds.has(node.id) : false;
        const isDimmed = activeNodeId ? !isActive && !isConnected : false;
        const matchesSearch = isSearchActive ? node.label.toLowerCase().includes(searchLower) : true;

        ctx.save();
        ctx.globalAlpha = isDimmed || (!matchesSearch && isSearchActive) ? 0.12 : 1.0;

        const style = DEFAULT_TYPE_COLORS[node.type] || DEFAULT_TYPE_COLORS.paper;
        const baseSize = (style.size || 32) * forces.nodeSize;
        const currentSize = isActive ? baseSize + 6 : baseSize;
        const half = currentSize / 2;
        const cr = currentSize * 0.2; // corner radius
        const fill = isActive && mode !== "status" ? pal.accent : fillFor(node);

        // Glowing outer halo for active node
        if (isActive) {
          ctx.beginPath();
          ctx.roundRect(node.x - half - 8, node.y - half - 8, currentSize + 16, currentSize + 16, cr + 4);
          ctx.fillStyle = withAlpha(mode === "status" ? fill : pal.accent, 0.28);
          ctx.fill();
        }

        // Main node square
        ctx.beginPath();
        ctx.roundRect(node.x - half, node.y - half, currentSize, currentSize, cr);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.strokeStyle = isActive ? pal.text : isConnected ? pal.accent : shadeColor(fill, -0.3);
        ctx.lineWidth = isActive ? 2.5 : isConnected ? 2 : 1.2;
        ctx.stroke();

        // Icon inside the node (always readable on its own fill)
        ctx.fillStyle = inkOn(fill);
        ctx.font = `bold ${Math.round(currentSize * 0.38)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(style.icon || "◼", node.x, node.y);

        // Status badge (like the alert view): flagged nodes get a small "!" tag
        const st = statusOf(node);
        if (mode === "status" && st !== "ok") {
          const bx = node.x + half - 1;
          const by = node.y - half + 1;
          ctx.beginPath();
          ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.strokeStyle = "#161210";
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.fillStyle = "#161210";
          ctx.font = "bold 10px sans-serif";
          ctx.fillText("!", bx, by + 0.5);
        }

        // Label rendering
        const shouldShowLabel =
          isActive || isConnected || (isSearchActive && matchesSearch) || (!activeNodeId && k > 0.85 - forces.textFadeThreshold * 0.4);

        if (shouldShowLabel && !isDimmed) {
          const maxChars = isActive ? 45 : 24;
          const labelText = node.label.length > maxChars ? node.label.slice(0, maxChars) + "…" : node.label;

          ctx.font = isActive ? "bold 12px sans-serif" : "10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          const textY = node.y + half + 6;

          if (isActive) {
            const metrics = ctx.measureText(labelText);
            const pad = 6;
            const w = metrics.width + pad * 2;
            const h = 20;

            ctx.fillStyle = withAlpha(pal.bg, 0.94);
            ctx.strokeStyle = pal.accent;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(node.x - w / 2, textY - 2, w, h, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = pal.text;
            ctx.fillText(labelText, node.x, textY + 2);

            // why it is flagged (status view only), like the alert toast in the reference video
            if (mode === "status" && st !== "ok" && node.statusNote) {
              const note = node.statusNote;
              ctx.font = "bold 11px sans-serif";
              const nw = ctx.measureText(note).width + 14;
              const ny = textY + h + 4;
              ctx.fillStyle = statusColors[st];
              ctx.beginPath();
              ctx.roundRect(node.x - nw / 2, ny, nw, 20, 10);
              ctx.fill();
              ctx.fillStyle = inkOn(statusColors[st]);
              ctx.textBaseline = "middle";
              ctx.fillText(note, node.x, ny + 10.5);
            }
          } else {
            ctx.strokeStyle = pal.halo;
            ctx.lineWidth = 2.5;
            ctx.strokeText(labelText, node.x, textY);
            ctx.fillStyle = isConnected ? pal.text : pal.muted;
            ctx.fillText(labelText, node.x, textY);
          }
        }

        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Screen to world coordinates
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { x, y, k } = transformRef.current;
    return { x: (clientX - rect.left - x) / k, y: (clientY - rect.top - y) / k };
  }, []);

  const getNodeAt = useCallback((worldX: number, worldY: number) => {
    const nodes = simNodesRef.current;
    const nSize = forcesRef.current.nodeSize ?? 1;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (forcesRef.current.enabledTypes?.[n.type] === false) continue;
      // hit area = the square that is actually drawn (+ a little slack)
      const r = ((DEFAULT_TYPE_COLORS[n.type]?.size || 32) / 2) * nSize + 4;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }, []);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const clickedNode = getNodeAt(worldPos.x, worldPos.y);

    mouseDownPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    hasDraggedRef.current = false;

    if (clickedNode) {
      draggingNodeRef.current = clickedNode;
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
    const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
    if (dx > 4 || dy > 4) hasDraggedRef.current = true;

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (draggingNodeRef.current) {
      draggingNodeRef.current.x = worldPos.x;
      draggingNodeRef.current.y = worldPos.y;
      draggingNodeRef.current.vx = 0;
      draggingNodeRef.current.vy = 0;
    } else if (isPanningRef.current) {
      transformRef.current.x += e.clientX - panStartRef.current.x;
      transformRef.current.y += e.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const hoveredNode = getNodeAt(worldPos.x, worldPos.y);
      hoveredNodeRef.current = hoveredNode;
      if (canvasRef.current) canvasRef.current.style.cursor = hoveredNode ? "pointer" : "grab";
    }
  };

  const handleMouseUp = () => {
    const wasDragging = hasDraggedRef.current;
    const clickedNode = draggingNodeRef.current;

    draggingNodeRef.current = null;
    isPanningRef.current = false;

    // Only fire click when not actively dragging
    if (clickedNode && !wasDragging && onNodeClick) onNodeClick(clickedNode);

    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const currentK = transformRef.current.k;
    const newK = Math.min(Math.max(currentK * zoomFactor, 0.2), 4.0);

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newK / currentK);
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newK / currentK);
    transformRef.current.k = newK;

    setZoomLevel(Math.round(newK * 100));
  };

  const handleRecenter = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    setZoomLevel(100);
  };

  const toggleSection = (sec: keyof typeof openSections) => setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));

  // ── What is in the graph right now (for the legend and the colour pickers) ──
  const presentTypes = useMemo(() => {
    const seen: string[] = [];
    for (const n of initialNodes) if (!seen.includes(n.type)) seen.push(n.type);
    return seen;
  }, [initialNodes]);
  const statusCounts = useMemo(() => {
    const c: Record<NodeStatus, number> = { alert: 0, warn: 0, ok: 0 };
    for (const n of initialNodes) c[n.status ?? "ok"]++;
    return c;
  }, [initialNodes]);
  const typeColor = (t: string) => typeColors[t] || (DEFAULT_TYPE_COLORS[t] || DEFAULT_TYPE_COLORS.paper).fill;

  const resetColors = () => {
    setTypeColors({});
    setStatusColors({ ...DEFAULT_STATUS_COLORS });
    setColorMode(DEFAULT_GRAPH_SETTINGS.colorMode);
    setColorLinks(DEFAULT_GRAPH_SETTINGS.colorLinks);
  };

  const p = palette;
  const btnBase: React.CSSProperties = {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    backgroundColor: p.ui,
    border: `1px solid ${p.uiBorder}`,
    color: p.uiText,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    transition: "all 0.15s ease",
  };

  const sectionHead = (key: keyof typeof openSections, title: string, hint: string) => (
    <div
      onClick={() => toggleSection(key)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontWeight: 600, fontSize: "13px", marginBottom: openSections[key] ? "10px" : 0 }}
    >
      <span>
        {openSections[key] ? "▾" : "▸"} {title}
      </span>
      <span style={{ fontSize: "11px", color: p.uiMuted, fontWeight: 500 }}>{hint}</span>
    </div>
  );
  const divider = `1px solid ${p.uiBorder}`;

  const legendRows =
    colorMode === "type"
      ? presentTypes.map((t) => ({
          key: t,
          color: typeColor(t),
          label: (DEFAULT_TYPE_COLORS[t]?.label || t).replace("_", " "),
          count: initialNodes.filter((n) => n.type === t).length,
          off: enabledTypes[t] === false,
          toggle: () => setEnabledTypes((prev) => ({ ...prev, [t]: prev[t] === false })),
        }))
      : colorMode === "status"
      ? (["alert", "warn", "ok"] as NodeStatus[]).map((s) => ({ key: s, color: statusColors[s], label: labels[s], count: statusCounts[s], off: false, toggle: undefined as undefined | (() => void) }))
      : [];

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: p.bg,
        borderRadius: "8px",
        border: `1px solid ${p.uiBorder}`,
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {/* Floating Action Buttons Top-Right */}
      <div style={{ position: "absolute", top: "14px", right: "14px", display: "flex", gap: "8px", zIndex: 40 }}>
        <button onClick={triggerAnimatePulse} title="Pulse Animate (Kick Physics)" style={btnBase}>
          ⚡
        </button>
        <button onClick={handleRecenter} title="Recenter Camera" style={btnBase}>
          🎯
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          title="Graph Settings"
          style={{ ...btnBase, backgroundColor: showSettings ? p.accent : p.ui, color: showSettings ? inkOn(p.accent) : p.uiText }}
        >
          ⚙️
        </button>
      </div>

      {/* Legend, bottom-left */}
      {legendRows.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: "16px",
            bottom: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "8px 12px",
            borderRadius: "8px",
            backgroundColor: withAlpha(p.ui, 0.92),
            border: `1px solid ${p.uiBorder}`,
            color: p.uiText,
            fontSize: "11.5px",
            zIndex: 35,
            minWidth: "140px",
          }}
        >
          {legendRows.map((r) => (
            <button
              key={r.key}
              onClick={r.toggle}
              disabled={!r.toggle}
              title={r.toggle ? "Click to show / hide" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                border: "none",
                background: "none",
                padding: "1px 0",
                color: "inherit",
                font: "inherit",
                textAlign: "left",
                cursor: r.toggle ? "pointer" : "default",
                opacity: r.off ? 0.45 : 1,
              }}
            >
              <span style={{ width: "11px", height: "11px", borderRadius: "3px", background: r.color, border: `1px solid ${shadeColor(r.color, -0.3)}`, flexShrink: 0 }} />
              <span style={{ flex: 1, textTransform: "capitalize", textDecoration: r.off ? "line-through" : "none" }}>{r.label}</span>
              <span style={{ color: p.uiMuted, fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Floating Zoom HUD Bottom-Right */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          right: "16px",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          backgroundColor: withAlpha(p.ui, 0.92),
          backdropFilter: "blur(6px)",
          padding: "6px 12px",
          borderRadius: "8px",
          border: `1px solid ${p.uiBorder}`,
          fontSize: "12px",
          color: p.uiText,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          zIndex: 35,
        }}
      >
        <button
          onClick={() => {
            const newK = Math.max(transformRef.current.k * 0.85, 0.2);
            transformRef.current.k = newK;
            setZoomLevel(Math.round(newK * 100));
          }}
          aria-label="Zoom out"
          style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}
        >
          −
        </button>
        <span style={{ minWidth: "40px", textAlign: "center", fontWeight: 600 }}>{zoomLevel}%</span>
        <button
          onClick={() => {
            const newK = Math.min(transformRef.current.k * 1.15, 4.0);
            transformRef.current.k = newK;
            setZoomLevel(Math.round(newK * 100));
          }}
          aria-label="Zoom in"
          style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}
        >
          +
        </button>
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <div
          style={{
            position: "absolute",
            top: "58px",
            right: "14px",
            width: "330px",
            maxHeight: "calc(100% - 80px)",
            backgroundColor: withAlpha(p.ui, 0.97),
            backdropFilter: "blur(12px)",
            border: `1px solid ${p.uiBorder}`,
            borderRadius: "10px",
            boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
            zIndex: 50,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            color: p.uiText,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.5px" }}>Graph Settings</div>
            <button onClick={() => setShowSettings(false)} aria-label="Close settings" style={{ border: "none", background: "none", color: p.uiMuted, cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Colors */}
          <div style={{ borderBottom: divider, paddingBottom: "12px" }}>
            {sectionHead("colors", "Colors", "Palette & status")}
            {openSections.colors && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: p.uiMuted, textTransform: "uppercase", marginBottom: "5px" }}>Color nodes</div>
                  <Seg p={p} value={colorMode} options={MODE_LABELS} onChange={setColorMode} />
                  <div style={{ fontSize: "11px", color: p.uiMuted, marginTop: "6px", lineHeight: 1.45 }}>
                    {colorMode === "type" && "Each kind of node gets its own color."}
                    {colorMode === "status" && "Everything that is fine turns gray; what needs a look is yellow or red and gets a “!” tag."}
                    {colorMode === "mono" && "One color for everything, the shapes tell the types apart."}
                  </div>
                </div>

                {colorMode === "type" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {presentTypes.map((t) => (
                      <ColorRow p={p}
                        key={t}
                        label={DEFAULT_TYPE_COLORS[t]?.label || t}
                        value={typeColor(t)}
                        isDefault={!typeColors[t]}
                        onPick={(v) => setTypeColors((prev) => ({ ...prev, [t]: v }))}
                        onReset={() =>
                          setTypeColors((prev) => {
                            const next = { ...prev };
                            delete next[t];
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                )}

                {colorMode === "status" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {(["alert", "warn", "ok"] as NodeStatus[]).map((s) => (
                      <ColorRow p={p}
                        key={s}
                        label={labels[s]}
                        value={statusColors[s]}
                        isDefault={statusColors[s] === DEFAULT_STATUS_COLORS[s]}
                        onPick={(v) => setStatusColors((prev) => ({ ...prev, [s]: v }))}
                        onReset={() => setStatusColors((prev) => ({ ...prev, [s]: DEFAULT_STATUS_COLORS[s] }))}
                      />
                    ))}
                  </div>
                )}

                {colorMode === "type" && <Check p={p} label="Color links by relationship" checked={colorLinks} onChange={setColorLinks} />}

                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: p.uiMuted, textTransform: "uppercase", marginBottom: "5px" }}>Background</div>
                  <Seg p={p} value={background} options={BG_LABELS} onChange={setBackground} />
                </div>

                <button
                  onClick={resetColors}
                  style={{ padding: "6px", background: "transparent", color: p.uiMuted, border: `1px dashed ${p.uiBorder}`, borderRadius: "6px", fontSize: "11px", cursor: "pointer" }}
                >
                  ↺ Reset colors
                </button>
              </div>
            )}
          </div>

          {/* Filters */}
          <div style={{ borderBottom: divider, paddingBottom: "12px" }}>
            {sectionHead("filters", "Filters", "Nodes")}
            {openSections.filters && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <input
                  type="text"
                  placeholder="Search nodes…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${p.uiBorder}`, backgroundColor: p.field, color: p.uiText, fontSize: "12px", outline: "none", boxSizing: "border-box" }}
                />
                <Check p={p} label="Hide Orphans" checked={hideOrphans} onChange={setHideOrphans} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: p.uiMuted, textTransform: "uppercase" }}>Node Types</div>
                  {Object.keys(enabledTypes).map((typeKey) => (
                    <label key={typeKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", cursor: "pointer", textTransform: "capitalize" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "9px", height: "9px", borderRadius: "50%", backgroundColor: typeColor(typeKey) }} />
                        {typeKey.replace("_", " ")}
                      </span>
                      <input
                        type="checkbox"
                        checked={enabledTypes[typeKey]}
                        onChange={(e) => setEnabledTypes((prev) => ({ ...prev, [typeKey]: e.target.checked }))}
                        style={{ cursor: "pointer", accentColor: p.accent }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Display */}
          <div style={{ borderBottom: divider, paddingBottom: "12px" }}>
            {sectionHead("display", "Display", "Aesthetics")}
            {openSections.display && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Check p={p} label="Arrows" checked={showArrows} onChange={setShowArrows} />
                <Slider p={p} label="Text fade threshold" value={textFadeThreshold} min={-1} max={1.5} step={0.05} onChange={setTextFadeThreshold} />
                <Slider p={p} label="Node size" value={nodeSize} min={0.4} max={2.5} step={0.05} onChange={setNodeSize} />
                <Slider p={p} label="Link thickness" value={linkThickness} min={0.4} max={3} step={0.05} onChange={setLinkThickness} />
                <button
                  onClick={triggerAnimatePulse}
                  style={{ marginTop: "4px", padding: "8px", backgroundColor: p.field, color: p.uiText, border: `1px solid ${p.uiBorder}`, borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  ⚡ Animate Pulse
                </button>
              </div>
            )}
          </div>

          {/* Forces */}
          <div>
            {sectionHead("forces", "Forces", "Physics")}
            {openSections.forces && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Slider p={p} label="Center force" value={centerForceMult} min={0.1} max={2.5} step={0.05} onChange={setCenterForceMult} />
                <Slider p={p} label="Repel force" value={repelForceMult} min={2} max={25} step={0.5} onChange={setRepelForceMult} />
                <Slider p={p} label="Link force" value={linkForceMult} min={0.2} max={2.5} step={0.05} onChange={setLinkForceMult} />
                <Slider p={p} label="Link distance" value={linkDistance} min={30} max={280} step={5} onChange={(v) => setLinkDistance(Math.round(v))} digits={0} />
                <button
                  onClick={() => {
                    const d = DEFAULT_GRAPH_SETTINGS;
                    setBackground(d.background);
                    setColorMode(d.colorMode);
                    setTypeColors({});
                    setStatusColors({ ...DEFAULT_STATUS_COLORS });
                    setColorLinks(d.colorLinks);
                    setShowArrows(d.showArrows);
                    setTextFadeThreshold(d.textFadeThreshold);
                    setNodeSize(d.nodeSize);
                    setLinkThickness(d.linkThickness);
                    setCenterForceMult(d.centerForceMult);
                    setRepelForceMult(d.repelForceMult);
                    setLinkForceMult(d.linkForceMult);
                    setLinkDistance(d.linkDistance);
                    setHideOrphans(d.hideOrphans);
                    setEnabledTypes(d.enabledTypes);
                  }}
                  style={{ marginTop: "6px", padding: "6px", backgroundColor: "transparent", color: p.uiMuted, border: `1px dashed ${p.uiBorder}`, borderRadius: "6px", fontSize: "11px", cursor: "pointer" }}
                >
                  ↺ Reset everything to defaults
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
