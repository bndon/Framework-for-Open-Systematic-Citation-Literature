import { BackupSection } from "../components/BackupSection";
import React, { useState } from "react";
import type { AppTheme } from "../lib/settings";
import { saveAppTheme, loadMenuAnim, saveMenuAnim, type MenuAnim } from "../lib/settings";

interface ThemeOption {
  id: AppTheme;
  name: string;
  emoji: string;
  description: string;
  bg: string;
  panel: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  dark: boolean;
}

/** black or white, whichever reads better on `hex` (swatch check marks). */
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const lin = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  // contrast with white vs. with near-black; pick the better one
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0563 ? "#ffffff" : "#161210";
}

const THEMES: ThemeOption[] = [
  {
    id: "plum",
    name: "Plum",
    emoji: "🍇",
    description: "Cream paper with plum accents",
    bg: "#f9f4ec",
    panel: "#f1e8db",
    accent: "#845177",
    text: "#351701",
    textMuted: "#7a6458",
    border: "#e6dccb",
    dark: false,
  },
  {
    id: "night",
    name: "Night",
    emoji: "🌙",
    description: "Deep charcoal — the default dark workspace",
    bg: "#1c2225",
    panel: "#2b3337",
    accent: "#86b4a4",
    text: "#edf2f4",
    textMuted: "#96a1a7",
    border: "#2e373b",
    dark: true,
  },
  {
    id: "cream",
    name: "Cream",
    emoji: "☕",
    description: "Warm off-white — easy on the eyes",
    bg: "#f7f4ec",
    panel: "#eee8db",
    accent: "#377663",
    text: "#2b2724",
    textMuted: "#787067",
    border: "#dcd4c4",
    dark: false,
  },
  {
    id: "sepia",
    name: "Sepia",
    emoji: "📜",
    description: "Classic parchment — vintage reading feel",
    bg: "#ede1c7",
    panel: "#dfd2b5",
    accent: "#855527",
    text: "#3a2c1b",
    textMuted: "#7c6850",
    border: "#cec09f",
    dark: false,
  },
  {
    id: "dusk",
    name: "Dusk Mountain",
    emoji: "🌆",
    description: "Purple-blue twilight — calm and focused",
    bg: "#2c2d3a",
    panel: "#35364a",
    accent: "#a4abd9",
    text: "#e8e9f4",
    textMuted: "#9394b0",
    border: "#3d3e55",
    dark: true,
  },
  {
    id: "mint",
    name: "Mint Wave",
    emoji: "🌊",
    description: "Cool teal-mint — fresh and productive",
    bg: "#2a3238",
    panel: "#2E3844",
    accent: "#a5dabe",
    text: "#e4eeec",
    textMuted: "#8fa8a2",
    border: "#3a454d",
    dark: true,
  },
  {
    id: "citrus",
    name: "Citrus Classic",
    emoji: "🍊",
    description: "Red & amber on cream — bold contrast",
    bg: "#f5ede8",
    panel: "#EAD8C4",
    accent: "#b22a2a",
    text: "#2a1a16",
    textMuted: "#7a5a52",
    border: "#ddd0c8",
    dark: false,
  },
  {
    id: "navy",
    name: "Deep Navy",
    emoji: "🌃",
    description: "Dark teal depths — ultra minimal",
    bg: "#122020",
    panel: "#1a2e2e",
    accent: "#3a9e8e",
    text: "#d8ecea",
    textMuted: "#6a9490",
    border: "#1f3030",
    dark: true,
  },
  {
    id: "forest",
    name: "Forest Noir",
    emoji: "🌲",
    description: "Citron on black — high-contrast editorial",
    bg: "#092122",
    panel: "#161e1c",
    accent: "#E2F3A9",
    text: "#e8f2e0",
    textMuted: "#7a9870",
    border: "#1c2820",
    dark: true,
  },
  {
    id: "stone",
    name: "Stone Premium",
    emoji: "🪨",
    description: "Warm gray with amber — sophisticated neutral",
    bg: "#DDDAC4",
    panel: "#dddad4",
    accent: "#EFB356",
    text: "#2a2824",
    textMuted: "#6e6a62",
    border: "#d0ccc4",
    dark: false,
  },
];

