import React from "react";

interface OriginBadgeProps {
  origin?: 'source' | 'user' | 'ai' | string;
  size?: 'sm' | 'md';
}

export const OriginBadge: React.FC<OriginBadgeProps> = ({ origin = 'user', size = 'sm' }) => {
  const norm = origin.toLowerCase();
  let label = "You";
  let bg = "color-mix(in srgb, var(--accent-ink) 13%, var(--panel-dark))";
  let color = "var(--accent-ink)";
  let border = "color-mix(in srgb, var(--accent-ink) 35%, var(--panel-dark))";

  if (norm === "source") {
    label = "Source";
    bg = "color-mix(in srgb, var(--success-ink) 13%, var(--panel-dark))";
    color = "var(--success-ink)";
    border = "color-mix(in srgb, var(--success-ink) 35%, var(--panel-dark))";
  } else if (norm === "ai") {
    label = "AI (mock)";
    bg = "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))";
    color = "var(--warn-ink)";
    border = "color-mix(in srgb, var(--warn-ink) 35%, var(--panel-dark))";
  }

  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: isSmall ? "1px 6px" : "3px 8px",
        borderRadius: "10px",
        fontSize: isSmall ? "10px" : "12px",
        fontWeight: 600,
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
        letterSpacing: "0.2px",
      }}
    >
      {label}
    </span>
  );
};
