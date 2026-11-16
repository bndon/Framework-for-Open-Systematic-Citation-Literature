/**
 * Persistent Settings Manager for FOSCL
 * Automatically persists settings in localStorage with schema-safe fallback defaults.
 */

// ---------------------------------------------------------------------------
// 1. Graph / Tree Visualization Settings
// ---------------------------------------------------------------------------
export interface GraphSettings {
  theme: "dark" | "light";
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  linkThickness: number;
  centerForceMult: number;
  repelForceMult: number;
  linkForceMult: number;
  linkDistance: number;
  hideOrphans: boolean;
  enabledTypes: Record<string, boolean>;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  theme: "dark",
  showArrows: true,
  textFadeThreshold: 0.0,
  nodeSize: 1.0,
  linkThickness: 1.0,
  centerForceMult: 1.0,
  repelForceMult: 12.0,
  linkForceMult: 1.0,
  linkDistance: 110,
  hideOrphans: false,
  enabledTypes: {
    collection: true,
    paper: true,
    claim: true,
    center: true,
    reference: true,
    cited_by: true,
  },
};

const GRAPH_SETTINGS_KEY = "foscl:graph_settings";

export function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(GRAPH_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_GRAPH_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GRAPH_SETTINGS,
      ...parsed,
      enabledTypes: {
        ...DEFAULT_GRAPH_SETTINGS.enabledTypes,
        ...(parsed.enabledTypes || {}),
      },
    };
  } catch {
    return { ...DEFAULT_GRAPH_SETTINGS };
  }
}

export function saveGraphSettings(settings: Partial<GraphSettings>): GraphSettings {
  try {
    const current = loadGraphSettings();
    const updated: GraphSettings = {
      ...current,
      ...settings,
      enabledTypes: {
        ...current.enabledTypes,
        ...(settings.enabledTypes || {}),
      },
    };
    localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to save graph settings:", err);
    return { ...DEFAULT_GRAPH_SETTINGS, ...settings };
  }
}

// ---------------------------------------------------------------------------
// 2. Sidebar Settings
// ---------------------------------------------------------------------------
const SIDEBAR_COLLAPSED_KEY = "foscl:sidebar_collapsed";

export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "true" : "false");
  } catch (err) {
    console.error("Failed to save sidebar collapsed state:", err);
  }
}

// ---------------------------------------------------------------------------
// 3. Reader Settings
// ---------------------------------------------------------------------------
export interface ReaderSettings {
  scale: number;
  darkMode: boolean;
  highlightColor: string;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  scale: 1.25,
  darkMode: false,
  highlightColor: "#FFEB3B",
};

const READER_SETTINGS_KEY = "foscl:reader_settings";

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_READER_SETTINGS };
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_READER_SETTINGS };
  }
}

export function saveReaderSettings(settings: Partial<ReaderSettings>): ReaderSettings {
  try {
    const current = loadReaderSettings();
    const updated: ReaderSettings = { ...current, ...settings };
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to save reader settings:", err);
    return { ...DEFAULT_READER_SETTINGS, ...settings };
  }
}


// ---------------------------------------------------------------------------
// 4. App Theme Settings
// ---------------------------------------------------------------------------
export type AppTheme =
  | "night"
  | "cream"
  | "sepia"
  | "dusk"
  | "mint"
  | "citrus"
  | "navy"
  | "forest"
  | "stone"
  | "plum";

const APP_THEME_KEY = "foscl:app_theme";

export function loadAppTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(APP_THEME_KEY);
    if (raw && ["night","cream","sepia","dusk","mint","citrus","navy","forest","stone","plum"].includes(raw)) {
      return raw as AppTheme;
    }
  } catch {}
  return "plum";
}

export function saveAppTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(APP_THEME_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  } catch (err) {
    console.error("Failed to save app theme:", err);
  }
}

// ---------------------------------------------------------------------------
// Theme application + derived, contrast-safe tokens
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

