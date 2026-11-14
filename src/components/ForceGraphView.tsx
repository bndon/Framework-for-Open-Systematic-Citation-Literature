import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { loadGraphSettings, saveGraphSettings, DEFAULT_GRAPH_SETTINGS } from "../lib/settings";

export interface GraphNode {
  id: string;
  label: string;
  type: "collection" | "paper" | "claim" | "center" | "reference" | "cited_by" | string;
  radius?: number;
  color?: string;
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
  theme?: "dark" | "light";
}

const TYPE_COLORS: Record<string, { fill: string; stroke: string; radius: number }> = {
  collection: { fill: "#A855F7", stroke: "#7E22CE", radius: 22 },
  paper:      { fill: "#3B82F6", stroke: "#1D4ED8", radius: 16 },
  claim:      { fill: "#10B981", stroke: "#047857", radius: 14 },
  center:     { fill: "#E05666", stroke: "#BE123C", radius: 24 },
  reference:  { fill: "#6366F1", stroke: "#4338CA", radius: 15 },
  cited_by:   { fill: "#EC4899", stroke: "#BE185D", radius: 15 },
};

export const ForceGraphView: React.FC<ForceGraphViewProps> = ({
  nodes: initialNodes,
  links: initialLinks,
  selectedNodeId = null,
  onNodeClick,
  height = "600px",
  theme: initialTheme = "dark",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Settings State (Loaded and Saved with Persistence)
  const initialSettings = useRef(loadGraphSettings()).current;

  const [theme, setTheme] = useState<"dark" | "light">(initialSettings.theme || initialTheme);
  const [showSettings, setShowSettings] = useState(false);
  const [openSections, setOpenSections] = useState({ filters: true, display: true, forces: true });

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
      theme,
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
    theme,
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
  const forcesRef = useRef({
    centerForceMult,
    repelForceMult,
    linkForceMult,
    linkDistance,
    showArrows,
    textFadeThreshold,
    nodeSize,
    linkThickness,
    theme,
    searchQuery,
    hideOrphans,
    enabledTypes,
    selectedNodeId,
  });

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
      theme,
      searchQuery,
      hideOrphans,
      enabledTypes,
      selectedNodeId,
    };
  });

  // 1. Sync simulation nodes smoothly WITHOUT resetting positions or camera
  useEffect(() => {
    const width = containerRef.current?.clientWidth || 800;
    const canvasHeight = typeof height === "number" ? height : (containerRef.current?.clientHeight || 600);

    const oldNodes = simNodesRef.current;
    const oldMap = new Map(oldNodes.map((n) => [n.id, n]));

    const nextNodes = initialNodes.map((n, i) => {
      const existing = oldMap.get(n.id);
      if (existing) {
        // Keep smooth existing position and velocity
        return {
          ...n,
          x: existing.x,
          y: existing.y,
          vx: existing.vx,
          vy: existing.vy,
        };
      }
      // New node: seed radially
      const angle = (i / Math.max(initialNodes.length, 1)) * 2 * Math.PI;
      const dist = 60 + Math.random() * 140;
      return {
        ...n,
        x: n.x ?? (width / 2 + Math.cos(angle) * dist),
        y: n.y ?? (canvasHeight / 2 + Math.sin(angle) * dist),
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
    const nodes = simNodesRef.current;
    for (const node of nodes) {
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
      const centerX = (canvas.width / dpr) / 2;
      const centerY = (canvas.height / dpr) / 2;
      const centerFactor = 0.003 * forces.centerForceMult;

      for (const node of nodes) {
        if (node === draggingNodeRef.current) continue;

        const cdx = centerX - node.x;
        const cdy = centerY - node.y;
        node.vx += cdx * centerFactor;
        node.vy += cdy * centerFactor;

        // Friction damping (0.86)
        node.vx *= 0.86;
        node.vy *= 0.86;

        node.x += node.vx;
        node.y += node.vy;
      }
    };

    const render = () => {
      runPhysicsTick();

      const dpr = window.devicePixelRatio || 1;
      const forces = forcesRef.current;
      const isDark = forces.theme === "dark";

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background color
      ctx.fillStyle = isDark ? "#111216" : "#FAF7F2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply Pan & Zoom Transform
      const { x, y, k } = transformRef.current;
      ctx.scale(dpr, dpr);
      ctx.translate(x, y);
      ctx.scale(k, k);

      const nodes = simNodesRef.current;
      const links = simLinksRef.current;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

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
      if (activeNodeId) {
        connectedNodeIds.add(activeNodeId);
      }

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

        ctx.save();
        if (isDimmed) {
          ctx.globalAlpha = 0.04;
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(74,36,24,0.08)";
          ctx.lineWidth = 0.8 * forces.linkThickness;
        } else if (isConnectedToActive) {
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = "#E05666"; // Crimson Obsidian feedback
          ctx.lineWidth = 2.4 * forces.linkThickness;
        } else {
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = link.color || (isDark ? "rgba(255,255,255,0.18)" : "rgba(74,36,24,0.18)");
          ctx.lineWidth = 1.2 * forces.linkThickness;
        }

        if (link.dashed) {
          ctx.setLineDash([4, 4]);
        }

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Directional Arrowhead (Obsidian Display setting)
        if (forces.showArrows && (!isDimmed || isConnectedToActive)) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetR = (target.radius || 16) * forces.nodeSize;
          const arrowX = target.x - (dx / dist) * (targetR + 4);
          const arrowY = target.y - (dy / dist) * (targetR + 4);
          const angle = Math.atan2(dy, dx);
          const arrowLen = 6 * forces.linkThickness;

          ctx.beginPath();
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(
            arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
            arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
            arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }

        ctx.restore();
      }

      // 2. Draw Nodes
      for (const node of nodes) {
        // Filter by enabled types
        if (forces.enabledTypes[node.type] === false) continue;

        // Filter orphans
        if (forces.hideOrphans && (nodeDegreeMap.get(node.id) || 0) === 0) continue;

        const isActive = activeNodeId === node.id;
        const isConnected = activeNodeId ? connectedNodeIds.has(node.id) : false;
        const isDimmed = activeNodeId ? (!isActive && !isConnected) : false;

        const matchesSearch = isSearchActive ? node.label.toLowerCase().includes(searchLower) : true;

        ctx.save();
        if (isDimmed || (!matchesSearch && isSearchActive)) {
          ctx.globalAlpha = 0.12;
        } else {
          ctx.globalAlpha = 1.0;
        }

        const style = TYPE_COLORS[node.type] || TYPE_COLORS.paper;
        const baseRadius = (node.radius || style.radius) * forces.nodeSize;
        const currentRadius = isActive ? baseRadius + 3 : baseRadius;

        // Glowing outer halo for active node
        if (isActive) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, currentRadius + 8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(224, 86, 102, 0.32)";
          ctx.fill();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? "#E05666" : (node.color || style.fill);
        ctx.fill();

        ctx.strokeStyle = isActive
          ? "#FFFFFF"
          : isConnected
          ? "#E05666"
          : style.stroke || (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)");
        ctx.lineWidth = isActive ? 2.5 : isConnected ? 2 : 1.2;
        ctx.stroke();

        // Label rendering
        const shouldShowLabel =
          isActive ||
          isConnected ||
          (isSearchActive && matchesSearch) ||
          (!activeNodeId && (k > (0.85 - forces.textFadeThreshold * 0.4)));

        if (shouldShowLabel && !isDimmed) {
          const maxChars = isActive ? 45 : 24;
          const labelText =
            node.label.length > maxChars ? node.label.slice(0, maxChars) + "…" : node.label;

          ctx.font = isActive ? "bold 12px sans-serif" : "10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          const textY = node.y + currentRadius + 6;

          if (isActive) {
            // Obsidian dark pill badge
            const metrics = ctx.measureText(labelText);
            const pad = 6;
            const w = metrics.width + pad * 2;
            const h = 20;

            ctx.fillStyle = isDark ? "rgba(18, 18, 24, 0.92)" : "rgba(250, 245, 236, 0.96)";
            ctx.strokeStyle = "#E05666";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(node.x - w / 2, textY - 2, w, h, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isDark ? "#FFFFFF" : "#1A1A1A";
            ctx.fillText(labelText, node.x, textY + 2);
          } else {
            // Subtitle outline
            ctx.strokeStyle = isDark ? "rgba(17, 18, 22, 0.8)" : "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = 2.5;
            ctx.strokeText(labelText, node.x, textY);

            ctx.fillStyle = isConnected ? (isDark ? "#FFFFFF" : "#4A2418") : (isDark ? "#94A3B8" : "#4A2418");
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
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const { x, y, k } = transformRef.current;
    return {
      x: (screenX - x) / k,
      y: (screenY - y) / k,
    };
  }, []);

  const getNodeAt = useCallback(
    (worldX: number, worldY: number) => {
      const nodes = simNodesRef.current;
      const nSize = forcesRef.current.nodeSize;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (forcesRef.current.enabledTypes[n.type] === false) continue;
        const r = ((n.radius || TYPE_COLORS[n.type]?.radius || 16) * nSize) + 5;
        const dx = worldX - n.x;
        const dy = worldY - n.y;
        if (dx * dx + dy * dy <= r * r) {
          return n;
        }
      }
      return null;
    },
    []
  );

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
    if (dx > 4 || dy > 4) {
      hasDraggedRef.current = true;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (draggingNodeRef.current) {
      draggingNodeRef.current.x = worldPos.x;
      draggingNodeRef.current.y = worldPos.y;
      draggingNodeRef.current.vx = 0;
      draggingNodeRef.current.vy = 0;
    } else if (isPanningRef.current) {
      const panDx = e.clientX - panStartRef.current.x;
      const panDy = e.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      transformRef.current.x += panDx;
      transformRef.current.y += panDy;
    } else {
      const hovered = getNodeAt(worldPos.x, worldPos.y);
      hoveredNodeRef.current = hovered;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hovered ? "pointer" : "grab";
      }
    }
  };

  const handleMouseUp = () => {
    const wasDragging = hasDraggedRef.current;
    const clickedNode = draggingNodeRef.current;

    draggingNodeRef.current = null;
    isPanningRef.current = false;

    // Only fire click when not actively dragging
    if (clickedNode && !wasDragging && onNodeClick) {
      onNodeClick(clickedNode);
    }

    if (canvasRef.current) {
      canvasRef.current.style.cursor = "grab";
    }
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

  const toggleSection = (sec: "filters" | "display" | "forces") => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const isDark = theme === "dark";

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: isDark ? "#111216" : "#FAF7F2",
        borderRadius: "8px",
        border: isDark ? "1px solid #2D3139" : "1px solid #EADDCB",
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

      {/* Floating Action Buttons Top-Right (Obsidian Style) */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          right: "14px",
          display: "flex",
          gap: "8px",
          zIndex: 40,
        }}
      >
        <button
          onClick={triggerAnimatePulse}
          title="Pulse Animate (Kick Physics)"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: isDark ? "#1E2028" : "#FFFFFF",
            border: isDark ? "1px solid #3B404D" : "1px solid #D5C8B8",
            color: isDark ? "#E2E8F0" : "#4A2418",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            transition: "all 0.15s ease",
          }}
        >
          ⚡
        </button>

        <button
          onClick={handleRecenter}
          title="Recenter Camera"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: isDark ? "#1E2028" : "#FFFFFF",
            border: isDark ? "1px solid #3B404D" : "1px solid #D5C8B8",
            color: isDark ? "#E2E8F0" : "#4A2418",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            transition: "all 0.15s ease",
          }}
        >
          🎯
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          title="Graph Settings"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: showSettings ? "#E05666" : isDark ? "#1E2028" : "#FFFFFF",
            border: isDark ? "1px solid #3B404D" : "1px solid #D5C8B8",
            color: showSettings ? "#FFFFFF" : isDark ? "#E2E8F0" : "#4A2418",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            transition: "all 0.15s ease",
          }}
        >
          ⚙️
        </button>
      </div>

      {/* Floating Zoom HUD Bottom-Right */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          right: "16px",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          backgroundColor: isDark ? "rgba(24, 26, 32, 0.88)" : "rgba(255,255,255,0.92)",
          backdropFilter: "blur(6px)",
          padding: "6px 12px",
          borderRadius: "8px",
          border: isDark ? "1px solid #374151" : "1px solid #D5C8B8",
          fontSize: "12px",
          color: isDark ? "#F3F4F6" : "#4A2418",
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
          style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}
        >
          +
        </button>
      </div>

      {/* Obsidian-Style Settings Drawer (Exact replica of Video 2) */}
      {showSettings && (
        <div
          style={{
            position: "absolute",
            top: "58px",
            right: "14px",
            width: "320px",
            maxHeight: "calc(100% - 80px)",
            backgroundColor: isDark ? "rgba(22, 24, 30, 0.95)" : "rgba(255, 255, 255, 0.96)",
            backdropFilter: "blur(12px)",
            border: isDark ? "1px solid #3B404D" : "1px solid #D5C8B8",
            borderRadius: "10px",
            boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
            zIndex: 50,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            color: isDark ? "#E2E8F0" : "#4A2418",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.5px" }}>Graph Settings</div>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                border: "none",
                background: "none",
                color: isDark ? "#94A3B8" : "#7A6458",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Section: Filters */}
          <div style={{ borderBottom: isDark ? "1px solid #2D3139" : "1px solid #EADDCB", paddingBottom: "12px" }}>
            <div
              onClick={() => toggleSection("filters")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                marginBottom: openSections.filters ? "10px" : 0,
              }}
            >
              <span>{openSections.filters ? "▾" : "▸"} Filters</span>
              <span style={{ fontSize: "11px", color: isDark ? "#64748B" : "#9E8B7F" }}>Nodes</span>
            </div>

            {openSections.filters && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Search files input */}
                <div>
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: isDark ? "1px solid #374151" : "1px solid #D5C8B8",
                      backgroundColor: isDark ? "#181A20" : "#FAF7F2",
                      color: isDark ? "#F3F4F6" : "#4A2418",
                      fontSize: "12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Hide Orphans Toggle */}
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", cursor: "pointer" }}>
                  <span>Hide Orphans</span>
                  <input
                    type="checkbox"
                    checked={hideOrphans}
                    onChange={(e) => setHideOrphans(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#E05666" }}
                  />
                </label>

                {/* Node Types Toggles */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: isDark ? "#94A3B8" : "#7A6458", textTransform: "uppercase" }}>
                    Node Types
                  </div>
                  {Object.keys(enabledTypes).map((typeKey) => (
                    <label
                      key={typeKey}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: TYPE_COLORS[typeKey]?.fill || "#3B82F6",
                          }}
                        />
                        {typeKey.replace("_", " ")}
                      </span>
                      <input
                        type="checkbox"
                        checked={enabledTypes[typeKey]}
                        onChange={(e) =>
                          setEnabledTypes((prev) => ({ ...prev, [typeKey]: e.target.checked }))
                        }
                        style={{ cursor: "pointer", accentColor: "#E05666" }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Display */}
          <div style={{ borderBottom: isDark ? "1px solid #2D3139" : "1px solid #EADDCB", paddingBottom: "12px" }}>
            <div
              onClick={() => toggleSection("display")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                marginBottom: openSections.display ? "10px" : 0,
              }}
            >
              <span>{openSections.display ? "▾" : "▸"} Display</span>
              <span style={{ fontSize: "11px", color: isDark ? "#64748B" : "#9E8B7F" }}>Aesthetics</span>
            </div>

            {openSections.display && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Theme Switcher */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <span>Theme</span>
                  <button
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: isDark ? "1px solid #374151" : "1px solid #D5C8B8",
                      backgroundColor: isDark ? "#282C34" : "#FAF5EC",
                      color: isDark ? "#E2E8F0" : "#4A2418",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {isDark ? "🌙 Dark (Obsidian)" : "☀️ Cream (Parchment)"}
                  </button>
                </div>

                {/* Arrows Toggle */}
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", cursor: "pointer" }}>
                  <span>Arrows</span>
                  <input
                    type="checkbox"
                    checked={showArrows}
                    onChange={(e) => setShowArrows(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#E05666" }}
                  />
                </label>

                {/* Text fade threshold Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Text fade threshold</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{textFadeThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.5"
                    step="0.05"
                    value={textFadeThreshold}
                    onChange={(e) => setTextFadeThreshold(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                {/* Node size Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Node size</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{nodeSize.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="2.5"
                    step="0.05"
                    value={nodeSize}
                    onChange={(e) => setNodeSize(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                {/* Link thickness Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Link thickness</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{linkThickness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="3.0"
                    step="0.05"
                    value={linkThickness}
                    onChange={(e) => setLinkThickness(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                <button
                  onClick={triggerAnimatePulse}
                  style={{
                    marginTop: "4px",
                    padding: "8px",
                    backgroundColor: isDark ? "#282C34" : "#EADDCB",
                    color: isDark ? "#F3F4F6" : "#4A2418",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ⚡ Animate Pulse
                </button>
              </div>
            )}
          </div>

          {/* Section: Forces */}
          <div>
            <div
              onClick={() => toggleSection("forces")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                marginBottom: openSections.forces ? "10px" : 0,
              }}
            >
              <span>{openSections.forces ? "▾" : "▸"} Forces</span>
              <span style={{ fontSize: "11px", color: isDark ? "#64748B" : "#9E8B7F" }}>Physics</span>
            </div>

            {openSections.forces && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Center force */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Center force</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{centerForceMult.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.5"
                    step="0.05"
                    value={centerForceMult}
                    onChange={(e) => setCenterForceMult(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                {/* Repel force */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Repel force</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{repelForceMult.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="2.0"
                    max="25.0"
                    step="0.5"
                    value={repelForceMult}
                    onChange={(e) => setRepelForceMult(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                {/* Link force */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Link force</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{linkForceMult.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="2.5"
                    step="0.05"
                    value={linkForceMult}
                    onChange={(e) => setLinkForceMult(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                {/* Link distance */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Link distance</span>
                    <span style={{ color: isDark ? "#94A3B8" : "#7A6458" }}>{linkDistance}</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="280"
                    step="5"
                    value={linkDistance}
                    onChange={(e) => setLinkDistance(parseInt(e.target.value, 10))}
                    style={{ width: "100%", accentColor: "#E05666" }}
                  />
                </div>

                {/* Reset Forces Button */}
                <button
                  onClick={() => {
                    const d = DEFAULT_GRAPH_SETTINGS;
                    setTheme(d.theme);
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
                    saveGraphSettings(d);
                  }}
                  style={{
                    marginTop: "6px",
                    padding: "6px",
                    backgroundColor: "transparent",
                    color: isDark ? "#94A3B8" : "#7A6458",
                    border: isDark ? "1px dashed #374151" : "1px dashed #D5C8B8",
                    borderRadius: "6px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  ↺ Reset to Defaults
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
