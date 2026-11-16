import React, { useEffect } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const STYLES: Record<ToastType, React.CSSProperties> = {
  success: {
    backgroundColor: "color-mix(in srgb, var(--success-ink) 13%, var(--panel-dark))",
    color: "var(--success-ink)",
    border: "1px solid color-mix(in srgb, var(--success-ink) 35%, var(--panel-dark))",
  },
  error: {
    backgroundColor: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))",
    color: "var(--danger-ink)",
    border: "1px solid color-mix(in srgb, var(--danger-ink) 35%, var(--panel-dark))",
  },
  info: {
    backgroundColor: "var(--panel-dark)",
    color: "var(--accent-ink)",
    border: "1px solid var(--border)",
  },
};

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "⚠",
  info: "ℹ",
};

const AUTO_DISMISS_MS = 4000;

/** Individual toast item — auto-dismisses after 4 s */
const ToastEntry: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      style={{
        ...STYLES[toast.type],
        borderRadius: "8px",
        padding: "12px 16px",
        fontSize: "13px",
        fontFamily: "inherit",
        lineHeight: 1.45,
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        minWidth: "260px",
        maxWidth: "380px",
        wordBreak: "break-word",
      }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{ICONS[toast.type]}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          opacity: 0.6,
          fontSize: "14px",
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
};

/**
 * Toast container — render once near the root of your app.
 *
 * Usage:
 *   const [toasts, setToasts] = useState<ToastItem[]>([]);
 *   const addToast = (message: string, type: ToastType) =>
 *     setToasts(prev => [...prev, { id: crypto.randomUUID(), message, type }]);
 *   const dismissToast = (id: string) =>
 *     setToasts(prev => prev.filter(t => t.id !== id));
 *
 *   <Toast toasts={toasts} onDismiss={dismissToast} />
 */
export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        alignItems: "flex-end",
      }}
    >
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
