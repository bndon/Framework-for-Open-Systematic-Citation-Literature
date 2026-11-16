import React from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isDanger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  isDanger = true,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width="420px">
      <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "var(--text-main)", lineHeight: 1.5 }}>
        {message}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 18px",
            backgroundColor: "var(--panel-dark)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            fontSize: "13px",
            cursor: "pointer",
            color: "var(--text-main)",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          style={{
            padding: "8px 18px",
            backgroundColor: isDanger ? "#C0392B" : "var(--accent)",
            color: isDanger ? "#ffffff" : "var(--on-accent)",
            border: "none",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
