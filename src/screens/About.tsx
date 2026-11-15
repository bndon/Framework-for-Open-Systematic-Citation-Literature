import React from "react";
import { Link } from "react-router-dom";
import pkg from "../../package.json";

const LETTERS: { letter: string; word: string }[] = [
  { letter: "F", word: "Framework" },
  { letter: "O", word: "Open" },
  { letter: "S", word: "Systematic" },
  { letter: "C", word: "Citation" },
  { letter: "L", word: "Literature" },
];

const VERBS: { verb: string; text: string; links: { to: string; label: string }[] }[] = [
  {
    verb: "Find",
    text: "Search OpenAlex by keyword or DOI and pull in abstracts, venues and open-access links.",
    links: [{ to: "/discover", label: "Discover" }],
  },
  {
    verb: "Organize",
    text: "Keep papers in collections, attach PDFs and highlight the passages that matter.",
    links: [{ to: "/library", label: "Library" }],
  },
  {
    verb: "Synthesize",
    text: "Compare papers field by field, and track claims against the evidence for and against them.",
    links: [
      { to: "/compare", label: "Comparison Table" },
      { to: "/lineage", label: "Research Lineage" },
    ],
  },
  {
    verb: "Cite",
    text: "Follow who cites whom, then export your work to Word or PDF.",
    links: [
      { to: "/citations", label: "Citation Tree" },
      { to: "/export", label: "Export" },
    ],
  },
  {
    verb: "Link",
    text: "See collections, papers and claims as one connected graph.",
    links: [{ to: "/graph", label: "Knowledge Graph" }],
  },
];

const sectionTitle: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
  color: "var(--accent)",
};

export const About: React.FC = () => {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "44px 40px 56px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--accent)", marginBottom: "8px" }}>
          About
        </div>
        <h1 style={{ margin: 0, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "40px", letterSpacing: "2px", color: "var(--text-main)" }}>
          FOSCL
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: "16px", color: "var(--text-muted)" }}>
          Framework for Open Systematic Citation &amp; Literature
        </p>

        <p style={{ margin: "24px 0 0", fontSize: "14.5px", lineHeight: 1.7, color: "var(--text-main)" }}>
          FOSCL is a desktop research workspace for working through scholarly literature in a
          systematic way: find papers, organize them, pull out and compare what they say, and keep a
          traceable record of the claims you build on them. Your library is stored locally in a SQLite
          database on your machine; OpenAlex is used for paper discovery and citation data.
        </p>

        <section style={{ marginTop: "40px" }}>
          <h2 style={sectionTitle}>What the name stands for</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {LETTERS.map(({ letter, word }) => (
              <div
                key={letter}
                style={{
                  flex: "1 1 120px",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "var(--panel)",
                  boxShadow: "inset 0 0 0 1px var(--border)",
                }}
              >
                <div style={{ fontFamily: "Georgia, serif", fontSize: "28px", fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
                  {letter}
                </div>
                <div style={{ marginTop: "6px", fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>{word}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "40px" }}>
          <h2 style={sectionTitle}>Find · Organize · Synthesize · Cite · Link</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {VERBS.map(({ verb, text, links }) => (
              <div
                key={verb}
                style={{
                  display: "flex",
                  gap: "18px",
                  alignItems: "baseline",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  background: "var(--panel)",
                  boxShadow: "inset 0 0 0 1px var(--border)",
                }}
              >
                <div style={{ width: "96px", flexShrink: 0, fontFamily: "Georgia, serif", fontSize: "17px", fontWeight: 700, color: "var(--text-main)" }}>
                  {verb}
                </div>
                <div style={{ flex: 1, fontSize: "13.5px", lineHeight: 1.6, color: "var(--text-muted)" }}>
                  {text}
                  <div style={{ marginTop: "6px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {links.map((l) => (
                      <Link key={l.to} to={l.to} style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--accent)", textDecoration: "none" }}>
                        {l.label} →
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "40px" }}>
          <h2 style={sectionTitle}>Details</h2>
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "12px",
              background: "var(--panel)",
              boxShadow: "inset 0 0 0 1px var(--border)",
              fontSize: "13px",
              lineHeight: 1.9,
              color: "var(--text-muted)",
            }}
          >
            <div><strong style={{ color: "var(--text-main)" }}>Version</strong> &nbsp;{pkg.version}</div>
            <div><strong style={{ color: "var(--text-main)" }}>Built with</strong> &nbsp;Tauri, React and TypeScript</div>
            <div><strong style={{ color: "var(--text-main)" }}>Data</strong> &nbsp;Local SQLite; paper metadata from OpenAlex</div>
            <div style={{ marginTop: "6px", fontSize: "12px" }}>
              Access Hub, Conference Converter and Subscription Tiers are simulated or concept features and are labelled as such.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
