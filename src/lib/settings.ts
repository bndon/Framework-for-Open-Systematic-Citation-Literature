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
  | "stone";

const APP_THEME_KEY = "foscl:app_theme";

export function loadAppTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(APP_THEME_KEY);
    if (raw && ["night","cream","sepia","dusk","mint","citrus","navy","forest","stone"].includes(raw)) {
      return raw as AppTheme;
    }
  } catch {}
  return "night";
}

export function saveAppTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(APP_THEME_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  } catch (err) {
    console.error("Failed to save app theme:", err);
  }
}

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}
