import React, { useState, useEffect, useMemo } from "react";
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

  // View options
  const [layout, setLayout] = useState<"columns" | "rows">(() => (localStorage.getItem("foscl:compare_layout") === "rows" ? "rows" : "columns"));
  const [paperFilter, setPaperFilter] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);

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

  const shownPapers = useMemo(() => {
    const q = paperFilter.trim().toLowerCase();
    return papers.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !(p.venue || "").toLowerCase().includes(q)) return false;
      if (gapsOnly && fields.every((f) => (extractionsByPaper[p.id]?.[f.id]?.value || "").trim())) return false;
      return true;
    });
  }, [papers, paperFilter, gapsOnly, fields, extractionsByPaper]);

  const isFilled = (paperId: string, fieldId: string) => Boolean((extractionsByPaper[paperId]?.[fieldId]?.value || "").trim());
  const paperDone = (paperId: string) => fields.filter((f) => isFilled(paperId, f.id)).length;
  const totalCells = papers.length * fields.length;
  const filledCells = papers.reduce((n, p) => n + paperDone(p.id), 0);
  const pct = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;

  const changeLayout = (l: "columns" | "rows") => {
    setLayout(l);
    try { localStorage.setItem("foscl:compare_layout", l); } catch {}
  };

  const copyAsTable = async () => {
    const esc = (v: string) => v.replace(/\t|\r?\n/g, " ");
    const header = ["Paper", "Year", ...fields.map((f) => f.name)].join("\t");
    const rows = shownPapers.map((p) =>
      [esc(p.title), String(p.year ?? ""), ...fields.map((f) => esc(extractionsByPaper[p.id]?.[f.id]?.value || ""))].join("\t")
    );
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      toast.success("Table copied — paste it into Word or Sheets");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--accent)" : "var(--panel-dark)",
    color: active ? "var(--on-accent)" : "var(--text-main)",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  });
  const selectStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", backgroundColor: "var(--panel-dark)", color: "var(--text-main)" };

  // One editable cell, shared by both layouts.
  const renderCell = (paper: Paper, field: TemplateField) => {
    const ext = extractionsByPaper[paper.id]?.[field.id];
    const empty = !ext || !ext.value || ext.value.trim().length === 0;
    return (
      <div
        onClick={() => handleOpenEditCell(paper, field)}
        title="Click to edit"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenEditCell(paper, field); } }}
        style={{ cursor: "pointer", minHeight: "44px", borderRadius: "6px", padding: "6px 8px", margin: "-6px -8px" }}
      >
        {empty ? (
          <span style={{ display: "inline-block", padding: "4px 10px", border: "1px dashed var(--border)", borderRadius: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
            ＋ Add
          </span>
        ) : (
          <>
            <div style={{ marginBottom: "6px", lineHeight: 1.45, color: "var(--text-main)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ext.value}</div>
            <OriginBadge origin={ext.origin} />
          </>
        )}
      </div>
    );
  };

  // Paper identity block: title, year, completion, AI + annotations.
  const renderPaperHead = (paper: Paper) => {
    const open = Boolean(expandedPaperAnnotations[paper.id]);
    const ann = expandedPaperAnnotations[paper.id];
    const done = paperDone(paper.id);
    return (
      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
        <div
          onClick={() => handleTogglePaperAnnotations(paper.id)}
          title="Click to show this paper's highlights"
          style={{ display: "flex", gap: "6px", cursor: "pointer", color: "var(--accent-ink)", lineHeight: 1.3, marginBottom: "4px" }}
        >
          <span style={{ fontSize: "10px", marginTop: "3px" }}>{open ? "▼" : "▶"}</span>
          <span style={{ textDecoration: "underline", overflowWrap: "anywhere" }}>{paper.title}</span>
        </div>
        <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-muted)", marginBottom: "8px", marginLeft: "16px" }}>
          {paper.year || "Year N/A"}{paper.venue ? ` · ${paper.venue}` : ""}
        </div>
        <div style={{ marginLeft: "16px", marginBottom: "8px" }}>
          <div style={{ height: "5px", borderRadius: "3px", background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${fields.length ? (done / fields.length) * 100 : 0}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-muted)", marginTop: "3px" }}>{done}/{fields.length} fields filled</div>
        </div>
        <button
          onClick={() => handleRunAiMock(paper)}
          style={{ marginLeft: "16px", padding: "4px 8px", fontSize: "11px", fontWeight: 600, backgroundColor: "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))", color: "var(--warn-ink)", border: "1px solid color-mix(in srgb, var(--warn-ink) 35%, var(--panel-dark))", borderRadius: "4px", cursor: "pointer" }}
        >
          ⚡ Mock AI Suggestions
        </button>
        {open && (
          <div style={{ marginTop: "10px", marginLeft: "16px", padding: "8px 10px", backgroundColor: "var(--panel)", borderRadius: "6px", border: "1px solid var(--border)", maxHeight: "180px", overflowY: "auto", fontWeight: 400 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase", marginBottom: "6px" }}>
              Annotations ({ann?.annotations.length || 0})
            </div>
            {ann?.loading ? (
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Loading highlights...</div>
            ) : ann?.annotations.length === 0 ? (
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>No annotations found for this paper.</div>
            ) : (
              ann?.annotations.map((a) => (
                <div key={a.id} style={{ marginBottom: "6px", paddingLeft: "6px", borderLeft: `3px solid ${a.color || "var(--signal)"}`, fontSize: "11px", color: "var(--text-main)" }}>
                  <span style={{ fontStyle: "italic" }}>"{a.quote.slice(0, 100)}{a.quote.length > 100 ? "..." : ""}"</span>
                  {a.page && <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>(p. {a.page})</span>}
                  {a.note && <div style={{ color: "var(--accent-ink)", marginTop: "2px" }}>📝 {a.note}</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const th: React.CSSProperties = { padding: "12px 14px", textAlign: "left", verticalAlign: "top", color: "var(--text-main)", fontWeight: 700, backgroundColor: "var(--panel)", borderBottom: "2px solid var(--border)", borderRight: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 3 };
  const stickyL: React.CSSProperties = { position: "sticky", left: 0, backgroundColor: "var(--panel)", borderRight: "1px solid var(--border)", zIndex: 2 };
  const td: React.CSSProperties = { padding: "12px 14px", verticalAlign: "top", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", backgroundColor: "var(--panel-dark)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header + controls */}
      <div style={{ padding: "14px 28px", backgroundColor: "var(--panel-dark)", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "20px", color: "var(--text-main)", margin: "0 0 2px 0" }}>Comparison Table</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              Compare papers across structured extraction fields, each value tagged with where it came from.
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase" }}>
              Collection{" "}
              <select value={selectedCollectionId} onChange={(e) => setSelectedCollectionId(e.target.value)} style={selectStyle}>
                {collections.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase" }}>
              Template{" "}
              <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} style={selectStyle}>
                {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={() => changeLayout("columns")} style={chip(layout === "columns")} title="Papers across the top, fields down the side">Papers as columns</button>
            <button onClick={() => changeLayout("rows")} style={chip(layout === "rows")} title="One row per paper, fields across the top">Papers as rows</button>
          </div>
          <input
            value={paperFilter}
            onChange={(e) => setPaperFilter(e.target.value)}
            placeholder="Filter papers by title or venue…"
            style={{ ...selectStyle, minWidth: "220px" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
            Only papers with gaps
          </label>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
            {totalCells > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>
                <div style={{ width: "110px", height: "6px", borderRadius: "3px", background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                </div>
                {pct}% filled · {papers.length} paper{papers.length === 1 ? "" : "s"} × {fields.length} fields
              </div>
            )}
            <button onClick={copyAsTable} disabled={shownPapers.length === 0} style={{ ...chip(false), opacity: shownPapers.length === 0 ? 0.5 : 1 }}>Copy table</button>
          </div>
        </div>
      </div>

      {/* Table workspace */}
      <div style={{ flex: 1, overflow: "auto", backgroundColor: "var(--panel-dark)" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "50px", color: "var(--accent-ink)" }}>Loading matrix...</div>
        ) : papers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
            No papers in this collection yet. Add some from Discover or the Library first.
          </div>
        ) : fields.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
            This template has no fields. Add fields in Templates first.
          </div>
        ) : shownPapers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>No papers match the current filter.</div>
        ) : layout === "columns" ? (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "13px", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...th, ...stickyL, zIndex: 4, width: "170px", minWidth: "170px" }}>Field</th>
                {shownPapers.map((p) => (
                  <th key={p.id} style={{ ...th, width: "280px", minWidth: "280px" }}>{renderPaperHead(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f: TemplateField) => (
                <tr key={f.id}>
                  <th scope="row" style={{ ...td, ...stickyL, textAlign: "left", fontWeight: 700, color: "var(--text-main)", backgroundColor: "var(--panel)" }}>
                    {f.name}
                    <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-muted)", marginTop: "3px" }}>
                      {shownPapers.filter((p) => isFilled(p.id, f.id)).length}/{shownPapers.length} filled
                    </div>
                  </th>
                  {shownPapers.map((p) => (
                    <td key={p.id} style={td}>{renderCell(p, f)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "13px", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...th, ...stickyL, zIndex: 4, width: "270px", minWidth: "270px" }}>Paper</th>
                {fields.map((f: TemplateField) => (
                  <th key={f.id} style={{ ...th, minWidth: "210px" }}>
                    {f.name}
                    <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-muted)", marginTop: "3px" }}>
                      {shownPapers.filter((p) => isFilled(p.id, f.id)).length}/{shownPapers.length} filled
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownPapers.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...td, ...stickyL, backgroundColor: "var(--panel)" }}>{renderPaperHead(p)}</td>
                  {fields.map((f: TemplateField) => (
                    <td key={f.id} style={td}>{renderCell(p, f)}</td>
                  ))}
                </tr>
              ))}
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
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
            <strong>Paper:</strong> {editingCell?.paper.title}
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "6px" }}>
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
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
                backgroundColor: "var(--panel-dark)",
                color: "var(--text-main)",
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-main)", marginBottom: "6px" }}>
              Origin Badge
            </label>
            <select
              value={cellOrigin}
              onChange={(e) => setCellOrigin(e.target.value as any)}
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
              <option value="user">You (Manual input)</option>
              <option value="source">Source (Direct author statement)</option>
              <option value="ai">AI (mock) (Assisted suggestion)</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setEditingCell(null)}
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
        <div style={{ marginBottom: "14px", fontSize: "13px", color: "var(--text-main)" }}>
          The mock AI analyzed highlighted annotations for <strong>"{aiSuggestionsModal?.paper.title}"</strong> and proposes the following values:
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflowY: "auto" }}>
          {aiSuggestionsModal?.suggestions.map((sug) => (
            <div
              key={sug.field_id}
              style={{
                padding: "12px 14px",
                backgroundColor: "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))",
                border: "1px solid color-mix(in srgb, var(--warn-ink) 35%, var(--panel-dark))",
                borderRadius: "6px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontWeight: 700, color: "var(--warn-ink)", fontSize: "13px" }}>
                  {sug.field_name}
                </span>
                <span style={{ fontSize: "11px", backgroundColor: "var(--panel-dark)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  Ann ID: {sug.annotation_ids.join(", ")}
                </span>
              </div>
              <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", fontStyle: "italic", color: "var(--text-main)", lineHeight: 1.4 }}>
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
                    backgroundColor: "var(--panel-dark)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    color: "var(--text-main)",
                  }}
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAcceptSuggestion(sug)}
                  style={{
                    padding: "4px 12px",
                    backgroundColor: "var(--accent)",
                    color: "var(--on-accent)",
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
