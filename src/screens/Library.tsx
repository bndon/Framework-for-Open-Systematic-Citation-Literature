import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  getCollectionPapers,
  removePaperFromCollection,
  deletePaper,
} from "../lib/api";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { toast } from "../lib/toast";
import type { Collection, Paper } from "../types";

export const Library: React.FC = () => {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & sort state
  const [filterQuery, setFilterQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"year-desc" | "year-asc" | "title-asc" | "title-desc">("year-desc");

  // Modals & form state
  const [showCreateModal, setShowCreateModal] = useState(false);
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
  }, []);

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
        setActiveCollectionId(list[0].id);
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
    setConfirmDialog({
      isOpen: true,
      title: "Delete Collection",
      message: `Are you sure you want to delete collection "${name}"? Papers will remain in the database.`,
      confirmLabel: "Delete Collection",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteCollection(id);
          const remaining = collections.filter((c) => c.id !== id);
          setCollections(remaining);
          if (activeCollectionId === id) {
            setActiveCollectionId(remaining[0]?.id ?? null);
          }
          toast.success(`Deleted collection "${name}"`);
        } catch (err: any) {
          toast.error("Error deleting collection: " + err?.toString());
        }
      },
    });
  };

  const handleRemovePaper = (paperId: string, paperTitle: string) => {
    if (!activeCollectionId) return;
    setConfirmDialog({
      isOpen: true,
      title: "Remove Paper",
      message: `Remove "${paperTitle.slice(0, 50)}..." from this collection?`,
      confirmLabel: "Remove",
      isDanger: true,
      onConfirm: async () => {
        try {
          await removePaperFromCollection(activeCollectionId, paperId);
          setPapers(papers.filter((p) => p.id !== paperId));
          toast.success("Removed paper from collection");
        } catch (err: any) {
          toast.error("Error removing paper: " + err?.toString());
        }
      },
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
      return 0;
    });

  const activeCollection = collections.find((c) => c.id === activeCollectionId);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left panel: Collections list */}
      <div
        style={{
          width: "280px",
          minWidth: "280px",
          backgroundColor: "#FAF7F2",
          borderRight: "1px solid #E4DACB",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 16px",
            borderBottom: "1px solid #EADDCB",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#4A2418" }}>
            Collections
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "4px 10px",
              backgroundColor: "#8A5A7A",
              color: "#FAF5EC",
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
            <div style={{ padding: "20px 10px", textAlign: "center", color: "#8A796F", fontSize: "13px" }}>
              No collections yet.<br />Click "+ New" to create one.
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
                    backgroundColor: isActive ? "#8A5A7A" : "transparent",
                    color: isActive ? "#FAF5EC" : "#4A2418",
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
                        color: isActive ? "#FAF5EC" : "#7A6458",
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
                        color: isActive ? "#FAF5EC" : "#7A6458",
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", backgroundColor: "#fff" }}>
        {activeCollection ? (
          <div style={{ padding: "28px 36px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                paddingBottom: "16px",
                borderBottom: "1px solid #EFE6D8",
              }}
            >
              <div>
                <h1 style={{ fontSize: "22px", color: "#4A2418", margin: "0 0 4px 0" }}>
                  {activeCollection.name}
                </h1>
                <p style={{ margin: 0, fontSize: "13px", color: "#7A6458" }}>
                  {papers.length} {papers.length === 1 ? "paper" : "papers"} in collection
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <Link
                  to={`/compare?collectionId=${activeCollection.id}`}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "#FAF5EC",
                    color: "#8A5A7A",
                    border: "1px solid #D5C8B8",
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
                    backgroundColor: "#FAF5EC",
                    color: "#8A5A7A",
                    border: "1px solid #D5C8B8",
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
                  backgroundColor: "#FAF7F2",
                  borderRadius: "6px",
                  border: "1px solid #EADDCB",
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
                    border: "1px solid #D5C8B8",
                    fontSize: "12px",
                    backgroundColor: "#fff",
                  }}
                />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "4px",
                    border: "1px solid #D5C8B8",
                    fontSize: "12px",
                    backgroundColor: "#fff",
                    color: "#4A2418",
                  }}
                >
                  <option value="year-desc">Year (Newest first)</option>
                  <option value="year-asc">Year (Oldest first)</option>
                  <option value="title-asc">Title (A to Z)</option>
                  <option value="title-desc">Title (Z to A)</option>
                </select>
              </div>
            )}

            {loading ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#8A5A7A" }}>Loading papers...</div>
            ) : papers.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  backgroundColor: "#FAF7F2",
                  borderRadius: "8px",
                  border: "1px dashed #D5C8B8",
                  color: "#7A6458",
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
                <h3 style={{ margin: "0 0 6px 0", color: "#4A2418" }}>No papers in this collection yet</h3>
                <p style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
                  Go to the Discover screen to search OpenAlex and add papers here.
                </p>
                <button
                  onClick={() => navigate("/")}
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
                  🔍 Go to Discover
                </button>
              </div>
            ) : filteredPapers.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#8A796F", fontSize: "13px" }}>
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
                        border: "1px solid #E8DFD3",
                        backgroundColor: "#fff",
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
                            color: "#4A2418",
                            textDecoration: "none",
                            lineHeight: 1.35,
                            display: "inline-block",
                            marginBottom: "6px",
                          }}
                        >
                          {paper.title}
                        </Link>
                        <div style={{ fontSize: "13px", color: "#7A6458", marginBottom: "8px" }}>
                          <span>{authorsList.length > 0 ? authorsList.join(", ") : "Unknown authors"}</span>
                          {paper.year && <span> • {paper.year}</span>}
                          {paper.venue && <span> • <em>{paper.venue}</em></span>}
                        </div>

                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          {paper.doi && (
                            <span style={{ fontSize: "11px", backgroundColor: "#F0EAE1", color: "#6E4363", padding: "2px 8px", borderRadius: "4px", fontWeight: 500 }}>
                              DOI: {paper.doi}
                            </span>
                          )}
                          {hasPdf ? (
                            <span style={{ fontSize: "11px", backgroundColor: "#E8F8F5", color: "#16A085", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                              ✓ PDF Uploaded
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", backgroundColor: "#FDEDEC", color: "#C0392B", padding: "2px 8px", borderRadius: "4px" }}>
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
                            border: "1px solid #D5C8B8",
                            backgroundColor: "#FAF5EC",
                            color: "#4A2418",
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
                              backgroundColor: "#8A5A7A",
                              color: "#FAF5EC",
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
                              backgroundColor: "#6E4363",
                              color: "#FAF5EC",
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
                            color: "#B03A2E",
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
          <div style={{ padding: "60px", textAlign: "center", color: "#8A796F" }}>
            Select or create a collection from the sidebar to view its papers.
          </div>
        )}
      </div>

      {/* New Collection Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Collection">
        <form onSubmit={handleCreateCollection}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "6px" }}>
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
                border: "1px solid #C4B5A5",
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
                backgroundColor: "#fff",
                border: "1px solid #D5C8B8",
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
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
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
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "6px" }}>
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
                border: "1px solid #C4B5A5",
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
                backgroundColor: "#fff",
                border: "1px solid #D5C8B8",
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
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
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
