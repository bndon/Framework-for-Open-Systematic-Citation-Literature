import React, { useState, useEffect } from "react";
import { subscribeToToasts, toast as toastApi } from "../lib/toast";
import type { ToastItem } from "../lib/toast";

const typeStyles: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: "#E8F8F5", border: "#A3E4D7", color: "#16A085", icon: "✓" },
  error:   { bg: "#FDEDEC", border: "#F5B7B1", color: "#C0392B", icon: "⚠" },
  info:    { bg: "#FAF5EC", border: "#D5C8B8", color: "#8A5A7A", icon: "ℹ" },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToToasts(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "380px",
      }}
    >
      {toasts.map((t) => {
        const s = typeStyles[t.type] || typeStyles.info;
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px 16px",
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              fontSize: "13px",
              color: s.color,
              fontWeight: 500,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1 }}>{s.icon}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => toastApi.dismiss(t.id)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: s.color,
                fontSize: "16px",
                lineHeight: 1,
                padding: 0,
                opacity: 0.7,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

