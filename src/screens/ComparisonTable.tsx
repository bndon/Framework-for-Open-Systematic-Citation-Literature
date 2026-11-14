import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getCollections,
  getCollectionPapers,
  getTemplates,
  getExtractions,
  upsertExtraction,
  getAnnotations,
} from "../lib/api";
import { suggestFields, type ExtractionSuggestion } from "../lib/extraction";
import { OriginBadge } from "../components/OriginBadge";
import { Modal } from "../components/Modal";
import { toast } from "../lib/toast";
import type { Collection, Extraction, Paper, Template, TemplateField, Annotation } from "../types";

export const ComparisonTable: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialCollectionId = searchParams.get("collectionId");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [papers, setPapers] = useState<Paper[]>([]);
  const [extractionsByPaper, setExtractionsByPaper] = useState<Record<string, Record<string, Extraction>>>({});
  const [loading, setLoading] = useState(false);

  // Inline paper annotations viewer panel state
  const [expandedPaperAnnotations, setExpandedPaperAnnotations] = useState<
    Record<string, { loading: boolean; annotations: Annotation[] }>
  >({});

  // Cell editing modal
  const [editingCell, setEditingCell] = useState<{
    paper: Paper;
    field: TemplateField;
    extraction?: Extraction;
  } | null>(null);
  const [cellValue, setCellValue] = useState("");
  const [cellOrigin, setCellOrigin] = useState<"source" | "user" | "ai">("user");

  // AI Suggestions modal
  const [aiSuggestionsModal, setAiSuggestionsModal] = useState<{
    paper: Paper;
    suggestions: ExtractionSuggestion[];
  } | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const colls = await getCollections();
      setCollections(colls);
      const lastColl = localStorage.getItem("foscl:last_comparison_collection");
      const chosenColl = initialCollectionId || (lastColl && colls.some((c) => c.id === lastColl) ? lastColl : colls[0]?.id || "");
      setSelectedCollectionId(chosenColl);

      const tmpls = await getTemplates();
      setTemplates(tmpls);
      const lastTmpl = localStorage.getItem("foscl:last_comparison_template");
      if (tmpls.length > 0) {
        const chosenTmpl = tmpls.some((t) => t.id === lastTmpl) ? (lastTmpl as string) : tmpls[0].id;
        setSelectedTemplateId(chosenTmpl);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to initialize collections or templates.");
    }
  };

  useEffect(() => {
    if (selectedCollectionId && selectedTemplateId) {
      loadMatrix(selectedCollectionId, selectedTemplateId);
      localStorage.setItem("foscl:last_comparison_collection", selectedCollectionId);
      localStorage.setItem("foscl:last_comparison_template", selectedTemplateId);
    }
  }, [selectedCollectionId, selectedTemplateId]);

  const loadMatrix = async (collId: string, tmplId: string) => {
    setLoading(true);
    try {
      const pList = await getCollectionPapers(collId);
      setPapers(pList);

      const extMap: Record<string, Record<string, Extraction>> = {};
      for (const p of pList) {
        const exts = await getExtractions(p.id, tmplId);
        extMap[p.id] = {};
        for (const e of exts) {
          extMap[p.id][e.field_id] = e;
        }
      }
      setExtractionsByPaper(extMap);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load comparison data.");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaperAnnotations = async (paperId: string) => {
    if (expandedPaperAnnotations[paperId]) {
      setExpandedPaperAnnotations((prev) => {
        const updated = { ...prev };
        delete updated[paperId];
        return updated;
      });
      return;
    }

    setExpandedPaperAnnotations((prev) => ({
      ...prev,
      [paperId]: { loading: true, annotations: [] },
    }));

    try {
      const ann = await getAnnotations(paperId);
      setExpandedPaperAnnotations((prev) => ({
        ...prev,
        [paperId]: { loading: false, annotations: ann },
      }));
    } catch {
      setExpandedPaperAnnotations((prev) => ({
        ...prev,
        [paperId]: { loading: false, annotations: [] },
      }));
    }
  };

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId);
  const fields = currentTemplate?.fields || [];

  const handleOpenEditCell = (paper: Paper, field: TemplateField) => {
    const existing = extractionsByPaper[paper.id]?.[field.id];
    setEditingCell({ paper, field, extraction: existing });
    setCellValue(existing?.value || "");
    setCellOrigin((existing?.origin as any) || "user");
  };

  const handleSaveCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;

    try {
      const extraction: Extraction = {
        id: editingCell.extraction?.id || "",
        paper_id: editingCell.paper.id,
        field_id: editingCell.field.id,
        value: cellValue.trim(),
        origin: cellOrigin,
        annotation_ids_json: editingCell.extraction?.annotation_ids_json,
        updated_at: new Date().toISOString(),
      };

      await upsertExtraction(extraction);

      setExtractionsByPaper((prev) => ({
        ...prev,
        [editingCell.paper.id]: {
          ...prev[editingCell.paper.id],
          [editingCell.field.id]: extraction,
        },
      }));

      setEditingCell(null);
      toast.success("Extraction saved");
    } catch (err: any) {
      toast.error("Error saving extraction: " + err?.toString());
    }
  };

  const handleRunAiMock = async (paper: Paper) => {
    try {
      const ann = await getAnnotations(paper.id);
      if (ann.length === 0) {
        toast.info(
          "No annotations found for this paper. The mock AI synthesizes proposals from real highlighted quotes."
        );
        return;
      }

      const suggestions = suggestFields(ann, fields);
      if (suggestions.length === 0) {
        toast.info("Mock AI could not find matching annotations for this template's fields.");
        return;
      }

      setAiSuggestionsModal({ paper, suggestions });
    } catch (err: any) {
      toast.error("Error running Mock AI: " + err?.toString());
    }
  };

  const handleAcceptSuggestion = async (sug: ExtractionSuggestion) => {
    if (!aiSuggestionsModal) return;
    const paper = aiSuggestionsModal.paper;

    if (!sug.annotation_ids || sug.annotation_ids.length === 0) {
      toast.error("Rejected: Suggestion lacks a valid annotation ID reference.");
      return;
    }

    try {
      const existing = extractionsByPaper[paper.id]?.[sug.field_id];
      const extraction: Extraction = {
        id: existing?.id || "",
        paper_id: paper.id,
        field_id: sug.field_id,
        value: sug.value,
        origin: "ai",
        annotation_ids_json: JSON.stringify(sug.annotation_ids),
        updated_at: new Date().toISOString(),
      };

      await upsertExtraction(extraction);

      setExtractionsByPaper((prev) => ({
        ...prev,
        [paper.id]: {
          ...prev[paper.id],
          [sug.field_id]: extraction,
        },
      }));

      const remaining = aiSuggestionsModal.suggestions.filter((s) => s.field_id !== sug.field_id);
      if (remaining.length === 0) {
        setAiSuggestionsModal(null);
      } else {
        setAiSuggestionsModal({ ...aiSuggestionsModal, suggestions: remaining });
      }
      toast.success(`Accepted value for ${sug.field_name}`);
    } catch (err: any) {
      toast.error("Error accepting suggestion: " + err?.toString());
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top Filter Bar */}
      <div
        style={{
          padding: "16px 28px",
          backgroundColor: "#FAF5EC",
          borderBottom: "1px solid #E4DACB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", color: "#4A2418", margin: "0 0 2px 0" }}>Comparison Table</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "#7A6458" }}>
            Matrix comparing papers across structured extraction fields with origin badges.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#8A5A7A", textTransform: "uppercase", marginRight: "6px" }}>
              Collection:
            </label>
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
          </div>

          <div>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#8A5A7A", textTransform: "uppercase", marginRight: "6px" }}>
              Template:
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #D5C8B8", fontSize: "13px", backgroundColor: "#fff" }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Workspace */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px", backgroundColor: "#fff" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "50px", color: "#8A5A7A" }}>Loading matrix...</div>
        ) : papers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#8A796F" }}>
            No papers found in this collection. Add papers via Discover or Library first.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              border: "1px solid #E8DFD3",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#FAF5EC", borderBottom: "2px solid #E4DACB" }}>
                <th
                  style={{
                    padding: "12px 14px",
                    textAlign: "left",
                    color: "#4A2418",
                    fontWeight: 700,
                    width: "250px",
                    minWidth: "250px",
                    position: "sticky",
                    left: 0,
                    backgroundColor: "#FAF5EC",
                    zIndex: 2,
                    borderRight: "1px solid #E4DACB",
                  }}
                >
                  Paper (Row)
                </th>
                {fields.map((f: TemplateField) => (
                  <th
                    key={f.id}
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      color: "#4A2418",
                      fontWeight: 700,
                      minWidth: "190px",
                      borderRight: "1px solid #EFE6D8",
                    }}
                  >
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {papers.map((paper) => {
                const isAnnExpanded = Boolean(expandedPaperAnnotations[paper.id]);
                const annData = expandedPaperAnnotations[paper.id];

                return (
                  <tr key={paper.id} style={{ borderBottom: "1px solid #EFE6D8" }}>
                    {/* Paper Info Column */}
                    <td
                      style={{
                        padding: "12px 14px",
                        fontWeight: 600,
                        color: "#4A2418",
                        position: "sticky",
                        left: 0,
                        backgroundColor: "#FAF7F2",
                        borderRight: "1px solid #E4DACB",
                        zIndex: 1,
                        verticalAlign: "top",
                      }}
                    >
                      <div
                        onClick={() => handleTogglePaperAnnotations(paper.id)}
                        style={{
                          marginBottom: "4px",
                          lineHeight: 1.3,
                          cursor: "pointer",
                          color: "#8A5A7A",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "6px",
                        }}
                        title="Click to toggle annotations view for this paper"
                      >
                        <span style={{ fontSize: "11px", marginTop: "2px" }}>
                          {isAnnExpanded ? "▼" : "▶"}
                        </span>
                        <span style={{ textDecoration: "underline" }}>{paper.title}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#8A796F", marginBottom: "8px", marginLeft: "14px" }}>
                        {paper.year || "Year N/A"}
                      </div>
                      <button
                        onClick={() => handleRunAiMock(paper)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: "#FEF9E7",
                          color: "#B7950B",
                          border: "1px solid #F9E79F",
                          borderRadius: "4px",
                          cursor: "pointer",
                          display: "inline-block",
                        }}
                      >
                        ⚡ Mock AI Suggestions
                      </button>

                      {/* Inline Annotations Mini-Panel */}
                      {isAnnExpanded && (
                        <div
                          style={{
                            marginTop: "10px",
                            padding: "8px 10px",
                            backgroundColor: "#fff",
                            borderRadius: "6px",
                            border: "1px solid #EADDCB",
                            maxHeight: "180px",
                            overflowY: "auto",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#8A5A7A",
                              textTransform: "uppercase",
                              marginBottom: "6px",
                            }}
                          >
                            Annotations ({annData?.annotations.length || 0})
                          </div>
                          {annData?.loading ? (
                            <div style={{ fontSize: "11px", color: "#8A796F" }}>Loading highlights...</div>
                          ) : annData?.annotations.length === 0 ? (
                            <div style={{ fontSize: "11px", color: "#8A796F", fontStyle: "italic" }}>
                              No annotations found for this paper.
                            </div>
                          ) : (
                            annData?.annotations.map((ann) => (
                              <div
                                key={ann.id}
                                style={{
                                  marginBottom: "6px",
                                  paddingLeft: "6px",
                                  borderLeft: `3px solid ${ann.color || "#FFEB3B"}`,
                                  fontSize: "11px",
                                  color: "#3B2A20",
                                }}
                              >
                                <span style={{ fontStyle: "italic" }}>
                                  "{ann.quote.slice(0, 100)}
                                  {ann.quote.length > 100 ? "..." : ""}"
                                </span>
                                {ann.page && <span style={{ color: "#9E8B7F", marginLeft: "4px" }}>(p. {ann.page})</span>}
                                {ann.note && <div style={{ color: "#6E4363", marginTop: "2px" }}>📝 {ann.note}</div>}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </td>

                    {/* Template Field Cells */}
                    {fields.map((field: TemplateField) => {
                      const ext = extractionsByPaper[paper.id]?.[field.id];
                      const isEmpty = !ext || !ext.value || ext.value.trim().length === 0;

                      return (
                        <td
                          key={field.id}
                          onClick={() => handleOpenEditCell(paper, field)}
                          title="Click to edit value"
                          style={{
                            padding: "10px 12px",
                            verticalAlign: "top",
                            borderRight: "1px solid #EFE6D8",
                            cursor: "pointer",
                            backgroundColor: isEmpty ? "#FFFDF5" : "#fff",
                            transition: "background 0.15s ease",
                          }}
                        >
                          {isEmpty ? (
                            <div
                              style={{
                                color: "#B8860B",
                                fontStyle: "italic",
                                fontSize: "11.5px",
                                padding: "4px 6px",
                                backgroundColor: "#FFF8DC",
                                borderRadius: "4px",
                                display: "inline-block",
                              }}
                            >
                              Empty (Click to fill)
                            </div>
                          ) : (
                            <div>
                              <div style={{ marginBottom: "6px", lineHeight: 1.45, color: "#3B2A20" }}>
                                {ext.value}
                              </div>
                              <OriginBadge origin={ext.origin} />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Cell Modal */}
      <Modal
        isOpen={Boolean(editingCell)}
        onClose={() => setEditingCell(null)}
        title={`Edit Field: ${editingCell?.field.name}`}
      >
        <form onSubmit={handleSaveCell}>
          <div style={{ fontSize: "12px", color: "#7A6458", marginBottom: "12px" }}>
            <strong>Paper:</strong> {editingCell?.paper.title}
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "6px" }}>
              Extracted Value
            </label>
            <textarea
              rows={5}
              value={cellValue}
              onChange={(e) => setCellValue(e.target.value)}
              placeholder="Enter extraction details or observations..."
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

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "6px" }}>
              Origin Badge
            </label>
            <select
              value={cellOrigin}
              onChange={(e) => setCellOrigin(e.target.value as any)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "#fff",
              }}
            >
              <option value="user">You (Manual input)</option>
              <option value="source">Source (Direct author statement)</option>
              <option value="ai">AI (mock) (Assisted suggestion)</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setEditingCell(null)}
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
              Save Value
            </button>
          </div>
        </form>
      </Modal>

      {/* Mock AI Suggestions Modal */}
      <Modal
        isOpen={Boolean(aiSuggestionsModal)}
        onClose={() => setAiSuggestionsModal(null)}
        title="AI Suggestions (Mock)"
        width="650px"
      >
        <div style={{ marginBottom: "14px", fontSize: "13px", color: "#555" }}>
          The mock AI analyzed highlighted annotations for <strong>"{aiSuggestionsModal?.paper.title}"</strong> and proposes the following values:
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflowY: "auto" }}>
          {aiSuggestionsModal?.suggestions.map((sug) => (
            <div
              key={sug.field_id}
              style={{
                padding: "12px 14px",
                backgroundColor: "#FEF9E7",
                border: "1px solid #F9E79F",
                borderRadius: "6px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontWeight: 700, color: "#7D6608", fontSize: "13px" }}>
                  {sug.field_name}
                </span>
                <span style={{ fontSize: "11px", backgroundColor: "#FFF", padding: "2px 6px", borderRadius: "4px", color: "#888", border: "1px solid #EADDCB" }}>
                  Ann ID: {sug.annotation_ids.join(", ")}
                </span>
              </div>
              <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", fontStyle: "italic", color: "#333", lineHeight: 1.4 }}>
                "{sug.value}"
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  onClick={() => {
                    const rem = aiSuggestionsModal.suggestions.filter((s) => s.field_id !== sug.field_id);
                    if (rem.length === 0) setAiSuggestionsModal(null);
                    else setAiSuggestionsModal({ ...aiSuggestionsModal, suggestions: rem });
                  }}
                  style={{
                    padding: "4px 10px",
                    backgroundColor: "#fff",
                    border: "1px solid #D5C8B8",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAcceptSuggestion(sug)}
                  style={{
                    padding: "4px 12px",
                    backgroundColor: "#8A5A7A",
                    color: "#FAF5EC",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Accept as AI (mock)
                </button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};
