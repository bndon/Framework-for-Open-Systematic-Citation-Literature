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
      <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#44342D", lineHeight: 1.5 }}>
        {message}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 18px",
            backgroundColor: "#fff",
            border: "1px solid #D5C8B8",
            borderRadius: "6px",
            fontSize: "13px",
            cursor: "pointer",
            color: "#4A2418",
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
            backgroundColor: isDanger ? "#C0392B" : "#8A5A7A",
            color: "#FAF5EC",
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
