import React, { useState } from "react";
import { inspect, loadLastBackup, pickFolder, runBackup, runRestore } from "../lib/backup";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "../lib/toast";
import type { BackupInfo } from "../types";

const btn = (primary = false): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: "6px",
  border: primary ? "1px solid transparent" : "1px solid var(--border-strong, var(--border))",
  background: primary ? "var(--accent)" : "var(--panel-dark)",
  color: primary ? "var(--on-accent)" : "var(--text-main)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
});

const nice = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "unknown date" : d.toLocaleString();
};

export const BackupSection: React.FC = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState(loadLastBackup());
  const [pending, setPending] = useState<{ dir: string; info: BackupInfo } | null>(null);

  const backup = async () => {
    setBusy("Starting…");
    try {
      const info = await runBackup(setBusy);
      if (info) {
        setLast(loadLastBackup());
        toast.success(`Backup saved: ${info.papers} papers, ${info.pdfs} PDFs, ${info.epubs} books`);
      }
    } catch (err: any) {
      toast.error(`Backup failed: ${err?.toString?.() ?? err}. Backups need the desktop app.`);
    } finally {
      setBusy(null);
    }
  };

  const choose = async () => {
    try {
      const dir = await pickFolder("Choose the backup folder (foscl-backup-…)");
      if (!dir) return;
      const info = await inspect(dir);
      setPending({ dir, info });
    } catch (err: any) {
      toast.error(err?.toString?.() ?? String(err));
    }
  };

  const restore = async () => {
    if (!pending) return;
    const { dir } = pending;
    setPending(null);
    setBusy("Starting…");
    try {
      const res = await runRestore(dir, setBusy);
      toast.success("Backup restored. Reloading…");
      window.setTimeout(() => window.location.reload(), 900);
      console.info("Your previous data was saved to", res.safety_path);
    } catch (err: any) {
      setBusy(null);
      toast.error(err?.toString?.() ?? String(err));
    }
  };

  return (
    <section style={{ marginTop: "48px" }}>
      <div style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>💾 Backup &amp; restore</div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
          Saves everything into one folder you can copy, zip or sync: papers, collections, annotations, screening, claims, your PDFs, your books, highlights and settings.
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={backup} disabled={!!busy} style={btn(true)}>
            Back up now…
          </button>
          <button onClick={choose} disabled={!!busy} style={btn()}>
            Restore from a backup…
          </button>
          {busy && <span style={{ fontSize: "12px", color: "var(--accent-ink)", fontWeight: 600 }}>{busy}</span>}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "12px", lineHeight: 1.6 }}>
          {last ? (
            <>
              Last backup: <b style={{ color: "var(--text-main)" }}>{nice(last.at)}</b> · {last.papers} papers, {last.pdfs} PDFs, {last.epubs} books
              <br />
              <span style={{ wordBreak: "break-all" }}>{last.path}</span>
            </>
          ) : (
            "No backup made from this computer yet."
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!pending}
        onClose={() => setPending(null)}
        onConfirm={restore}
        title="Restore this backup?"
        message={
          pending
            ? `Made ${nice(pending.info.created_at)}: ${pending.info.papers} papers, ${pending.info.collections} collections, ${pending.info.annotations} annotations, ${pending.info.pdfs} PDFs, ${pending.info.epubs} books. This REPLACES everything now in FOSCL. What you have now is saved in FOSCL's own backups folder first, so you can go back.`
            : ""
        }
        confirmLabel="Replace with this backup"
        isDanger={true}
      />
    </section>
  );
};
