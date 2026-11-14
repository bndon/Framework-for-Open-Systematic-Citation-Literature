import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
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
import { loadAppTheme, applyAppTheme } from "./lib/settings";
import type { AppTheme } from "./lib/settings";

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
      <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
        <Sidebar />
        <main style={{ flex: 1, height: "100vh", overflowY: "auto", position: "relative", display: "flex", flexDirection: "column" }}>
          <Routes>
            <Route path="/" element={<Discover />} />
            <Route path="/library" element={<Library />} />
            <Route path="/paper/:paperId" element={<PaperDetail />} />
            <Route path="/reader/:paperId" element={<Reader />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/compare" element={<ComparisonTable />} />
            <Route path="/export" element={<Export />} />
            <Route path="/lineage" element={<Lineage />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
            <Route path="/citations" element={<CitationGraph />} />
            <Route path="/access-hub" element={<AccessHub />} />
            <Route path="/converter" element={<ConferenceConverter />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/epub" element={<EpubLibrary />} />
            <Route path="/settings" element={<Settings currentTheme={theme} onThemeChange={handleThemeChange} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
};
