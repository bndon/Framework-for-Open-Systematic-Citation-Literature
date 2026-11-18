import React from "react";
import { useNavigate } from "react-router-dom";
import { isUnlocked, PRO_FEATURES, type ProFeature } from "../lib/plan";

/** The page for a feature that belongs to a paid plan. */
export const LockedScreen: React.FC<{ feature: ProFeature }> = ({ feature }) => {
  const navigate = useNavigate();
  const f = PRO_FEATURES[feature];
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", overflowY: "auto" }}>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center", padding: "36px 32px", borderRadius: 16, background: "var(--panel)", border: "1px solid var(--border-strong, var(--border))" }}>
        <div aria-hidden style={{ fontSize: 40 }}>
          {f.icon}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "10px 0 8px", padding: "3px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", background: "var(--accent)", color: "var(--on-accent)" }}>
          🔒 Pro feature
        </div>
        <h1 style={{ fontSize: 24, margin: "0 0 8px", color: "var(--text-main)" }}>{f.title}</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", margin: "0 0 18px" }}>{f.blurb}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 auto 24px", textAlign: "left", maxWidth: 380, fontSize: 13, lineHeight: 1.9, color: "var(--text-main)" }}>
          {f.points.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/pricing")} style={{ padding: "9px 18px", borderRadius: 6, border: "1px solid transparent", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            See plans
          </button>
          <button onClick={() => navigate("/")} style={{ padding: "9px 18px", borderRadius: 6, border: "1px solid var(--border-strong, var(--border))", background: "var(--panel-dark)", color: "var(--text-main)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

/** Shows the screen if the plan includes the feature, otherwise the locked page. */
export const Gate: React.FC<{ feature: ProFeature; children: React.ReactNode }> = ({ feature, children }) =>
  isUnlocked(feature) ? <>{children}</> : <LockedScreen feature={feature} />;
