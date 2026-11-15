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
        <h1 style={{ fontSize: "24px", color: "#4A2418", margin: "0 0 6px 0" }}>Publisher Access Hub</h1>
        <p style={{ color: "#7A6458", fontSize: "14px", margin: 0 }}>
          Direct DOI links, Open Access verification, and publisher institutional acquisition simulations.
        </p>
      </header>

      {papers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#8A796F", backgroundColor: "#FAF7F2", borderRadius: "8px" }}>
          No papers in your workspace yet. Discover and save papers first!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {papers.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "18px 20px",
                border: "1px solid #E8DFD3",
                borderRadius: "8px",
                backgroundColor: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ flex: 1, paddingRight: "20px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "15.5px", color: "#4A2418" }}>
                  {p.title}
                </h3>
                <div style={{ fontSize: "12.5px", color: "#7A6458", marginBottom: "8px" }}>
                  {p.venue || "Scholarly venue"} {p.year ? `(${p.year})` : ""}
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {p.doi ? (
                    <a
                      href={`https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "12px", color: "#8A5A7A", textDecoration: "none", fontWeight: 600 }}
                    >
                      DOI: {p.doi} ↗
                    </a>
                  ) : (
                    <span style={{ fontSize: "12px", color: "#999" }}>No DOI registered</span>
                  )}

                  {p.oa_url ? (
                    <a
                      href={p.oa_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: "11px",
                        backgroundColor: "#E8F8F5",
                        color: "#16A085",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      🔓 Open Access Available
                    </a>
                  ) : (
                    <span style={{ fontSize: "11px", backgroundColor: "#FDF2E9", color: "#BA4A00", padding: "2px 8px", borderRadius: "4px" }}>
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
                    backgroundColor: "#FAF5EC",
                    border: "1px solid #D5C8B8",
                    color: "#4A2418",
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
          <h4 style={{ margin: "0 0 6px 0", color: "#4A2418" }}>{purchaseModalPaper?.title}</h4>
          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#7A6458" }}>
            DOI: {purchaseModalPaper?.doi || "N/A"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
            <div style={{ padding: "12px", border: "1px solid #EADDCB", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>24-Hour Rental</strong>
                <div style={{ fontSize: "12px", color: "#777" }}>Read-only online access</div>
              </div>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#8A5A7A" }}>$8.99</span>
            </div>

            <div style={{ padding: "12px", border: "2px solid #8A5A7A", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FAF5EC" }}>
              <div>
                <strong>Full PDF Download (Single User)</strong>
                <div style={{ fontSize: "12px", color: "#777" }}>Perpetual personal research license</div>
              </div>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#8A5A7A" }}>$32.50</span>
            </div>

            <div style={{ padding: "12px", border: "1px solid #EADDCB", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Institutional Multi-User License</strong>
                <div style={{ fontSize: "12px", color: "#777" }}>Lab & group shared archive</div>
              </div>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#8A5A7A" }}>$120.00</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              onClick={() => setPurchaseModalPaper(null)}
              style={{ padding: "8px 16px", backgroundColor: "#fff", border: "1px solid #D5C8B8", borderRadius: "6px", cursor: "pointer" }}
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
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
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
