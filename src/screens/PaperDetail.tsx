import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getPaper, uploadPdf, getAnnotations, getCollections, addPaperToCollection } from "../lib/api";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "../lib/toast";
import type { Paper, Annotation, Collection } from "../types";

export const PaperDetail: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedColl, setSelectedColl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
      const colls = await getCollections();
      setCollections(colls);
      if (colls.length > 0) setSelectedColl(colls[0].id);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load paper details.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !paper) return;

    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      await uploadPdf(paper.id, bytes);
      toast.success("PDF uploaded successfully!");
      loadData(paper.id);
    } catch (err: any) {
      toast.error("Failed to upload PDF: " + err?.toString());
    } finally {
      setUploading(false);
    }
  };

  const handleAddToCollection = async () => {
    if (!paper || !selectedColl) return;
    try {
      await addPaperToCollection(selectedColl, paper.id);
      const name = collections.find((c) => c.id === selectedColl)?.name;
      toast.success(`Added to "${name}"!`);
    } catch (err: any) {
      toast.error("Error adding to collection: " + err?.toString());
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#8A5A7A" }}>Loading paper details...</div>;
  }

  if (!paper) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#C0392B" }}>Paper not found.</div>;
  }

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
    <div style={{ padding: "32px 40px", maxWidth: "900px", margin: "0 auto" }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          border: "none",
          background: "none",
          color: "#8A5A7A",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          padding: 0,
          marginBottom: "16px",
        }}
      >
        ← Back
      </button>

      {/* Main Paper Header */}
      <div
        style={{
          backgroundColor: "#fff",
          border: "1px solid #E8DFD3",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "24px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        <h1 style={{ fontSize: "22px", color: "#4A2418", margin: "0 0 10px 0", lineHeight: 1.35 }}>
          {paper.title}
        </h1>

        <div style={{ fontSize: "14px", color: "#7A6458", marginBottom: "14px", lineHeight: 1.5 }}>
          <strong>Authors:</strong> {authorsList.length > 0 ? authorsList.join(", ") : "Unknown"}
          <br />
          {paper.venue && (
            <>
              <strong>Venue:</strong> {paper.venue} &bull;{" "}
            </>
          )}
          {paper.year && (
            <>
              <strong>Year:</strong> {paper.year}
            </>
          )}
          {paper.doi && (
            <>
              <br />
              <strong>DOI:</strong>{" "}
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#8A5A7A", textDecoration: "none" }}
              >
                {paper.doi} ↗
              </a>
            </>
          )}
          {paper.openalex_id && (
            <>
              <br />
              <Link
                to={`/citations?id=${encodeURIComponent(paper.openalex_id)}&title=${encodeURIComponent(paper.title)}`}
                style={{ color: "#8A5A7A", fontSize: "13px", fontWeight: 600, textDecoration: "none", marginTop: "4px", display: "inline-block" }}
              >
                🕸 View Citation Network →
              </Link>
            </>
          )}
        </div>

        {/* PDF Status and Action Banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px",
            backgroundColor: hasPdf ? "#E8F8F5" : "#FAF5EC",
            border: `1px solid ${hasPdf ? "#A3E4D7" : "#E4DACB"}`,
            borderRadius: "6px",
            marginBottom: "18px",
          }}
        >
          <div>
            <strong style={{ color: hasPdf ? "#16A085" : "#8A5A7A", fontSize: "14px" }}>
              {hasPdf ? "✓ PDF is uploaded and ready for reading" : "No PDF attached to this paper yet"}
            </strong>
            <div style={{ fontSize: "12px", color: "#7A6458", marginTop: "2px" }}>
              {hasPdf
                ? "You can view the document and highlight annotations."
                : "Upload a local PDF file to read and annotate text in the workspace."}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              id="pdf-file-input"
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />

            {hasPdf ? (
              <>
                <button
                  onClick={() => document.getElementById("pdf-file-input")?.click()}
                  disabled={uploading}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "#FAF5EC",
                    color: "#4A2418",
                    border: "1px solid #D5C8B8",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  {uploading ? "Uploading..." : "Replace PDF"}
                </button>
                <Link
                  to={`/reader/${paper.id}`}
                  style={{
                    padding: "8px 18px",
                    backgroundColor: "#8A5A7A",
                    color: "#FAF5EC",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "13px",
                  }}
                >
                  📖 Open Reader & Annotate
                </Link>
              </>
            ) : (
              <button
                onClick={() => document.getElementById("pdf-file-input")?.click()}
                disabled={uploading}
                style={{
                  padding: "8px 18px",
                  backgroundColor: "#8A5A7A",
                  color: "#FAF5EC",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {uploading ? "Uploading..." : "⬆ Select & Upload PDF"}
              </button>
            )}
          </div>
        </div>

        {/* Add to another collection */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "#7A6458", fontWeight: 500 }}>Add to Collection:</span>
          <select
            value={selectedColl}
            onChange={(e) => setSelectedColl(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #D5C8B8", fontSize: "12px", backgroundColor: "#FAF5EC" }}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddToCollection}
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
            + Add
          </button>
        </div>
      </div>

      {/* Abstract */}
      <div
        style={{
          backgroundColor: "#fff",
          border: "1px solid #E8DFD3",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#4A2418" }}>Abstract</h3>
        <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.6, color: "#44342D" }}>
          {paper.abstract || <em style={{ color: "#8A796F" }}>Not available</em>}
        </p>
      </div>

      {/* Annotations Section */}
      <div
        style={{
          backgroundColor: "#fff",
          border: "1px solid #E8DFD3",
          borderRadius: "8px",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", color: "#4A2418" }}>
            Annotations ({annotations.length})
          </h3>
          {hasPdf && (
            <Link
              to={`/reader/${paper.id}`}
              style={{ fontSize: "12px", color: "#8A5A7A", textDecoration: "none", fontWeight: 600 }}
            >
              Add Highlights in Reader →
            </Link>
          )}
        </div>

        {annotations.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#8A796F", fontSize: "13px", backgroundColor: "#FAF7F2", borderRadius: "6px" }}>
            No highlights or notes recorded yet for this paper.
            {hasPdf && (
              <div style={{ marginTop: "8px" }}>
                <Link to={`/reader/${paper.id}`} style={{ color: "#8A5A7A", fontWeight: 600 }}>
                  Open PDF Reader to highlight text
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {annotations.map((ann) => (
              <div
                key={ann.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: "6px",
                  backgroundColor: "#FAF7F2",
                  borderLeft: `4px solid ${ann.color || "#8A5A7A"}`,
                  fontSize: "13px",
                }}
              >
                <div style={{ fontStyle: "italic", color: "#3B2A20", marginBottom: "4px" }}>
                  "{ann.quote}"
                </div>
                {ann.note && (
                  <div style={{ color: "#6E4363", fontWeight: 500, fontSize: "12px", marginBottom: "4px" }}>
                    📝 Note: {ann.note}
                  </div>
                )}
                <div style={{ fontSize: "11px", color: "#9E8B7F" }}>
                  {ann.page ? `Page ${ann.page}` : "Manual quote"} &bull; {new Date(ann.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
