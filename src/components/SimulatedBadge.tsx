import React from "react";

interface SimulatedBadgeProps {
  type?: 'simulated' | 'concept';
  message?: string;
}

export const SimulatedBadge: React.FC<SimulatedBadgeProps> = ({
  type = 'simulated',
  message,
}) => {
  const isSim = type === 'simulated';
  const label = isSim ? "SIMULATED" : "CONCEPT";
  const defaultDesc = isSim
    ? "This is a simulated feature for demonstration purposes."
    : "This is a mock concept display. No actual billing or transactions occur.";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 14px",
        backgroundColor: isSim ? "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))" : "color-mix(in srgb, var(--accent-ink) 13%, var(--panel-dark))",
        border: `1px solid ${isSim ? "color-mix(in srgb, var(--warn-ink) 35%, var(--panel-dark))" : "color-mix(in srgb, var(--accent-ink) 35%, var(--panel-dark))"}`,
        borderRadius: "6px",
        color: isSim ? "var(--warn-ink)" : "var(--accent-ink)",
        fontSize: "12px",
        marginBottom: "16px",
      }}
    >
      <span
        style={{
          backgroundColor: isSim ? "var(--warn-ink)" : "var(--accent-ink)",
          color: "var(--panel-dark)",
          padding: "2px 6px",
          borderRadius: "4px",
          fontWeight: 700,
          fontSize: "10px",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
      <span>{message || defaultDesc}</span>
    </div>
  );
};
