import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { getPaper, loadPdfBytes, getAnnotations, createAnnotation, deleteAnnotation } from "../lib/api";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { toast } from "../lib/toast";
import { loadReaderSettings, saveReaderSettings } from "../lib/settings";
import type { Paper, Annotation } from "../types";

// Configure pdfjs worker to local bundled file in public
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export const Reader: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();

  const savedSettings = useRef(loadReaderSettings()).current;

  const [paper, setPaper] = useState<Paper | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(savedSettings.scale || 1.25);
  const [darkMode, setDarkMode] = useState<boolean>(savedSettings.darkMode ?? false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [currentPageHover, setCurrentPageHover] = useState(1);
  const [noteInput, setNoteInput] = useState("");
  const [colorInput, setColorInput] = useState(savedSettings.highlightColor || "#FFEB3B");

  // Auto-save reader settings whenever scale, darkMode, or highlightColor changes
  useEffect(() => {
    saveReaderSettings({
      scale,
      darkMode,
      highlightColor: colorInput,
    });
  }, [scale, darkMode, colorInput]);

  // Search filter for annotations
  const [annFilter, setAnnFilter] = useState("");

  // Manual modal state
  const [manualQuote, setManualQuote] = useState("");
  const [manualPage, setManualPage] = useState<number>(1);
  const [manualNote, setManualNote] = useState("");

  // Confirm delete dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    annId: string;
  }>({
    isOpen: false,
    annId: "",
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paperId) {
      loadData(paperId);
    }
  }, [paperId]);

  const loadData = async (id: string) => {
    setLoading(true);
    try {
      const p = await getPaper(id);
      setPaper(p);
      const ann = await getAnnotations(id);
      setAnnotations(ann);

      const bytes = await loadPdfBytes(id);
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
    } catch (err: any) {
      console.error("Error loading PDF: ", err);
      toast.error("Error loading PDF: " + err?.toString());
    } finally {
      setLoading(false);
    }
  };

  // Render pages when pdfDoc or scale changes
  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;

    let isMounted = true;
    const container = containerRef.current;
    container.innerHTML = "";

    const renderAllPages = async () => {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (!isMounted) break;

        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const pageWrapper = document.createElement("div");
          pageWrapper.className = "pdf-page-wrapper";
          pageWrapper.style.position = "relative";
          pageWrapper.style.marginBottom = "24px";
          pageWrapper.style.boxShadow = "0 3px 10px rgba(0,0,0,0.15)";
          pageWrapper.style.backgroundColor = "#fff";
          pageWrapper.style.width = `${viewport.width}px`;
          pageWrapper.style.height = `${viewport.height}px`;
          pageWrapper.dataset.pageNumber = String(pageNum);

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          pageWrapper.appendChild(canvas);

          // Text Layer
          const textLayerDiv = document.createElement("div");
          textLayerDiv.className = "textLayer";
          textLayerDiv.style.position = "absolute";
          textLayerDiv.style.left = "0";
          textLayerDiv.style.top = "0";
          textLayerDiv.style.right = "0";
          textLayerDiv.style.bottom = "0";
          textLayerDiv.style.overflow = "hidden";
          textLayerDiv.style.opacity = "0.9";
          textLayerDiv.style.lineHeight = "1.0";
          pageWrapper.appendChild(textLayerDiv);

          container.appendChild(pageWrapper);

          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }

          // Render text content for selection
          const textContent = await page.getTextContent();
          if ((pdfjsLib as any).TextLayer) {
            const textLayer = new (pdfjsLib as any).TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport,
            });
            await textLayer.render();
          }
        } catch (e) {
          console.error("Error rendering page", pageNum, e);
        }
      }
    };

    renderAllPages();

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, scale]);

  // Handle selection detection
  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (text.length > 0) {
      setSelectedText(text);

      // Determine page from selection node
      if (sel && sel.anchorNode) {
        const pageEl = (sel.anchorNode as HTMLElement).parentElement?.closest(".pdf-page-wrapper") as HTMLElement | null;
        if (pageEl && pageEl.dataset.pageNumber) {
          setCurrentPageHover(parseInt(pageEl.dataset.pageNumber, 10));
        }
      }
    }
  };

  const handleSaveHighlight = async () => {
    if (!paper || !selectedText) return;
    try {
      const created = await createAnnotation(
        paper.id,
        currentPageHover,
        selectedText,
        noteInput.trim() || undefined,
        colorInput
      );
      setAnnotations([...annotations, created]);
      setSelectedText("");
      setNoteInput("");
      window.getSelection()?.removeAllRanges();
      toast.success("Highlight saved!");
    } catch (err: any) {
      toast.error("Error saving annotation: " + err?.toString());
    }
  };

  const handleCreateManualAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paper || !manualQuote.trim()) return;
    try {
      const created = await createAnnotation(
        paper.id,
        manualPage > 0 ? manualPage : undefined,
        manualQuote.trim(),
        manualNote.trim() || undefined,
        "#FFEB3B"
      );
      setAnnotations([...annotations, created]);
      setShowManualModal(false);
      setManualQuote("");
      setManualNote("");
      toast.success("Manual quote added!");
    } catch (err: any) {
      toast.error("Error saving manual annotation: " + err?.toString());
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotation(id);
      setAnnotations(annotations.filter((a) => a.id !== id));
      toast.success("Annotation removed");
    } catch (err: any) {
      toast.error("Error deleting annotation: " + err?.toString());
    }
  };

  const filteredAnnotations = annotations.filter((ann) => {
    if (!annFilter.trim()) return true;
    const q = annFilter.toLowerCase();
    const inQuote = ann.quote.toLowerCase().includes(q);
    const inNote = (ann.note || "").toLowerCase().includes(q);
    return inQuote || inNote;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#333", overflow: "hidden" }}>
      {/* Top Controls Bar */}
      <div
        style={{
          padding: "10px 20px",
          backgroundColor: "#FAF5EC",
          borderBottom: "1px solid #E4DACB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <button
            onClick={() => navigate(`/paper/${paperId}`)}
            style={{
              padding: "6px 12px",
              backgroundColor: "#fff",
              border: "1px solid #D5C8B8",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "12px",
              color: "#4A2418",
            }}
          >
            ← Back to Paper
          </button>
          <div style={{ maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong style={{ fontSize: "14px", color: "#4A2418" }}>{paper?.title}</strong>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Zoom controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: "#fff", padding: "2px 6px", borderRadius: "4px", border: "1px solid #D5C8B8" }}>
            <button
              onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
              style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 700 }}
            >
              -
            </button>
            <span style={{ fontSize: "12px", minWidth: "40px", textAlign: "center", color: "#4A2418" }}>
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
              style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 700 }}
            >
              +
            </button>
          </div>

          {/* Dark reading mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle dark reading mode"
            style={{
              padding: "5px 10px",
              backgroundColor: darkMode ? "#333" : "#fff",
              color: darkMode ? "#FAF5EC" : "#4A2418",
              border: "1px solid #D5C8B8",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {darkMode ? "☀️ Light" : "🌙 Night"}
          </button>

          <button
            onClick={() => setShowManualModal(true)}
            style={{
              padding: "6px 12px",
              backgroundColor: "#6E4363",
              color: "#FAF5EC",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Manual Quote
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* PDF Document Canvas View */}
        <div
          onMouseUp={handleMouseUp}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "24px 16px",
            backgroundColor: "#424242",
          }}
        >
          {loading ? (
            <div style={{ color: "#FAF5EC", marginTop: "60px", fontSize: "16px" }}>Loading PDF document...</div>
          ) : (
            <div
              ref={containerRef}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                filter: darkMode ? "invert(90%) hue-rotate(180deg)" : "none",
                transition: "filter 0.25s ease",
              }}
            />
          )}
        </div>

        {/* Right Annotations & Highlight Panel */}
        <div
          style={{
            width: "320px",
            minWidth: "320px",
            backgroundColor: "#FAF7F2",
            borderLeft: "1px solid #E4DACB",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Active selection box */}
          {selectedText && (
            <div
              style={{
                padding: "16px",
                backgroundColor: "#FEF9E7",
                borderBottom: "2px solid #F9E79F",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#7D6608", marginBottom: "6px" }}>
                HIGHLIGHT SELECTED PASSAGE (Page {currentPageHover})
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#333",
                  fontStyle: "italic",
                  maxHeight: "80px",
                  overflowY: "auto",
                  backgroundColor: "#fff",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  border: "1px solid #FAD7A0",
                  marginBottom: "10px",
                }}
              >
                "{selectedText}"
              </div>

              {/* Color picker selector */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", color: "#666" }}>Color:</span>
                {["#FFEB3B", "#A3E4D7", "#F5B7B1", "#D7BDE2", "#FAD7A0"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorInput(c)}
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      backgroundColor: c,
                      border: colorInput === c ? "2px solid #4A2418" : "1px solid #ccc",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              <input
                type="text"
                placeholder="Add optional note/comment..."
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                  borderRadius: "4px",
                  border: "1px solid #D5C8B8",
                  boxSizing: "border-box",
                  marginBottom: "8px",
                }}
              />

              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button
                  onClick={handleSaveHighlight}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    backgroundColor: "#8A5A7A",
                    color: "#FAF5EC",
                    border: "none",
                    borderRadius: "4px",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  ✓ Save Highlight
                </button>
                <button
                  onClick={() => {
                    setSelectedText("");
                    setNoteInput("");
                  }}
                  style={{
                    padding: "6px 10px",
                    backgroundColor: "#fff",
                    border: "1px solid #D5C8B8",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Annotations List Header with Search */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid #EADDCB",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#4A2418" }}>
                Annotations ({annotations.length})
              </h3>
            </div>
            {annotations.length > 0 && (
              <input
                type="text"
                placeholder="Search annotations..."
                value={annFilter}
                onChange={(e) => setAnnFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  border: "1px solid #D5C8B8",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* Annotations List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
            {annotations.length === 0 ? (
              <div style={{ textAlign: "center", color: "#8A796F", fontSize: "13px", padding: "30px 10px" }}>
                Select text in the PDF with your mouse to highlight it, or click "+ Manual Quote".
              </div>
            ) : filteredAnnotations.length === 0 ? (
              <div style={{ textAlign: "center", color: "#8A796F", fontSize: "12px", padding: "20px 10px" }}>
                No annotations match "{annFilter}".
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filteredAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    style={{
                      padding: "12px",
                      borderRadius: "6px",
                      backgroundColor: "#fff",
                      border: "1px solid #EADDCB",
                      borderLeft: `5px solid ${ann.color || "#8A5A7A"}`,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    }}
                  >
                    <div style={{ fontSize: "12.5px", color: "#3B2A20", fontStyle: "italic", marginBottom: "6px", lineHeight: 1.4 }}>
                      "{ann.quote}"
                    </div>
                    {ann.note && (
                      <div style={{ fontSize: "12px", color: "#6E4363", fontWeight: 500, marginBottom: "6px" }}>
                        📝 {ann.note}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#9E8B7F" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: ann.color || "#FFEB3B",
                          }}
                        />
                        <span>{ann.page ? `Page ${ann.page}` : "Manual quote"}</span>
                      </div>
                      <button
                        onClick={() =>
                          setConfirmDialog({
                            isOpen: true,
                            annId: ann.id,
                          })
                        }
                        title="Delete annotation"
                        style={{
                          border: "none",
                          background: "none",
                          color: "#C0392B",
                          cursor: "pointer",
                          fontSize: "12px",
                          padding: "2px",
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Annotation Modal */}
      <Modal isOpen={showManualModal} onClose={() => setShowManualModal(false)} title="Add Manual Quote / Annotation">
        <form onSubmit={handleCreateManualAnnotation}>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Passage Quote *
            </label>
            <textarea
              required
              rows={4}
              value={manualQuote}
              onChange={(e) => setManualQuote(e.target.value)}
              placeholder="Paste or write the quote from the paper..."
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

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Page Number (Optional)
            </label>
            <input
              type="number"
              min={1}
              value={manualPage}
              onChange={(e) => setManualPage(parseInt(e.target.value, 10) || 1)}
              style={{
                width: "100%",
                padding: "6px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "4px" }}>
              Note / Observations (Optional)
            </label>
            <input
              type="text"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="e.g. key finding on precision improvement..."
              style={{
                width: "100%",
                padding: "6px 10px",
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
              onClick={() => setShowManualModal(false)}
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
              disabled={!manualQuote.trim()}
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
              Save Annotation
            </button>
          </div>
        </form>
      </Modal>

      {/* Styled Confirmation Dialog for Deletion */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, annId: "" })}
        onConfirm={() => {
          if (confirmDialog.annId) handleDeleteAnnotation(confirmDialog.annId);
        }}
        title="Delete Annotation"
        message="Are you sure you want to delete this annotation highlight? This cannot be undone."
        confirmLabel="Delete"
        isDanger={true}
      />
    </div>
  );
};