interface SettingsProps {
  currentTheme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const Settings: React.FC<SettingsProps> = ({ currentTheme, onThemeChange }) => {
  const [hovered, setHovered] = useState<AppTheme | null>(null);
  const [menuAnim, setMenuAnim] = useState<MenuAnim>(loadMenuAnim);

  const handleMenuAnim = (m: MenuAnim) => {
    setMenuAnim(m);
    saveMenuAnim(m);
  };

  const handleThemeSelect = (theme: AppTheme) => {
    saveAppTheme(theme);
    onThemeChange(theme);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "44px 44px" }}>
        {/* Page Header */}
        <div style={{ marginBottom: "40px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--accent-ink)", marginBottom: "8px" }}>
            Preferences
          </div>
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 500, letterSpacing: "-0.6px", color: "var(--text-main)" }}>
            Settings
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.6 }}>
            Customize your FOSCL workspace appearance and preferences.
          </p>
        </div>

        {/* Theme Section */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
                🎨 Color Theme
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Choose a color palette for your workspace
              </div>
            </div>
            <div style={{
              padding: "4px 12px",
              borderRadius: "20px",
              background: "var(--nav-active-bg)",
              border: "1px solid var(--accent)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--accent-ink)",
            }}>
              {THEMES.find(t => t.id === currentTheme)?.name ?? currentTheme}
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "14px",
          }}>
            {THEMES.map((theme) => {
              const isActive = currentTheme === theme.id;
              const isHovered = hovered === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  onMouseEnter={() => setHovered(theme.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    position: "relative",
                    border: isActive
                      ? "2px solid var(--accent)"
                      : isHovered
                      ? "2px solid var(--nav-active-border)"
                      : "2px solid var(--border)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    cursor: "pointer",
                    background: "transparent",
                    padding: 0,
                    textAlign: "left",
                    transition: "all 160ms ease",
                    transform: isHovered && !isActive ? "translateY(-2px)" : "none",
                    boxShadow: isActive
                      ? `0 0 0 1px var(--accent), 0 4px 16px var(--shelf-shadow)`
                      : isHovered
                      ? "0 4px 12px var(--shelf-shadow)"
                      : "none",
                  }}
                >
                  {/* Preview Strip */}
                  <div style={{
                    height: "80px",
                    background: theme.bg,
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "10px",
                    gap: "6px",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Fake sidebar strip */}
                    <div style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "36px",
                      background: theme.panel,
                      borderRight: `1px solid ${theme.border}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      paddingTop: "10px",
                      gap: "6px",
                    }}>
                      {[1,2,3].map(i => (
                        <div key={i} style={{
                          width: "18px",
                          height: "4px",
                          borderRadius: "2px",
                          background: i === 1 ? theme.accent : theme.border,
                          opacity: i === 1 ? 1 : 0.5,
                        }} />
                      ))}
                    </div>
                    {/* Fake content */}
                    <div style={{ marginLeft: "44px", display: "flex", flexDirection: "column", gap: "5px", flex: 1 }}>
                      <div style={{ width: "55%", height: "5px", borderRadius: "3px", background: theme.text, opacity: 0.8 }} />
                      <div style={{ width: "80%", height: "4px", borderRadius: "2px", background: theme.textMuted, opacity: 0.5 }} />
                      <div style={{ width: "40%", height: "4px", borderRadius: "2px", background: theme.textMuted, opacity: 0.4 }} />
                      <div style={{
                        marginTop: "4px",
                        width: "60px",
                        height: "16px",
                        borderRadius: "4px",
                        background: theme.accent,
                        opacity: 0.9,
                      }} />
                    </div>
                    {/* Active checkmark */}
                    {isActive && (
                      <div style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: theme.accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        color: readableOn(theme.accent),
                        fontWeight: 700,
                      }}>
                        ✓
                      </div>
                    )}
                  </div>

                  {/* Info Row */}
                  <div style={{
                    padding: "10px 12px",
                    background: "var(--panel-dark)",
                    borderTop: "1px solid var(--border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                        <span style={{ fontSize: "14px" }}>{theme.emoji}</span>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                          {theme.name}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {[theme.bg, theme.accent, theme.panel].map((c, i) => (
                          <div key={i} style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            background: c,
                            border: "1px solid var(--border)",
                          }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                      {theme.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Navigation menu */}
        <section style={{ marginTop: "48px" }}>
          <div style={{ marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
              🧭 Navigation menu
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Open it with Esc or Ctrl+K. Alt+1–9 jumps straight to a screen without opening it.
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginRight: "6px" }}>Animation</span>
            {([
              ["fast", "Fast", "Quick sweep (default)"],
              ["full", "Full", "The slow, ring-by-ring sweep"],
              ["off", "Off", "Appears instantly"],
            ] as [MenuAnim, string, string][]).map(([id, label, hint]) => (
              <button
                key={id}
                onClick={() => handleMenuAnim(id)}
                title={hint}
                aria-pressed={menuAnim === id}
                style={{
                  padding: "7px 16px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: menuAnim === id ? "var(--accent)" : "var(--panel-dark)",
                  color: menuAnim === id ? "var(--on-accent)" : "var(--text-main)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "10px" }}>
            Menu items can be clicked from the first frame in every mode, so the animation never makes you wait.
          </div>
        </section>

        <BackupSection />

        {/* More settings sections can go here */}
        <section style={{ marginTop: "48px" }}>
          <div style={{ marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
              ℹ️ About FOSCL
            </div>
          </div>
          <div style={{
            padding: "16px 20px",
            borderRadius: "8px",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            fontSize: "12px",
            color: "var(--text-muted)",
            lineHeight: 1.7,
          }}>
            <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)", marginBottom: "6px" }}>FOSCL v0.2.0</div>
            <div>Framework for Open Systematic Citation & Literature</div>
            <div>Built with Tauri + React + TypeScript</div>
          </div>
        </section>
      </div>
    </div>
  );
};
