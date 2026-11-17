import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ToastContainer } from "./components/ToastContainer";
import { Discover } from "./screens/Discover";
import { Library } from "./screens/Library";
import { PaperDetail } from "./screens/PaperDetail";
import { Reader } from "./screens/Reader";
import { Templates } from "./screens/Templates";
import { ComparisonTable } from "./screens/ComparisonTable";
import { Export } from "./screens/Export";
import { Lineage } from "./screens/Lineage";
import { AccessHub } from "./screens/AccessHub";
import { ConferenceConverter } from "./screens/ConferenceConverter";
import { Pricing } from "./screens/Pricing";
import { EpubLibrary } from "./screens/EpubLibrary";
import { CitationGraph } from "./screens/CitationGraph";
import { KnowledgeGraph } from "./screens/KnowledgeGraph";
import { Settings } from "./screens/Settings";
import { Dashboard } from "./screens/Dashboard";
import { About } from "./screens/About";
import { Screening } from "./screens/Screening";
import { QuarterCircleNav } from "./components/QuarterCircleNav";
import { loadAppTheme, applyAppTheme } from "./lib/settings";
import type { AppTheme } from "./lib/settings";

const PAGE_TITLES: Record<string, string> = {
  "/about": "About",
  "/discover": "Discover",
  "/library": "Library",
  "/screening": "Screening",
  "/templates": "Templates",
  "/compare": "Comparison Table",
  "/comparison": "Comparison Table",
  "/export": "Export",
  "/lineage": "Research Lineage",
  "/graph": "Knowledge Graph",
  "/knowledge-graph": "Knowledge Graph",
  "/citations": "Citation Tree",
  "/citation": "Citation Tree",
  "/access-hub": "Access Hub",
  "/converter": "Manuscript Analyzer",
  "/conference": "Manuscript Analyzer",
  "/pricing": "Subscription Tiers",
  "/epub": "Books",
  "/settings": "Settings",
};

/** Reserves the corner for the menu button on every page except the Dashboard. */
const TOP_STRIP = 68;
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const home = pathname === "/";
  const title = PAGE_TITLES[pathname] ?? (pathname.startsWith("/paper") ? "Paper" : pathname.startsWith("/reader") ? "Reader" : "");
  return (
    <>
      {!home && (
        <div
          style={{
            height: TOP_STRIP,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: `0 24px 0 ${TOP_STRIP + 14}px`,
            borderBottom: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--text-muted)",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            gap: "10px",
          }}
        >
          <span style={{ color: "var(--accent-ink)" }}>FOSCL</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span style={{ color: "var(--text-main)" }}>{title}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, textTransform: "none", letterSpacing: 0, opacity: 0.8 }}>
            Esc opens the menu
          </span>
        </div>
      )}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </>
  );
};

export const App: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>(() => loadAppTheme());

  useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
  };

  return (
    <BrowserRouter>
      <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
        {/* Global Quarter Circle Navigation (as seen across all screenshots) */}
        <QuarterCircleNav />

        <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/about" element={<About />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/library" element={<Library />} />
            <Route path="/screening" element={<Screening />} />
            <Route path="/paper/:paperId" element={<PaperDetail />} />
            <Route path="/reader/:paperId" element={<Reader />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/compare" element={<ComparisonTable />} />
            <Route path="/comparison" element={<ComparisonTable />} />
            <Route path="/export" element={<Export />} />
            <Route path="/lineage" element={<Lineage />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
            <Route path="/knowledge-graph" element={<KnowledgeGraph />} />
            <Route path="/citations" element={<CitationGraph />} />
            <Route path="/citation" element={<CitationGraph />} />
            <Route path="/access-hub" element={<AccessHub />} />
            <Route path="/converter" element={<ConferenceConverter />} />
            <Route path="/conference" element={<ConferenceConverter />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/epub" element={<EpubLibrary />} />
            <Route path="/settings" element={<Settings currentTheme={theme} onThemeChange={handleThemeChange} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
};
