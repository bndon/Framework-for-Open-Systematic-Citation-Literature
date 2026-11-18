import React from "react";

interface PlanCard {
  name: string;
  tag: string;
  price: string;
  per: string;
  points: string[];
  cta: string;
  current?: boolean;
  highlight?: boolean;
}

const PLANS: PlanCard[] = [
  {
    name: "Free",
    tag: "Community",
    price: "$0",
    per: "/ forever",
    points: ["Your library stored on your computer", "Unlimited OpenAlex searches and DOI lookups", "Screening with PRISMA diagram", "BibTeX and RIS import and export", "PDF and EPUB readers with highlights and notes", "Comparison tables, lineage and claims", "Word and PDF exports", "Backup and restore"],
    cta: "Your current plan",
    current: true,
  },
  {
    name: "Pro",
    tag: "For individual researchers",
    price: "$9.99",
    per: "/ month",
    points: ["Everything in Free", "Access Hub", "Manuscript Analyzer", "Smart suggestions for comparison tables", "More Pro features as they are released"],
    cta: "Coming soon",
    highlight: true,
  },
];

export const Pricing: React.FC = () => (
  <div style={{ padding: "36px 44px", maxWidth: 820, margin: "0 auto", overflowY: "auto" }}>
    <header style={{ textAlign: "center", marginBottom: 32 }}>
      <h1 style={{ fontSize: 28, color: "var(--text-main)", margin: "0 0 8px 0" }}>Plans</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>Everything you need for a literature review is free. Pro adds extra tools, and is not on sale yet.</p>
    </header>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
      {PLANS.map((p) => (
        <div
          key={p.name}
          style={{
            backgroundColor: "var(--panel-dark)",
            border: p.highlight ? "2px solid var(--accent)" : "1px solid var(--border-strong, var(--border))",
            borderRadius: 10,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase", marginBottom: 8 }}>{p.tag}</div>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 22, color: "var(--text-main)" }}>{p.name}</h3>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-main)", marginBottom: 16 }}>
              {p.price} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>{p.per}</span>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--text-main)", lineHeight: 1.8, margin: "0 0 24px 0" }}>
              {p.points.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <button
            disabled
            style={{ padding: 10, backgroundColor: "var(--panel)", color: "var(--text-main)", border: "1px solid var(--border-strong, var(--border))", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: "not-allowed" }}
          >
            {p.cta}
          </button>
        </div>
      ))}
    </div>
  </div>
);
