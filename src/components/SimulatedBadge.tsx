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
        backgroundColor: isSim ? "#FFF8E1" : "#F3E5F5",
        border: `1px solid ${isSim ? "#FFE082" : "#E1BEE7"}`,
        borderRadius: "6px",
        color: isSim ? "#F57F17" : "#6A1B9A",
        fontSize: "12px",
        marginBottom: "16px",
      }}
    >
      <span
        style={{
          backgroundColor: isSim ? "#F57F17" : "#6A1B9A",
          color: "#fff",
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
