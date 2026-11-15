import React from "react";

interface OriginBadgeProps {
  origin?: 'source' | 'user' | 'ai' | string;
  size?: 'sm' | 'md';
}

export const OriginBadge: React.FC<OriginBadgeProps> = ({ origin = 'user', size = 'sm' }) => {
  const norm = origin.toLowerCase();
  let label = "You";
  let bg = "#EBF5FB";
  let color = "#2980B9";
  let border = "#AED6F1";

  if (norm === "source") {
    label = "Source";
    bg = "#E8F8F5";
    color = "#16A085";
    border = "#A3E4D7";
  } else if (norm === "ai") {
    label = "AI (mock)";
    bg = "#FEF9E7";
    color = "#D4AC0D";
    border = "#F9E79F";
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
