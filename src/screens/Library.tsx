import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  getCollectionPapers,
  removePaperFromCollection,
  deletePaper,
  getPaperMetas,
  setPaperMeta,
  fetchWorkMeta,
  lookupDoi,
  upsertPaper,
} from "../lib/api";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { toast } from "../lib/toast";
import { deleteWithUndo } from "../lib/undo";
import { ImportReferencesModal, ExportReferencesModal } from "../components/ReferenceTransfer";
import { Screening } from "./Screening";
import type { Collection, Paper } from "../types";

export const Library: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: "papers" | "screening" = params.get("tab") === "screening" ? "screening" : "papers";
  const setTab = (t: "papers" | "screening") => {
    const next = new URLSearchParams(params);
    if (t === "papers") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & sort state
  const [filterQuery, setFilterQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"year-desc" | "year-asc" | "title-asc" | "title-desc" | "cited-desc">("year-desc");
  const [cites, setCites] = useState<Record<string, number>>({});
  const [fetching, setFetching] = useState<{ done: number; total: number } | null>(null);

  // Modals & form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    loadAll();
    loadCites();
  }, []);

  const loadCites = async () => {
    try {
      const ms = await getPaperMetas();
      const m: Record<string, number> = {};
      ms.forEach((x) => {
        if (x.cited_by_count != null) m[x.paper_id] = x.cited_by_count;
      });
      setCites(m);
    } catch {}
  };

  /** Papers saved before citation data was kept: look their counts up on OpenAlex. */
  const missingCites = papers.filter((p) => cites[p.id] == null && (p.openalex_id || p.doi));
  const fetchCites = async () => {
    const todo = missingCites;
    if (!todo.length || fetching) return;
    setFetching({ done: 0, total: todo.length });
    let ok = 0;
    for (let i = 0; i < todo.length; i++) {
      const p = todo[i];
      try {
        if (p.openalex_id) {
          const m = await fetchWorkMeta(p.openalex_id);
          await setPaperMeta(p.id, m.cited_by_count, m.referenced_works.length ? m.referenced_works : undefined);
        } else if (p.doi) {
          const r = await lookupDoi(p.doi);
          if (r.openalex_id) await upsertPaper({ ...p, openalex_id: r.openalex_id });
          await setPaperMeta(p.id, r.cited_by_count, r.referenced_works && r.referenced_works.length ? r.referenced_works : undefined);
        }
        ok++;
      } catch {}
      setFetching({ done: i + 1, total: todo.length });
    }
    setFetching(null);
    await loadCites();
    if (activeCollectionId) loadPapers(activeCollectionId);
    if (ok === todo.length) toast.success(`Citation counts updated for ${ok} paper${ok === 1 ? "" : "s"}`);
    else toast.error(`Updated ${ok} of ${todo.length}. The others could not be found on OpenAlex (or you are offline).`);
  };

  useEffect(() => {
    if (activeCollectionId) {
      loadPapers(activeCollectionId);
    } else {
      setPapers([]);
    }
  }, [activeCollectionId]);

  const loadAll = async () => {
    try {
      const list = await getCollections();
      setCollections(list);
      if (list.length > 0 && !activeCollectionId) {
        const wanted = params.get("collection") || params.get("collectionId");
        setActiveCollectionId(list.find((c) => c.id === wanted)?.id || list[0].id);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load collections");
    }
  };

  const loadPapers = async (collId: string) => {
    setLoading(true);
    try {
      const p = await getCollectionPapers(collId);
      setPapers(p);
    } catch (e) {
      console.error(e);
      setPapers([]);
      toast.error("Failed to load papers for collection");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    try {
      const created = await createCollection(newCollectionName.trim());
      setNewCollectionName("");
      setShowCreateModal(false);
      setCollections([created, ...collections]);
      setActiveCollectionId(created.id);
      toast.success(`Created collection "${created.name}"`);
    } catch (err: any) {
      toast.error("Error creating collection: " + err?.toString());
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollection || !renameValue.trim()) return;
    try {
      await renameCollection(editingCollection.id, renameValue.trim());
      setCollections(
        collections.map((c) =>
          c.id === editingCollection.id ? { ...c, name: renameValue.trim() } : c
        )
      );
      toast.success("Collection renamed");
      setEditingCollection(null);
    } catch (err: any) {
      toast.error("Error renaming collection: " + err?.toString());
    }
  };

  const handleDeleteCollection = (id: string, name: string) => {
    const before = collections;
    const wasActive = activeCollectionId === id;
    deleteWithUndo({
      label: `Deleted collection "${name}". Its papers stay in the database.`,
      hide: () => {
        const remaining = before.filter((c) => c.id !== id);
        setCollections(remaining);
        if (wasActive) setActiveCollectionId(remaining[0]?.id ?? null);
      },
      show: () => {
        setCollections(before);
        if (wasActive) setActiveCollectionId(id);
      },
      commit: () => deleteCollection(id),
    });
  };

  const handleRemovePaper = (paperId: string, paperTitle: string) => {
    if (!activeCollectionId) return;
    const cid = activeCollectionId;
    const before = papers;
    deleteWithUndo({
      label: `Removed "${paperTitle.slice(0, 40)}${paperTitle.length > 40 ? "…" : ""}" from the collection`,
      hide: () => setPapers((ps) => ps.filter((p) => p.id !== paperId)),
      show: () => setPapers((ps) => (ps.some((p) => p.id === paperId) ? ps : before)),
      commit: () => removePaperFromCollection(cid, paperId),
    });
  };

  // Filtered and sorted papers
  const filteredPapers = papers
    .filter((p) => {
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      const inTitle = p.title.toLowerCase().includes(q);
      const inVenue = (p.venue || "").toLowerCase().includes(q);
      let inAuthors = false;
      try {
        if (p.authors_json) {
          inAuthors = p.authors_json.toLowerCase().includes(q);
        }
      } catch {}
      return inTitle || inVenue || inAuthors;
    })
    .sort((a, b) => {
      if (sortOrder === "year-desc") return (b.year || 0) - (a.year || 0);
      if (sortOrder === "year-asc") return (a.year || 0) - (b.year || 0);
      if (sortOrder === "title-asc") return a.title.localeCompare(b.title);
      if (sortOrder === "title-desc") return b.title.localeCompare(a.title);
      if (sortOrder === "cited-desc") return (cites[b.id] ?? -1) - (cites[a.id] ?? -1);
      return 0;
    });

  const activeCollection = collections.find((c) => c.id === activeCollectionId);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left panel: Collections list */}
      <div
        style={{
          width: "280px",
          minWidth: "280px",
          backgroundColor: "var(--panel-dark)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            Collections
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "4px 10px",
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + New
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
          {collections.length === 0 ? (
            <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No collections yet.<br />Click "+ New" to create one,
              <br />or{" "}
              <button
                onClick={() => setShowImport(true)}
                style={{ background: "none", border: "none", padding: 0, color: "var(--accent-ink)", fontWeight: 700, cursor: "pointer", fontSize: "13px", textDecoration: "underline" }}
              >
                import references
              </button>
              .
            </div>
          ) : (
            collections.map((coll) => {
              const isActive = coll.id === activeCollectionId;
              return (
                <div
                  key={coll.id}
                  onClick={() => setActiveCollectionId(coll.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    marginBottom: "4px",
                    cursor: "pointer",
                    backgroundColor: isActive ? "var(--accent)" : "transparent",
                    color: isActive ? "var(--on-accent)" : "var(--text-main)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📁 {coll.name}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      title="Rename"
                      onClick={() => {
                        setEditingCollection(coll);
                        setRenameValue(coll.name);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: isActive ? "var(--on-accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "12px",
                        padding: "2px 4px",
                      }}
                    >
                      ✏
                    </button>
                    <button
                      title="Delete"
                      onClick={() => handleDeleteCollection(coll.id, coll.name)}
                      style={{
                        background: "none",
                        border: "none",
                        color: isActive ? "var(--on-accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "12px",
                        padding: "2px 4px",
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Papers in collection */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: tab === "screening" ? "hidden" : "auto", backgroundColor: "var(--panel-dark)" }}>
        {activeCollection && (
          <div role="tablist" aria-label="Collection views" style={{ display: "flex", gap: 4, padding: "10px 36px 0", borderBottom: "1px solid var(--border)", background: "var(--panel)", flexShrink: 0 }}>
            {([
              ["papers", `📄 Papers (${papers.length})`],
              ["screening", "🧪 Screening & PRISMA"],
            ] as ["papers" | "screening", string][]).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "1px solid var(--border-strong, var(--border))",
                  borderBottom: tab === id ? "1px solid var(--panel-dark)" : "1px solid var(--border-strong, var(--border))",
                  marginBottom: -1,
                  borderRadius: "8px 8px 0 0",
                  background: tab === id ? "var(--panel-dark)" : "transparent",
                  color: tab === id ? "var(--accent-ink)" : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {activeCollection && tab === "screening" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Screening embedded collectionId={activeCollection.id} />
          </div>
        ) : activeCollection ? (
          <div style={{ padding: "28px 36px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                paddingBottom: "16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <h1 style={{ fontSize: "22px", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                  {activeCollection.name}
                </h1>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  {papers.length} {papers.length === 1 ? "paper" : "papers"} in collection
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowImport(true)}
                  style={{ padding: "8px 14px", backgroundColor: "var(--panel-dark)", color: "var(--accent-ink)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  ⬆ Import references
                </button>
                <button
                  onClick={() => setShowExport(true)}
                  style={{ padding: "8px 14px", backgroundColor: "var(--panel-dark)", color: "var(--accent-ink)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  ⬇ Export BibTeX / RIS
                </button>
                <Link
                  to={`/compare?collectionId=${activeCollection.id}`}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "var(--panel-dark)",
                    color: "var(--accent-ink)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  📊 Compare in Table
                </Link>
                <Link
                  to={`/lineage?collectionId=${activeCollection.id}`}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "var(--panel-dark)",
                    color: "var(--accent-ink)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  🧬 Lineage & Claims
                </Link>
              </div>
            </div>

            {/* Filter and Sorting bar */}
            {papers.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  marginBottom: "16px",
                  padding: "10px 14px",
                  backgroundColor: "var(--panel-dark)",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                }}
              >
                <input
                  type="text"
                  placeholder="Filter papers by title, author, or venue..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                    backgroundColor: "var(--panel-dark)",
                  }}
                />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                    backgroundColor: "var(--panel-dark)",
                    color: "var(--text-main)",
                  }}
                >
                  <option value="year-desc">Year (Newest first)</option>
                  <option value="year-asc">Year (Oldest first)</option>
                  <option value="title-asc">Title (A to Z)</option>
                  <option value="title-desc">Title (Z to A)</option>
                  <option value="cited-desc">Most cited first</option>
                </select>
                {missingCites.length > 0 && (
                  <button
                    onClick={fetchCites}
                    disabled={!!fetching}
                    title="Look up how often each paper is cited, from OpenAlex"
                    style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: 600, backgroundColor: "var(--panel-dark)", color: "var(--accent-ink)", cursor: fetching ? "wait" : "pointer", whiteSpace: "nowrap" }}
                  >
                    {fetching ? `Fetching ${fetching.done}/${fetching.total}…` : `↻ Get citation counts (${missingCites.length})`}
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--accent-ink)" }}>Loading papers...</div>
            ) : papers.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  backgroundColor: "var(--panel-dark)",
                  borderRadius: "8px",
                  border: "1px dashed var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
                <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>No papers in this collection yet</h3>
                <p style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
                  Go to the Discover screen to search OpenAlex and add papers here.
                </p>
                <button
                  onClick={() => navigate("/discover")}
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
                  🔍 Go to Discover
                </button>
              </div>
            ) : filteredPapers.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No papers match "{filterQuery}".
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {filteredPapers.map((paper) => {
                  let authorsList: string[] = [];
                  try {
                    if (paper.authors_json) {
                      authorsList = JSON.parse(paper.authors_json);
                    }
                  } catch {
                    authorsList = [];
                  }

                  const hasPdf = Boolean(paper.pdf_path && paper.pdf_path.length > 0);

                  return (
                    <div
                      key={paper.id}
                      style={{
                        padding: "18px 20px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--panel-dark)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "16px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <Link
                          to={`/paper/${paper.id}`}
                          style={{
                            fontSize: "16px",
                            fontWeight: 700,
                            color: "var(--text-main)",
                            textDecoration: "none",
                            lineHeight: 1.35,
                            display: "inline-block",
                            marginBottom: "6px",
                          }}
                        >
                          {paper.title}
                        </Link>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
                          <span>{authorsList.length > 0 ? authorsList.join(", ") : "Unknown authors"}</span>
                          {paper.year && <span> • {paper.year}</span>}
                          {paper.venue && <span> • <em>{paper.venue}</em></span>}
                        </div>

                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          {paper.doi && (
                            <span style={{ fontSize: "11px", backgroundColor: "var(--panel)", color: "var(--accent-ink)", padding: "2px 8px", borderRadius: "4px", fontWeight: 500 }}>
                              DOI: {paper.doi}
                            </span>
                          )}
                          {cites[paper.id] != null && (
                            <span style={{ fontSize: "11px", backgroundColor: "var(--nav-active-bg)", color: "var(--accent-ink)", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                              ★ {cites[paper.id].toLocaleString()} {cites[paper.id] === 1 ? "citation" : "citations"}
                            </span>
                          )}
                          {hasPdf ? (
                            <span style={{ fontSize: "11px", backgroundColor: "color-mix(in srgb, var(--success-ink) 13%, var(--panel-dark))", color: "var(--success-ink)", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                              ✓ PDF Uploaded
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", backgroundColor: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))", color: "var(--danger-ink)", padding: "2px 8px", borderRadius: "4px" }}>
                              No PDF
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Link
                          to={`/paper/${paper.id}`}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "4px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--panel-dark)",
                            color: "var(--text-main)",
                            textDecoration: "none",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          Details
                        </Link>
                        {hasPdf ? (
                          <Link
                            to={`/reader/${paper.id}`}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "4px",
                              backgroundColor: "var(--accent)",
                              color: "var(--on-accent)",
                              textDecoration: "none",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            📖 Read & Annotate
                          </Link>
                        ) : (
                          <Link
                            to={`/paper/${paper.id}`}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "4px",
                              backgroundColor: "var(--accent)",
                              color: "var(--on-accent)",
                              textDecoration: "none",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            ⬆ Upload PDF
                          </Link>
                        )}
                        <button
                          onClick={() => handleRemovePaper(paper.id, paper.title)}
                          title="Remove from collection"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--danger-ink)",
                            cursor: "pointer",
                            fontSize: "15px",
                            padding: "4px 8px",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>
            Select or create a collection from the sidebar to view its papers.
          </div>
        )}
      </div>

      {/* New Collection Modal */}
      <ImportReferencesModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        collections={collections}
        defaultCollectionId={activeCollectionId}
        onImported={async (collId, created) => {
          if (created) setCollections((cs) => [...cs, created]);
          setActiveCollectionId(collId);
          loadPapers(collId);
        }}
      />
      <ExportReferencesModal isOpen={showExport} onClose={() => setShowExport(false)} name={activeCollection?.name ?? "references"} papers={papers} />

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Collection">
        <form onSubmit={handleCreateCollection}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "6px" }}>
              Collection Name
            </label>
            <input
              type="text"
              autoFocus
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="e.g. NIDS review, Deep Learning Vision..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--panel-dark)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newCollectionName.trim()}
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
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Rename Collection Modal */}
      <Modal isOpen={Boolean(editingCollection)} onClose={() => setEditingCollection(null)} title="Rename Collection">
        <form onSubmit={handleRename}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "6px" }}>
              Collection Name
            </label>
            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setEditingCollection(null)}
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--panel-dark)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!renameValue.trim()}
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
              Save
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
        confirmLabel={confirmDialog.confirmLabel}
        isDanger={confirmDialog.isDanger}
      />
    </div>
  );
};
