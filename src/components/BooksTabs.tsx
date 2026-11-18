import React from "react";
import { useNavigate } from "react-router-dom";

/** Switch between the EPUB shelf and the PDF shelf. */
export const BooksTabs: React.FC<{ active: "epub" | "pdf" }> = ({ active }) => {
  const navigate = useNavigate();
  const items: ["epub" | "pdf", string][] = [
    ["epub", "📖 EPUB books"],
    ["pdf", "📄 PDF papers"],
  ];
  return (
    <div role="tablist" aria-label="Shelf" style={{ display: "inline-flex", gap: 0, marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-strong, var(--border))" }}>
      {items.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          onClick={() => active !== id && navigate(id === "pdf" ? "/epub?tab=pdf" : "/epub", { replace: true })}
          style={{
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            border: "none",
            background: active === id ? "var(--accent)" : "var(--panel)",
            color: active === id ? "var(--on-accent)" : "var(--text-main)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
