import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getCollections,
  createCollection,
  getCollectionPapers,
  getAnnotations,
  getClaims,
  createClaim,
  updateClaim,
  deleteClaim,
  addClaimEvidence,
  removeClaimEvidence,
} from "../lib/api";
import { OriginBadge } from "../components/OriginBadge";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { toast } from "../lib/toast";
import type { Claim, ClaimEvidence, ClaimRevision, Collection, Paper, Annotation } from "../types";

export const Lineage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialCollectionId = searchParams.get("collectionId");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  // New claim modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newClaimText, setNewClaimText] = useState("");
  const [newClaimOrigin, setNewClaimOrigin] = useState<"user" | "source" | "ai">("user");

  // Revise claim modal
  const [revisingClaim, setRevisingClaim] = useState<Claim | null>(null);
  const [revisedText, setRevisedText] = useState("");
  const [revisionReason, setRevisionReason] = useState("");

  // Add evidence modal
  const [evidenceClaim, setEvidenceClaim] = useState<Claim | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string>("");
  const [paperAnnotations, setPaperAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>("");
  const [evidenceStance, setEvidenceStance] = useState<"supports" | "contradicts" | "qualifies">("supports");

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const colls = await getCollections();
      setCollections(colls);
      const chosen = initialCollectionId || colls[0]?.id || "";
      setSelectedCollectionId(chosen);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load collections");
    }
  };

  useEffect(() => {
    if (selectedCollectionId) {
      loadClaims(selectedCollectionId);
      getCollectionPapers(selectedCollectionId).then(setPapers).catch(console.error);
    }
  }, [selectedCollectionId]);

  const loadClaims = async (collId: string) => {
    setLoading(true);
    try {
      const list = await getClaims(collId);
      setClaims(list);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load claims");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClaimText.trim() || !selectedCollectionId) return;
    try {
      await createClaim(selectedCollectionId, newClaimText.trim(), newClaimOrigin);
      setNewClaimText("");
      setShowNewModal(false);
      loadClaims(selectedCollectionId);
      toast.success("Claim recorded!");
    } catch (err: any) {
      toast.error("Error creating claim: " + err?.toString());
    }
  };

  const handleReviseClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisingClaim || !revisedText.trim()) return;
    try {
      await updateClaim(revisingClaim.id, revisedText.trim(), revisionReason.trim() || undefined);
      setRevisingClaim(null);
      setRevisedText("");
      setRevisionReason("");
      loadClaims(selectedCollectionId);
      toast.success("Revision recorded in timeline!");
    } catch (err: any) {
      toast.error("Error updating claim: " + err?.toString());
    }
  };

  const handleDeleteClaim = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Claim",
      message: "Are you sure you want to delete this claim and its evidence links? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteClaim(id);
          setClaims(claims.filter((c) => c.id !== id));
          toast.success("Claim deleted");
        } catch (err: any) {
          toast.error("Error deleting claim: " + err?.toString());
        }
      },
    });
  };

  const handleOpenEvidenceModal = async (claim: Claim) => {
    setEvidenceClaim(claim);
    if (papers.length > 0) {
      const firstPaperId = papers[0].id;
      setSelectedPaperId(firstPaperId);
      const anns = await getAnnotations(firstPaperId);
      setPaperAnnotations(anns);
      setSelectedAnnotationId("");
    }
  };

  const handlePaperChange = async (pId: string) => {
    setSelectedPaperId(pId);
    try {
      const anns = await getAnnotations(pId);
      setPaperAnnotations(anns);
      setSelectedAnnotationId("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceClaim || !selectedPaperId) return;
    try {
      await addClaimEvidence(
        evidenceClaim.id,
        selectedPaperId,
        selectedAnnotationId || undefined,
        evidenceStance
      );
      setEvidenceClaim(null);
      loadClaims(selectedCollectionId);
      toast.success("Evidence linked to claim!");
    } catch (err: any) {
      toast.error("Error adding evidence: " + err?.toString());
    }
  };

  const handleRemoveEvidence = async (evId: string) => {
    try {
      await removeClaimEvidence(evId);
      loadClaims(selectedCollectionId);
      toast.success("Evidence link removed");
    } catch (err: any) {
      toast.error("Error removing evidence: " + err?.toString());
    }
  };

  const stanceColors = {
    supports: { bg: "#E8F8F5", color: "#16A085", border: "#A3E4D7", label: "Supports" },
    contradicts: { bg: "#FDEDEC", color: "#C0392B", border: "#F5B7B1", label: "Contradicts" },
    qualifies: { bg: "#FEF9E7", color: "#B7950B", border: "#F9E79F", label: "Qualifies" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top Header */}
      <div
        style={{
          padding: "16px 28px",
          backgroundColor: "#FAF5EC",
          borderBottom: "1px solid #E4DACB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", color: "#4A2418", margin: "0 0 2px 0" }}>Research Lineage</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "#7A6458" }}>
            Track claims, link evidence (supports / contradicts / qualifies), and view immutable revision history.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #D5C8B8", fontSize: "13px", backgroundColor: "#fff" }}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNewModal(true)}
            style={{
              padding: "7px 14px",
              backgroundColor: "#8A5A7A",
              color: "#FAF5EC",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + New Claim
          </button>
        </div>
      </div>

      {/* Main Claim List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", backgroundColor: "#fff" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#8A5A7A" }}>Loading claims...</div>
        ) : collections.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#8A796F", backgroundColor: "#FAF7F2", borderRadius: "8px", border: "1px dashed #D5C8B8" }}>
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>📁</div>
            <h3 style={{ margin: "0 0 6px 0", color: "#4A2418" }}>No collections created yet</h3>
            <p style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
              Claims belong to a research collection. Create your first collection in the Library or Discover screen to begin tracking claims.
            </p>
            <button
              onClick={() => {
                const name = prompt("Enter a name for your new collection (e.g., Literature Review):");
                if (name && name.trim()) {
                  createCollection(name.trim())
                    .then((c: Collection) => {
                      setCollections([c]);
                      setSelectedCollectionId(c.id);
                      toast.success(`Created collection "${c.name}"`);
                    })
                    .catch((err: any) => toast.error(err.toString()));
                }
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
              + Create Collection Here
            </button>
          </div>
        ) : claims.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#8A796F", backgroundColor: "#FAF7F2", borderRadius: "8px", border: "1px dashed #D5C8B8" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🧬</div>
            <h3 style={{ margin: "0 0 6px 0", color: "#4A2418" }}>No claims recorded yet</h3>
            <p style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
              Add a claim to track scientific hypotheses, statements, or findings over time.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
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
              + Create First Claim
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {claims.map((claim) => (
              <div
                key={claim.id}
                style={{
                  border: "1px solid #E8DFD3",
                  borderRadius: "8px",
                  padding: "20px",
                  backgroundColor: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                {/* Claim Text Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <OriginBadge origin={claim.origin} size="md" />
                      <span style={{ fontSize: "11px", color: "#8A796F" }}>
                        Created: {new Date(claim.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#3B2A20", lineHeight: 1.4 }}>
                      "{claim.text}"
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => {
                        setRevisingClaim(claim);
                        setRevisedText(claim.text);
                        setRevisionReason("");
                      }}
                      style={{
                        padding: "5px 10px",
                        backgroundColor: "#FAF5EC",
                        border: "1px solid #D5C8B8",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        color: "#4A2418",
                      }}
                    >
                      ✏ Revise Claim
                    </button>
                    <button
                      onClick={() => handleOpenEvidenceModal(claim)}
                      style={{
                        padding: "5px 10px",
                        backgroundColor: "#8A5A7A",
                        color: "#FAF5EC",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      + Evidence
                    </button>
                    <button
                      onClick={() => handleDeleteClaim(claim.id)}
                      style={{
                        padding: "5px 8px",
                        backgroundColor: "#FDEDEC",
                        color: "#C0392B",
                        border: "1px solid #F5B7B1",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Evidence Section */}
                <div style={{ marginTop: "14px", padding: "12px 14px", backgroundColor: "#FAF7F2", borderRadius: "6px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6E4363", marginBottom: "8px", textTransform: "uppercase" }}>
                    Linked Evidence ({claim.evidence.length})
                  </div>

                  {claim.evidence.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "#8A796F", fontStyle: "italic" }}>
                      No evidence linked yet. Click "+ Evidence" to link a paper or quote.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {claim.evidence.map((ev: ClaimEvidence) => {
                        const paperObj = papers.find((p) => p.id === ev.paper_id);
                        const stanceStyle = stanceColors[ev.stance] || stanceColors.supports;

                        return (
                          <div
                            key={ev.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 12px",
                              backgroundColor: "#fff",
                              border: `1px solid ${stanceStyle.border}`,
                              borderRadius: "4px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  backgroundColor: stanceStyle.bg,
                                  color: stanceStyle.color,
                                  textTransform: "uppercase",
                                }}
                              >
                                {stanceStyle.label}
                              </span>
                              <span style={{ fontSize: "12.5px", color: "#4A2418" }}>
                                <strong>{paperObj?.title || `Paper ID: ${ev.paper_id}`}</strong>
                                {ev.annotation_id && (
                                  <span style={{ color: "#7A6458", fontSize: "11.5px" }}>
                                    {" "}&bull; Quoted annotation linked
                                  </span>
                                )}
                              </span>
                            </div>

                            <button
                              onClick={() => handleRemoveEvidence(ev.id)}
                              style={{
                                border: "none",
                                background: "none",
                                color: "#B03A2E",
                                cursor: "pointer",
                                fontSize: "13px",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Revision Timeline */}
                {claim.revisions && claim.revisions.length > 0 && (
                  <div style={{ marginTop: "14px", padding: "12px 14px", backgroundColor: "#FCFBF8", borderRadius: "6px", border: "1px dashed #E0D4C5" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#8A5A7A", marginBottom: "8px", textTransform: "uppercase" }}>
                      Revision History Timeline ({claim.revisions.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {claim.revisions.map((rev: ClaimRevision, i: number) => (
                        <div key={rev.id} style={{ fontSize: "12px", color: "#555", borderLeft: "2px solid #8A5A7A", paddingLeft: "10px" }}>
                          <div style={{ fontSize: "11px", color: "#9E8B7F", marginBottom: "2px" }}>
                            Revision #{i + 1} &bull; {new Date(rev.created_at).toLocaleString()}
                          </div>
                          <div>
                            <span style={{ color: "#C0392B", textDecoration: "line-through" }}>
                              "{rev.old_text}"
                            </span>{" "}
                            → <span style={{ color: "#16A085", fontWeight: 600 }}>"{rev.new_text}"</span>
                          </div>
                          {rev.reason && (
                            <div style={{ color: "#6E4363", fontStyle: "italic", marginTop: "2px" }}>
                              Reason: {rev.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Claim Modal */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Create New Claim">
        <form onSubmit={handleCreateClaim}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Claim Statement *
            </label>
            <textarea
              required
              rows={3}
              value={newClaimText}
              onChange={(e) => setNewClaimText(e.target.value)}
              placeholder="e.g. Graph neural networks improve intrusion detection accuracy by 14% on imbalanced flow datasets..."
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Origin Badge
            </label>
            <select
              value={newClaimOrigin}
              onChange={(e) => setNewClaimOrigin(e.target.value as any)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "#fff",
              }}
            >
              <option value="user">You (Author hypothesis/synthesis)</option>
              <option value="source">Source (Extracted from paper)</option>
              <option value="ai">AI (mock)</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              style={{ padding: "8px 16px", backgroundColor: "#fff", border: "1px solid #D5C8B8", borderRadius: "6px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newClaimText.trim()}
              style={{
                padding: "8px 16px",
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create Claim
            </button>
          </div>
        </form>
      </Modal>

      {/* Revise Claim Modal */}
      <Modal isOpen={Boolean(revisingClaim)} onClose={() => setRevisingClaim(null)} title="Revise Claim (Revision History)">
        <form onSubmit={handleReviseClaim}>
          <div style={{ marginBottom: "12px", backgroundColor: "#FAF7F2", padding: "10px", borderRadius: "6px", fontSize: "12.5px" }}>
            <span style={{ color: "#8A796F", display: "block", marginBottom: "2px" }}>Original Text:</span>
            <em>"{revisingClaim?.text}"</em>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Revised Text *
            </label>
            <textarea
              required
              rows={3}
              value={revisedText}
              onChange={(e) => setRevisedText(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Reason for Revision (Mandatory for provenance)
            </label>
            <input
              type="text"
              required
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="e.g. Qualified claim after finding contradictory results in Benchmark B..."
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setRevisingClaim(null)}
              style={{ padding: "8px 16px", backgroundColor: "#fff", border: "1px solid #D5C8B8", borderRadius: "6px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!revisedText.trim() || !revisionReason.trim()}
              style={{
                padding: "8px 16px",
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Record Revision
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Evidence Modal */}
      <Modal isOpen={Boolean(evidenceClaim)} onClose={() => setEvidenceClaim(null)} title="Link Evidence to Claim">
        <form onSubmit={handleAddEvidence}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Paper *
            </label>
            <select
              value={selectedPaperId}
              onChange={(e) => handlePaperChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "#fff",
              }}
            >
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Specific Highlight/Annotation (Optional)
            </label>
            <select
              value={selectedAnnotationId}
              onChange={(e) => setSelectedAnnotationId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "#fff",
              }}
            >
              <option value="">(Whole paper as evidence)</option>
              {paperAnnotations.map((a) => (
                <option key={a.id} value={a.id}>
                  "{a.quote.slice(0, 50)}..." {a.page ? `(p. ${a.page})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Stance *
            </label>
            <select
              value={evidenceStance}
              onChange={(e) => setEvidenceStance(e.target.value as any)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "#fff",
              }}
            >
              <option value="supports">Supports (Provides confirmatory evidence)</option>
              <option value="contradicts">Contradicts (Challenges or disproves)</option>
              <option value="qualifies">Qualifies (Sets boundary conditions / nuances)</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setEvidenceClaim(null)}
              style={{ padding: "8px 16px", backgroundColor: "#fff", border: "1px solid #D5C8B8", borderRadius: "6px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Link Evidence
            </button>
          </div>
        </form>
      </Modal>

      {/* Styled Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Delete Claim"
        isDanger={true}
      />
    </div>
  );
};