function parseColor(value: string): RGB | null {
  const v = value.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as RGB;
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as RGB;
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Nudge `color` toward `target` until it reaches `min` contrast against every surface.
 * With `tint`, the colour must also read on a badge-style background (the surface mixed
 * a little with the colour itself), which is how status chips are drawn.
 */
function ensureContrast(color: RGB, target: RGB, surfaces: RGB[], min: number, tint = 0): RGB {
  const worst = (c: RGB) =>
    Math.min(...surfaces.flatMap((sf) => (tint ? [contrastRatio(c, sf), contrastRatio(c, mix(sf, c, tint))] : [contrastRatio(c, sf)])));
  if (worst(color) >= min) return color;
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const c = mix(color, target, t);
    if (worst(c) >= min) return c;
  }
  return target;
}

/** Nudge a FILL colour (towards black or white) until the better of white/ink text reads on it. */
function ensureFill(fill: RGB, white: RGB, ink: RGB, min: number): RGB {
  const best = (c: RGB) => Math.max(contrastRatio(white, c), contrastRatio(ink, c));
  if (best(fill) >= min) return fill;
  const towardBlack = contrastRatio(white, fill) >= contrastRatio(ink, fill);
  const target: RGB = towardBlack ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.03; t <= 1.0001; t += 0.03) {
    const c = mix(fill, target, t);
    if (best(c) >= min) return c;
  }
  return fill;
}

/**
 * Applies the theme and derives three tokens every screen can rely on:
 *   --on-accent   readable text/icon colour for anything filled with --accent
 *   --accent-ink  the accent, adjusted so it is readable as TEXT on every surface
 *   --text-muted  nudged (only if needed) to reach 4.5:1 on every surface
 */
export function applyAppTheme(theme: AppTheme): void {
  const root = document.documentElement;
  ["--on-accent", "--accent", "--accent-ink", "--text-muted", "--signal", "--on-signal", "--deep", "--on-deep", "--danger-ink", "--success-ink", "--warn-ink"].forEach((k) => root.style.removeProperty(k));
  root.setAttribute("data-theme", theme);

  const cs = getComputedStyle(root);
  const get = (name: string) => parseColor(cs.getPropertyValue(name));
  const bg = get("--bg");
  const panel = get("--panel");
  const panelDark = get("--panel-dark");
  const navBg = get("--nav-active-bg");
  const text = get("--text-main");
  const muted = get("--text-muted");
  let accent = get("--accent");
  if (!bg || !panel || !panelDark || !text || !muted || !accent) return;

  const surfaces = [bg, panel, panelDark, ...(navBg ? [navBg] : [])];
  const white: RGB = [255, 255, 255];
  const black: RGB = [0, 0, 0];
  const ink: RGB = [22, 18, 16];
  const pickOn = (fill: RGB) => (contrastRatio(white, fill) >= contrastRatio(ink, fill) ? "#ffffff" : "#161210");

  // Filled accent surfaces (buttons, chips, overlays): make sure their label can be read.
  accent = ensureFill(accent, white, ink, 4.5);
  root.style.setProperty("--accent", toHex(accent));
  root.style.setProperty("--on-accent", pickOn(accent));

  root.style.setProperty("--accent-ink", toHex(ensureContrast(accent, text, surfaces, 4.5, 0.16)));
  root.style.setProperty("--text-muted", toHex(ensureContrast(muted, text, surfaces, 5.4)));

  const signal = get("--signal");
  if (signal) {
    const sig = ensureFill(signal, white, ink, 4.5);
    root.style.setProperty("--signal", toHex(sig));
    root.style.setProperty("--on-signal", pickOn(sig));
  }

  // Deep tiles carry white text (some of it translucent), so they need real depth.
  const deepBase = get("--deep") ?? mix(accent, black, 0.5);
  root.style.setProperty("--deep", toHex(ensureContrast(deepBase, black, [white], 8)));
  root.style.setProperty("--on-deep", "#ffffff");

  // Status colours: keep their hue, but make them readable as text AND as chip text on this theme's surfaces.
  const status: [string, RGB][] = [
    ["--danger-ink", [192, 57, 43]],
    ["--success-ink", [22, 160, 133]],
    ["--warn-ink", [183, 149, 11]],
  ];
  for (const [name, rgb] of status) root.style.setProperty(name, toHex(ensureContrast(rgb, text, surfaces, 4.5, 0.16)));
}
