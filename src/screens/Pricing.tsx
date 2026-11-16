import React from "react";
import { SimulatedBadge } from "../components/SimulatedBadge";
import { toast } from "../lib/toast";

export const Pricing: React.FC = () => {
  return (
    <div style={{ padding: "36px 44px", maxWidth: "950px", margin: "0 auto" }}>
      <SimulatedBadge
        type="concept"
        message="Concept Subscription Tiers. No payment processing or accounts. FOSCL is an open-source, local-first research workspace."
      />

      <header style={{ textAlign: "center", marginBottom: "36px" }}>
        <h1 style={{ fontSize: "28px", color: "var(--text-main)", margin: "0 0 8px 0" }}>
          Workspace Subscription Plans
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
          Commercial concept tiers for collaborative labs and institutional research teams.
        </p>
      </header>

      {/* Pricing Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
        {/* Free Plan */}
        <div
          style={{
            backgroundColor: "var(--panel-dark)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase", marginBottom: "8px" }}>
              Community
            </div>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "22px", color: "var(--text-main)" }}>Free Tier</h3>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-main)", marginBottom: "16px" }}>
              $0 <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>/ forever</span>
            </div>

            <ul style={{ paddingLeft: "18px", fontSize: "13px", color: "var(--text-main)", lineHeight: 1.7, margin: "0 0 24px 0" }}>
              <li>Local SQLite database storage</li>
              <li>Unlimited OpenAlex searches & DOIs</li>
              <li>PDF reader & manual highlights</li>
              <li>Default 10-field extraction template</li>
              <li>DOCX & PDF synthesis exports</li>
            </ul>
          </div>

          <button
            disabled
            style={{
              padding: "10px",
              backgroundColor: "var(--panel)",
              color: "var(--text-main)",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "not-allowed",
            }}
          >
            Current Active Plan
          </button>
        </div>

        {/* Researcher Plan */}
        <div
          style={{
            backgroundColor: "var(--panel-dark)",
            border: "2px solid var(--accent)",
            borderRadius: "8px",
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 4px 12px rgba(110, 67, 99, 0.12)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-11px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              padding: "2px 12px",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.5px",
            }}
          >
            POPULAR CONCEPT
          </div>

          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase", marginBottom: "8px" }}>
              Individual Pro
            </div>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "22px", color: "var(--text-main)" }}>Researcher</h3>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-main)", marginBottom: "16px" }}>
              $9.99 <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>/ month</span>
            </div>

            <ul style={{ paddingLeft: "18px", fontSize: "13px", color: "var(--text-main)", lineHeight: 1.7, margin: "0 0 24px 0" }}>
              <li>Everything in Free</li>
              <li>Real LLM Extraction Engine</li>
              <li>Automated Citation Network Graphing</li>
              <li>Cloud Sync across devices</li>
              <li>LaTeX BibTeX biblio sync</li>
            </ul>
          </div>

          <button
            onClick={() => toast.info("Researcher tier is a concept plan preview. No active billing.")}
            style={{
              padding: "10px",
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Concept (Simulate Upgrade)
          </button>
        </div>

        {/* Group / Lab Plan */}
        <div
          style={{
            backgroundColor: "var(--panel-dark)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase", marginBottom: "8px" }}>
              Laboratory
            </div>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "22px", color: "var(--text-main)" }}>Group / Lab</h3>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-main)", marginBottom: "16px" }}>
              $29.99 <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>/ month</span>
            </div>

            <ul style={{ paddingLeft: "18px", fontSize: "13px", color: "var(--text-main)", lineHeight: 1.7, margin: "0 0 24px 0" }}>
              <li>Everything in Researcher</li>
              <li>Multi-user shared collection vaults</li>
              <li>Consensus verification for claim evidence</li>
              <li>Institutional SSO / SAML integration</li>
              <li>Dedicated audit logging</li>
            </ul>
          </div>

          <button
            onClick={() => toast.info("Lab & Group tier is a concept plan preview. No active billing.")}
            style={{
              padding: "10px",
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Contact Lab Sales (Mock)
          </button>
        </div>
      </div>
    </div>
  );
};
