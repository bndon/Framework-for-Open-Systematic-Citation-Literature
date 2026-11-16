import React, { useState, useEffect } from "react";
import { getPapers } from "../lib/api";
import { SimulatedBadge } from "../components/SimulatedBadge";
import { Modal } from "../components/Modal";
import { toast } from "../lib/toast";
import type { Paper } from "../types";

export const AccessHub: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [purchaseModalPaper, setPurchaseModalPaper] = useState<Paper | null>(null);

  useEffect(() => {
    getPapers().then(setPapers).catch(console.error);
  }, []);

  return (
    <div style={{ padding: "32px 40px", maxWidth: "900px", margin: "0 auto" }}>
      <SimulatedBadge type="simulated" message="Simulated Access Hub & Marketplace. Sample prices only — no real financial transactions." />

      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", color: "var(--text-main)", margin: "0 0 6px 0" }}>Publisher Access Hub</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
          Direct DOI links, Open Access verification, and publisher institutional acquisition simulations.
        </p>
      </header>

      {papers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)", backgroundColor: "var(--panel-dark)", borderRadius: "8px" }}>
          No papers in your workspace yet. Discover and save papers first!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {papers.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "18px 20px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                backgroundColor: "var(--panel-dark)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ flex: 1, paddingRight: "20px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "15.5px", color: "var(--text-main)" }}>
                  {p.title}
                </h3>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "8px" }}>
                  {p.venue || "Scholarly venue"} {p.year ? `(${p.year})` : ""}
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {p.doi ? (
                    <a
                      href={`https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "12px", color: "var(--accent-ink)", textDecoration: "none", fontWeight: 600 }}
                    >
                      DOI: {p.doi} ↗
                    </a>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No DOI registered</span>
                  )}

                  {p.oa_url ? (
                    <a
                      href={p.oa_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: "11px",
                        backgroundColor: "color-mix(in srgb, var(--success-ink) 13%, var(--panel-dark))",
                        color: "var(--success-ink)",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      🔓 Open Access Available
                    </a>
                  ) : (
                    <span style={{ fontSize: "11px", backgroundColor: "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))", color: "var(--warn-ink)", padding: "2px 8px", borderRadius: "4px" }}>
                      Institutional Access / Paywall
                    </span>
                  )}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setPurchaseModalPaper(p)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "var(--panel-dark)",
                    border: "1px solid var(--border)",
                    color: "var(--text-main)",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  💳 Purchase Access ($)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Simulated Purchase Modal */}
      <Modal
        isOpen={Boolean(purchaseModalPaper)}
        onClose={() => setPurchaseModalPaper(null)}
        title="Simulated Publisher Article Purchase"
      >
        <div style={{ marginBottom: "16px" }}>
          <SimulatedBadge type="simulated" message="Mock payment preview. No charges or card processing." />
          <h4 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>{purchaseModalPaper?.title}</h4>
          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-muted)" }}>
            DOI: {purchaseModalPaper?.doi || "N/A"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
            <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>24-Hour Rental</strong>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Read-only online access</div>
              </div>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--accent-ink)" }}>$8.99</span>
            </div>

            <div style={{ padding: "12px", border: "2px solid var(--accent)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--panel-dark)" }}>
              <div>
                <strong>Full PDF Download (Single User)</strong>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Perpetual personal research license</div>
              </div>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--accent-ink)" }}>$32.50</span>
            </div>

            <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Institutional Multi-User License</strong>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Lab & group shared archive</div>
              </div>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--accent-ink)" }}>$120.00</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              onClick={() => setPurchaseModalPaper(null)}
              style={{ padding: "8px 16px", backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer" }}
            >
              Close
            </button>
            <button
              onClick={() => {
                toast.success("Simulated checkout complete! (No real financial charge)");
                setPurchaseModalPaper(null);
              }}
              style={{
                padding: "8px 18px",
                backgroundColor: "var(--accent)",
                color: "var(--on-accent)",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Simulate Checkout
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
