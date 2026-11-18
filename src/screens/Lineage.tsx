import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const initialCollectionId = searchParams.get("collectionId");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  // View state
  type Status = "supported" | "contested" | "challenged" | "qualified" | "unsupported";
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [originFilter, setOriginFilter] = useState<"all" | "user" | "source" | "ai">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "evidence" | "contested" | "revised">("newest");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [annById, setAnnById] = useState<Record<string, Annotation>>({});

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
    supports: { bg: "color-mix(in srgb, var(--success-ink) 13%, var(--panel-dark))", color: "var(--success-ink)", border: "color-mix(in srgb, var(--success-ink) 80%, var(--panel-dark))", label: "Supports" },
    contradicts: { bg: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))", color: "var(--danger-ink)", border: "color-mix(in srgb, var(--danger-ink) 80%, var(--panel-dark))", label: "Contradicts" },
    qualifies: { bg: "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))", color: "var(--warn-ink)", border: "color-mix(in srgb, var(--warn-ink) 80%, var(--panel-dark))", label: "Qualifies" },
  };


  // Quotes for evidence that points at a highlight (so the card can show the actual passage).
  useEffect(() => {
    const need = new Set<string>();
    for (const c of claims) for (const ev of c.evidence) if (ev.annotation_id && !annById[ev.annotation_id]) need.add(ev.paper_id);
    if (need.size === 0) return;
    let live = true;
    Promise.all([...need].map((pid) => getAnnotations(pid).catch(() => [] as Annotation[]))).then((lists) => {
      if (!live) return;
      setAnnById((prev) => {
        const next = { ...prev };
        for (const l of lists) for (const a of l) next[a.id] = a;
        return next;
      });
    });
    return () => { live = false; };
  }, [claims]);

  const countStances = (c: Claim) => ({
    supports: c.evidence.filter((e) => e.stance === "supports").length,
    contradicts: c.evidence.filter((e) => e.stance === "contradicts").length,
    qualifies: c.evidence.filter((e) => e.stance === "qualifies").length,
  });
  const statusOf = (c: Claim): Status => {
    const n = countStances(c);
    if (c.evidence.length === 0) return "unsupported";
    if (n.supports > 0 && n.contradicts > 0) return "contested";
    if (n.contradicts > 0) return "challenged";
    if (n.supports > 0) return "supported";
    return "qualified";
  };
  const statusMeta: Record<Status, { label: string; hint: string; tone: string }> = {
    supported: { label: "Supported", hint: "Evidence agrees", tone: "var(--success-ink)" },
    contested: { label: "Contested", hint: "Evidence on both sides", tone: "var(--warn-ink)" },
    challenged: { label: "Challenged", hint: "Only opposing evidence", tone: "var(--danger-ink)" },
    qualified: { label: "Qualified", hint: "Only boundary notes", tone: "var(--accent-ink)" },
    unsupported: { label: "No evidence", hint: "Nothing linked yet", tone: "color-mix(in srgb, var(--text-muted) 40%, var(--text-main))" },
  };
  const tint = (tone: string, pct = 13) => `color-mix(in srgb, ${tone} ${pct}%, var(--panel-dark))`;

  const summary = useMemo(() => {
    const by: Record<Status, number> = { supported: 0, contested: 0, challenged: 0, qualified: 0, unsupported: 0 };
    let evidence = 0;
    for (const c of claims) { by[statusOf(c)] += 1; evidence += c.evidence.length; }
    return { by, evidence };
  }, [claims]);

  const visibleClaims = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = claims.filter((c) => {
      if (statusFilter !== "all" && statusOf(c) !== statusFilter) return false;
      if (originFilter !== "all" && c.origin !== originFilter) return false;
      if (q && !c.text.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (d?: string) => (d ? new Date(d).getTime() : 0);
    const lastTouched = (c: Claim) => Math.max(time(c.created_at), ...(c.revisions || []).map((r) => time(r.created_at)));
    const contest = (c: Claim) => { const n = countStances(c); return Math.min(n.supports, n.contradicts) * 100 + n.contradicts; };
    return [...list].sort((a, b) => {
      if (sort === "oldest") return time(a.created_at) - time(b.created_at);
      if (sort === "evidence") return b.evidence.length - a.evidence.length;
      if (sort === "contested") return contest(b) - contest(a);
      if (sort === "revised") return lastTouched(b) - lastTouched(a);
      return time(b.created_at) - time(a.created_at);
    });
  }, [claims, statusFilter, originFilter, search, sort]);

  // How each paper in the collection is used across claims.
  const paperUse = useMemo(() => {
    return papers.map((p) => {
      let supports = 0, contradicts = 0, qualifies = 0;
      for (const c of claims) for (const e of c.evidence) if (e.paper_id === p.id) {
        if (e.stance === "supports") supports += 1; else if (e.stance === "contradicts") contradicts += 1; else qualifies += 1;
      }
      return { paper: p, supports, contradicts, qualifies, total: supports + contradicts + qualifies };
    }).sort((a, b) => b.total - a.total);
  }, [papers, claims]);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const field: React.CSSProperties = { padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", backgroundColor: "var(--panel-dark)", color: "var(--text-main)" };
  const chip = (active: boolean, tone = "var(--accent)"): React.CSSProperties => ({
    padding: "5px 11px", borderRadius: "14px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
    border: "1px solid " + (active ? tone : "var(--border)"),
    background: active ? tone : "var(--panel-dark)",
    color: active ? "var(--on-accent, #fff)" : "var(--text-main)",
  });
  const smallBtn: React.CSSProperties = { padding: "5px 10px", backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "var(--text-main)" };

  const renderEvidenceColumn = (claim: Claim, stance: "supports" | "contradicts" | "qualifies", title: string) => {
    const items = claim.evidence.filter((e) => e.stance === stance);
    const st = stanceColors[stance];
    return (
      <div style={{ flex: "1 1 200px", minWidth: 0, background: tint(st.color, 7), border: `1px solid ${st.border}`, borderRadius: "8px", padding: "10px 12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: st.color, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
          {title} ({items.length})
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", fontStyle: "italic" }}>None</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {items.map((ev: ClaimEvidence) => {
              const paperObj = papers.find((p) => p.id === ev.paper_id);
              const quote = ev.annotation_id ? annById[ev.annotation_id] : undefined;
              return (
                <div key={ev.id} style={{ background: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "6px", padding: "8px 10px", display: "flex", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={() => paperObj && navigate(`/paper/${paperObj.id}`)}
                      title={paperObj ? "Open paper" : undefined}
                      style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-main)", cursor: paperObj ? "pointer" : "default", overflowWrap: "anywhere" }}
                    >
                      {paperObj?.title || `Paper ID: ${ev.paper_id}`}
                      {paperObj?.year ? <span style={{ fontWeight: 500, color: "var(--text-muted)" }}> · {paperObj.year}</span> : null}
                    </div>
                    {ev.annotation_id && (
                      <div style={{ marginTop: "4px", paddingLeft: "8px", borderLeft: `3px solid ${quote?.color || st.color}`, fontSize: "11.5px", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.4 }}>
                        {quote ? <>“{quote.quote.length > 160 ? quote.quote.slice(0, 160) + "…" : quote.quote}”{quote.page ? ` (p. ${quote.page})` : ""}</> : "Quoted highlight linked"}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleRemoveEvidence(ev.id)} title="Unlink this evidence" style={{ border: "none", background: "none", color: "var(--danger-ink)", cursor: "pointer", fontSize: "13px", alignSelf: "flex-start" }}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 28px", backgroundColor: "var(--panel-dark)", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "20px", color: "var(--text-main)", margin: "0 0 2px 0" }}>Research Lineage</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              A ledger of claims: what you believe, the evidence for and against it, and how each claim changed over time.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select value={selectedCollectionId} onChange={(e) => setSelectedCollectionId(e.target.value)} style={field}>
              {collections.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <button onClick={() => setShowNewModal(true)} style={{ padding: "7px 14px", backgroundColor: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              + New Claim
            </button>
          </div>
        </div>

        {claims.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setStatusFilter("all")} style={chip(statusFilter === "all")}>All · {claims.length}</button>
            {(Object.keys(statusMeta) as Status[]).map((k) => (
              <button key={k} onClick={() => setStatusFilter(statusFilter === k ? "all" : k)} title={statusMeta[k].hint} style={chip(statusFilter === k, statusMeta[k].tone)}>
                {statusMeta[k].label} · {summary.by[k]}
              </button>
            ))}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search claims…" style={{ ...field, minWidth: "180px", marginLeft: "auto" }} />
            <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as any)} style={field} title="Filter by origin">
              <option value="all">Any origin</option>
              <option value="user">You</option>
              <option value="source">Source</option>
              <option value="ai">Suggested</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as any)} style={field} title="Sort claims">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="evidence">Most evidence</option>
              <option value="contested">Most contested</option>
              <option value="revised">Recently revised</option>
            </select>
          </div>
        )}
      </div>

      {/* Body: claims + papers rail */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, backgroundColor: "var(--panel-dark)" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--accent-ink)" }}>Loading claims...</div>
          ) : collections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>📁</div>
              <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>No collections created yet</h3>
              <p style={{ fontSize: "13px", margin: "0 0 16px 0" }}>Claims belong to a research collection. Create one to begin tracking claims.</p>
              <button
                onClick={() => {
                  const name = prompt("Enter a name for your new collection (e.g., Literature Review):");
                  if (name && name.trim()) {
                    createCollection(name.trim())
                      .then((c: Collection) => { setCollections([c]); setSelectedCollectionId(c.id); toast.success(`Created collection "${c.name}"`); })
                      .catch((err: any) => toast.error(err.toString()));
                  }
                }}
                style={{ padding: "8px 18px", backgroundColor: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}
              >
                + Create Collection Here
              </button>
            </div>
          ) : claims.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🧬</div>
              <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>No claims recorded yet</h3>
              <p style={{ fontSize: "13px", margin: "0 0 16px 0" }}>Add a claim to track a hypothesis or finding, then link papers that support, contradict or qualify it.</p>
              <button onClick={() => setShowNewModal(true)} style={{ padding: "8px 18px", backgroundColor: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}>
                + Create First Claim
              </button>
            </div>
          ) : visibleClaims.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px", color: "var(--text-muted)" }}>No claims match these filters.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {visibleClaims.map((claim) => {
                const st = statusOf(claim);
                const meta = statusMeta[st];
                const n = countStances(claim);
                const total = claim.evidence.length;
                const isCollapsed = collapsed.has(claim.id);
                const revs = claim.revisions || [];
                return (
                  <div key={claim.id} style={{ border: "1px solid var(--border)", borderLeft: `5px solid ${meta.tone}`, borderRadius: "8px", padding: "16px 18px", backgroundColor: "var(--panel)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                          <span title={meta.hint} style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "10px", color: meta.tone, background: tint(meta.tone), border: `1px solid ${tint(meta.tone, 35)}` }}>{meta.label}</span>
                          <OriginBadge origin={claim.origin} size="md" />
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {new Date(claim.created_at).toLocaleDateString()}{revs.length > 0 ? ` · revised ${revs.length}×` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.4, overflowWrap: "anywhere" }}>“{claim.text}”</div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button onClick={() => { setRevisingClaim(claim); setRevisedText(claim.text); setRevisionReason(""); }} style={smallBtn}>✏ Revise</button>
                        <button onClick={() => handleOpenEvidenceModal(claim)} style={{ ...smallBtn, background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" }}>+ Evidence</button>
                        <button onClick={() => handleDeleteClaim(claim.id)} title="Delete claim" style={{ ...smallBtn, background: tint("var(--danger-ink)"), color: "var(--danger-ink)", border: `1px solid ${tint("var(--danger-ink)", 75)}` }}>✕</button>
                      </div>
                    </div>

                    {/* Evidence balance */}
                    <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ flex: 1, height: "8px", borderRadius: "4px", overflow: "hidden", display: "flex", background: "var(--border)" }} title={`${n.supports} supporting · ${n.contradicts} contradicting · ${n.qualifies} qualifying`}>
                        {total > 0 && (
                          <>
                            <div style={{ width: `${(n.supports / total) * 100}%`, background: "var(--success-ink)" }} />
                            <div style={{ width: `${(n.qualifies / total) * 100}%`, background: "var(--warn-ink)" }} />
                            <div style={{ width: `${(n.contradicts / total) * 100}%`, background: "var(--danger-ink)" }} />
                          </>
                        )}
                      </div>
                      <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {total === 0 ? "No evidence" : `${n.supports} for · ${n.contradicts} against · ${n.qualifies} nuance`}
                      </span>
                      <button onClick={() => toggleCollapsed(claim.id)} style={{ ...smallBtn, padding: "3px 9px", fontSize: "11px" }}>{isCollapsed ? "Show details" : "Hide details"}</button>
                    </div>

                    {!isCollapsed && (
                      <>
                        {total === 0 ? (
                          <div style={{ marginTop: "12px", fontSize: "12.5px", color: "var(--text-muted)", fontStyle: "italic" }}>
                            No evidence linked yet. Use “+ Evidence” to link a paper or a highlighted quote.
                          </div>
                        ) : (
                          <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {renderEvidenceColumn(claim, "supports", "Supports")}
                            {renderEvidenceColumn(claim, "contradicts", "Contradicts")}
                            {n.qualifies > 0 && renderEvidenceColumn(claim, "qualifies", "Qualifies")}
                          </div>
                        )}

                        {revs.length > 0 && (
                          <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "8px", border: "1px dashed var(--border)", background: "var(--panel-dark)" }}>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent-ink)", textTransform: "uppercase", marginBottom: "8px" }}>Revision history ({revs.length})</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                              {revs.map((rev: ClaimRevision, i: number) => (
                                <div key={rev.id} style={{ fontSize: "12px", color: "var(--text-main)", borderLeft: "2px solid var(--accent)", paddingLeft: "10px" }}>
                                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Revision #{i + 1} · {new Date(rev.created_at).toLocaleString()}</div>
                                  <div>
                                    <span style={{ color: "var(--danger-ink)", textDecoration: "line-through" }}>“{rev.old_text}”</span>{" "}→{" "}
                                    <span style={{ color: "var(--success-ink)", fontWeight: 600 }}>“{rev.new_text}”</span>
                                  </div>
                                  {rev.reason && <div style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: "2px" }}>Reason: {rev.reason}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Papers rail */}
        {collections.length > 0 && (
          <aside style={{ width: "290px", flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--panel)", overflowY: "auto", padding: "18px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent-ink)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>
              At a glance
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "18px" }}>
              {[
                { label: "Claims", value: claims.length },
                { label: "Evidence links", value: summary.evidence },
                { label: "Contested", value: summary.by.contested + summary.by.challenged },
                { label: "Need evidence", value: summary.by.unsupported },
              ].map((x) => (
                <div key={x.label} style={{ background: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-main)" }}>{x.value}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{x.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent-ink)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>
              Papers in this collection ({papers.length})
            </div>
            {papers.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No papers yet. Add some from Discover.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {paperUse.map(({ paper, supports, contradicts, qualifies, total }) => (
                  <div key={paper.id} onClick={() => navigate(`/paper/${paper.id}`)} title="Open paper" style={{ cursor: "pointer", background: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 10px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.3, overflowWrap: "anywhere" }}>{paper.title}</div>
                    <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      {paper.year ? <span>{paper.year}</span> : null}
                      {total === 0 ? (
                        <span style={{ fontWeight: 700 }}>Not used as evidence</span>
                      ) : (
                        <>
                          {supports > 0 && <span style={{ color: "var(--success-ink)", fontWeight: 700 }}>▲ {supports}</span>}
                          {contradicts > 0 && <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>▼ {contradicts}</span>}
                          {qualifies > 0 && <span style={{ color: "var(--warn-ink)", fontWeight: 700 }}>◆ {qualifies}</span>}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* New Claim Modal */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Create New Claim">
        <form onSubmit={handleCreateClaim}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
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
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
              }}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
              Origin Badge
            </label>
            <select
              value={newClaimOrigin}
              onChange={(e) => setNewClaimOrigin(e.target.value as any)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
              }}
            >
              <option value="user">You (Author hypothesis/synthesis)</option>
              <option value="source">Source (Extracted from paper)</option>
              <option value="ai">Suggested</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              style={{ padding: "8px 16px", backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-main)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newClaimText.trim()}
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--accent)",
                color: "var(--on-accent)",
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
          <div style={{ marginBottom: "12px", backgroundColor: "var(--panel)", color: "var(--text-main)", padding: "10px", borderRadius: "6px", fontSize: "12.5px" }}>
            <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>Original Text:</span>
            <em>"{revisingClaim?.text}"</em>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
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
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
              }}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
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
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setRevisingClaim(null)}
              style={{ padding: "8px 16px", backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-main)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!revisedText.trim() || !revisionReason.trim()}
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--accent)",
                color: "var(--on-accent)",
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
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
              Paper *
            </label>
            <select
              value={selectedPaperId}
              onChange={(e) => handlePaperChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
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
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
              Specific Highlight/Annotation (Optional)
            </label>
            <select
              value={selectedAnnotationId}
              onChange={(e) => setSelectedAnnotationId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
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
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
              Stance *
            </label>
            <select
              value={evidenceStance}
              onChange={(e) => setEvidenceStance(e.target.value as any)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
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
              style={{ padding: "8px 16px", backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-main)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--accent)",
                color: "var(--on-accent)",
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
