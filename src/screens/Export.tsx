import React, { useState, useEffect } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType } from "docx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import {
  getCollections,
  getCollectionPapers,
  getTemplates,
  getExtractions,
  getAnnotations,
  getClaims,
  writeExportFile,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { Collection, Paper, Template, TemplateField, Extraction, Annotation, Claim } from "../types";

// Configure pdfMake vfs fonts
if (pdfFonts && (pdfFonts as any).pdfMake && (pdfFonts as any).pdfMake.vfs) {
  pdfMake.vfs = (pdfFonts as any).pdfMake.vfs;
} else if (pdfFonts && (pdfFonts as any).vfs) {
  pdfMake.vfs = (pdfFonts as any).vfs;
}

export const Export: React.FC = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [papers, setPapers] = useState<Paper[]>([]);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const colls = await getCollections();
      setCollections(colls);
      if (colls.length > 0) setSelectedCollectionId(colls[0].id);

      const tmpls = await getTemplates();
      setTemplates(tmpls);
      if (tmpls.length > 0) setSelectedTemplateId(tmpls[0].id);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load export options.");
    }
  };

  useEffect(() => {
    if (selectedCollectionId) {
      getCollectionPapers(selectedCollectionId).then(setPapers).catch(console.error);
    }
  }, [selectedCollectionId]);

  const activeCollection = collections.find((c) => c.id === selectedCollectionId);
  const activeTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Helper to gather export payload
  const gatherPayload = async () => {
    if (!activeCollection || !activeTemplate) throw new Error("Please select collection and template");

    const fields = activeTemplate.fields;
    const paperData: Array<{
      paper: Paper;
      extractions: Record<string, Extraction>;
      annotations: Annotation[];
    }> = [];

    for (const p of papers) {
      const exts = await getExtractions(p.id, activeTemplate.id);
      const extMap: Record<string, Extraction> = {};
      for (const e of exts) extMap[e.field_id] = e;

      const anns = await getAnnotations(p.id);
      paperData.push({ paper: p, extractions: extMap, annotations: anns });
    }

    const claims: Claim[] = await getClaims(activeCollection.id);

    return { collection: activeCollection, template: activeTemplate, fields, paperData, claims };
  };

  const handleExportDocx = async () => {
    if (!activeCollection) return;
    setExporting("docx");

    try {
      const { collection, template, fields, paperData, claims } = await gatherPayload();

      // Open Tauri save dialog
      const defaultFilename = `${collection.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_synthesis.docx`;
      const targetPath = await saveDialog({
        defaultPath: defaultFilename,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });

      if (!targetPath) {
        setExporting(null);
        return;
      }

      // Build Table Rows
      const headerCells = [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Paper / Study", bold: true })] })],
        }),
        ...fields.map(
          (f: TemplateField) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: f.name, bold: true })] })],
            })
        ),
      ];

      const dataRows = paperData.map(({ paper, extractions }) => {
        return new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: paper.title, bold: true })] }),
                new Paragraph({ children: [new TextRun({ text: paper.year ? `Year: ${paper.year}` : "" })] }),
              ],
            }),
            ...fields.map((f: TemplateField) => {
              const val = extractions[f.id]?.value || "—";
              const origin = extractions[f.id]?.origin ? `[${extractions[f.id].origin}]` : "";
              return new TableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: val })] }),
                  origin ? new Paragraph({ children: [new TextRun({ text: origin, italics: true, size: 16 })] }) : new Paragraph({}),
                ],
              });
            }),
          ],
        });
      });

      // Build Appendix: Annotations
      const appendixParagraphs: Paragraph[] = [
        new Paragraph({
          text: "Appendix: Key Annotations & Highlights",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
      ];

      paperData.forEach(({ paper, annotations }) => {
        if (annotations.length > 0) {
          appendixParagraphs.push(
            new Paragraph({
              children: [new TextRun({ text: paper.title, bold: true })],
              spacing: { before: 200, after: 100 },
            })
          );
          annotations.forEach((a) => {
            appendixParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `• "${a.quote}" `, italics: true }),
                  new TextRun({ text: a.page ? `(p. ${a.page})` : "" }),
                  a.note ? new TextRun({ text: ` — Note: ${a.note}`, bold: true }) : new TextRun({ text: "" }),
                ],
              })
            );
          });
        }
      });

      // Build Research Lineage: Claims Section
      const claimsParagraphs: Paragraph[] = [
        new Paragraph({
          text: "Research Lineage: Synthesized Claims & Evidence",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
      ];

      if (claims.length === 0) {
        claimsParagraphs.push(
          new Paragraph({
            children: [new TextRun({ text: "No claims recorded for this collection.", italics: true })],
          })
        );
      } else {
        claims.forEach((c, idx) => {
          claimsParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Claim ${idx + 1}: `, bold: true }),
                new TextRun({ text: `"${c.text}"`, italics: true }),
                new TextRun({ text: ` [Origin: ${c.origin}]`, size: 18 }),
              ],
              spacing: { before: 150, after: 60 },
            })
          );

          if (c.evidence.length > 0) {
            c.evidence.forEach((ev) => {
              const matchedPaper = paperData.find((p) => p.paper.id === ev.paper_id);
              claimsParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `  • Evidence (${ev.stance}): `, bold: true }),
                    new TextRun({ text: matchedPaper?.paper.title || ev.paper_id }),
                  ],
                  spacing: { after: 40 },
                })
              );
            });
          }

          if (c.revisions.length > 0) {
            claimsParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `  Revisions: ${c.revisions.length} recorded update(s) in history`,
                    size: 18,
                    color: "666666",
                  }),
                ],
                spacing: { after: 60 },
              })
            );
          }
        });
      }

      // Build References
      const referenceParagraphs: Paragraph[] = [
        new Paragraph({
          text: "References",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
        ...paperData.map(({ paper }, idx) => {
          let authors = "Unknown authors";
          try {
            if (paper.authors_json) authors = JSON.parse(paper.authors_json).join(", ");
          } catch {}
          return new Paragraph({
            children: [
              new TextRun({ text: `[${idx + 1}] ${authors}. "${paper.title}". ` }),
              new TextRun({ text: paper.venue ? `${paper.venue}, ` : "" }),
              new TextRun({ text: paper.year ? `${paper.year}. ` : "" }),
              new TextRun({ text: paper.doi ? `DOI: https://doi.org/${paper.doi}` : "" }),
            ],
            spacing: { after: 100 },
          });
        }),
      ];

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: `Research Synthesis: ${collection.name}`,
                heading: HeadingLevel.TITLE,
                spacing: { after: 200 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Template: ${template.name} • Total Papers: ${papers.length} • Total Claims: ${claims.length}` }),
                ],
                spacing: { after: 300 },
              }),
              new Paragraph({
                text: "Cross-Paper Comparison Table",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 150 },
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [new TableRow({ children: headerCells }), ...dataRows],
              }),
              ...appendixParagraphs,
              ...claimsParagraphs,
              ...referenceParagraphs,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const arrayBuf = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);

      await writeExportFile(targetPath, bytes);
      toast.success(`Successfully exported DOCX to: ${targetPath}`);
    } catch (err: any) {
      console.error(err);
      toast.error("Error generating DOCX: " + err?.toString());
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!activeCollection) return;
    setExporting("pdf");

    try {
      const { collection, template, fields, paperData, claims } = await gatherPayload();

      const defaultFilename = `${collection.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_synthesis.pdf`;
      const targetPath = await saveDialog({
        defaultPath: defaultFilename,
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      });

      if (!targetPath) {
        setExporting(null);
        return;
      }

      // Build pdfMake document
      const tableHeaders = [
        { text: "Paper", bold: true, fillColor: "#FAF5EC" },
        ...fields.map((f: TemplateField) => ({ text: f.name, bold: true, fillColor: "#FAF5EC" })),
      ];

      const tableBody = [
        tableHeaders,
        ...paperData.map(({ paper, extractions }) => {
          return [
            { text: `${paper.title}\n(${paper.year || "N/A"})`, bold: true, fontSize: 9 },
            ...fields.map((f: TemplateField) => {
              const val = extractions[f.id]?.value || "—";
              const origin = extractions[f.id]?.origin ? `\n[${extractions[f.id].origin}]` : "";
              return { text: `${val}${origin}`, fontSize: 8.5 };
            }),
          ];
        }),
      ];

      const annotationsContent: any[] = [
        { text: "Appendix: Key Annotations & Highlights", style: "sectionHeader" },
      ];

      paperData.forEach(({ paper, annotations }) => {
        if (annotations.length > 0) {
          annotationsContent.push({ text: paper.title, bold: true, margin: [0, 8, 0, 4] });
          annotations.forEach((a) => {
            annotationsContent.push({
              text: `• "${a.quote}" ${a.page ? `(p. ${a.page})` : ""} ${a.note ? `— Note: ${a.note}` : ""}`,
              italics: true,
              fontSize: 9,
              margin: [10, 2, 0, 2],
            });
          });
        }
      });

      // Claims section for PDF
      const claimsContent: any[] = [
        { text: "Research Lineage: Synthesized Claims & Evidence", style: "sectionHeader" },
      ];

      if (claims.length === 0) {
        claimsContent.push({ text: "No claims recorded for this collection.", italics: true, fontSize: 9 });
      } else {
        claims.forEach((c, idx) => {
          claimsContent.push({
            text: `Claim ${idx + 1}: "${c.text}" [${c.origin}]`,
            bold: true,
            fontSize: 9.5,
            margin: [0, 4, 0, 2],
          });
          if (c.evidence.length > 0) {
            c.evidence.forEach((ev) => {
              const matched = paperData.find((p) => p.paper.id === ev.paper_id);
              claimsContent.push({
                text: `  • Evidence (${ev.stance}): ${matched?.paper.title || ev.paper_id}`,
                fontSize: 8.5,
                margin: [10, 1, 0, 1],
              });
            });
          }
        });
      }

      const referencesContent: any[] = [
        { text: "References", style: "sectionHeader" },
        ...paperData.map(({ paper }, idx) => {
          let authors = "Unknown authors";
          try {
            if (paper.authors_json) authors = JSON.parse(paper.authors_json).join(", ");
          } catch {}
          return {
            text: `[${idx + 1}] ${authors}. "${paper.title}". ${paper.venue ? paper.venue + ", " : ""}${paper.year ? paper.year + ". " : ""}${paper.doi ? "DOI: " + paper.doi : ""}`,
            fontSize: 9,
            margin: [0, 3, 0, 3],
          };
        }),
      ];

      const docDefinition: any = {
        pageOrientation: "landscape",
        content: [
          { text: `Research Synthesis: ${collection.name}`, style: "header" },
          { text: `Extraction Template: ${template.name} • Total Papers: ${papers.length} • Claims: ${claims.length}`, margin: [0, 0, 0, 16], color: "#666" },
          { text: "Comparison Matrix", style: "sectionHeader" },
          {
            table: {
              headerRows: 1,
              widths: ["20%", ...fields.map(() => "*")],
              body: tableBody,
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 24],
          },
          ...annotationsContent,
          { text: "", margin: [0, 16, 0, 0] },
          ...claimsContent,
          { text: "", margin: [0, 16, 0, 0] },
          ...referencesContent,
        ],
        styles: {
          header: { fontSize: 18, bold: true, margin: [0, 0, 0, 6], color: "var(--text-main)" },
          sectionHeader: { fontSize: 14, bold: true, margin: [0, 12, 0, 8], color: "var(--accent-ink)" },
        },
      };

      const pdfGenerator = pdfMake.createPdf(docDefinition);
      pdfGenerator.getBlob(async (blob: Blob) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const bytes = new Uint8Array(reader.result as ArrayBuffer);
          await writeExportFile(targetPath, bytes);
          toast.success(`Successfully exported PDF to: ${targetPath}`);
          setExporting(null);
        };
        reader.readAsArrayBuffer(blob);
      });
    } catch (err: any) {
      console.error(err);
      toast.error("Error generating PDF: " + err?.toString());
      setExporting(null);
    }
  };

  return (
    <div style={{ padding: "36px 44px", maxWidth: "800px", margin: "0 auto" }}>
      <header style={{ marginBottom: "26px" }}>
        <h1 style={{ fontSize: "24px", color: "var(--text-main)", margin: "0 0 6px 0" }}>Export Synthesis</h1>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)" }}>
          Export the cross-paper comparison table, annotations appendix, research claims & lineage, and reference list to DOCX or PDF.
        </p>
      </header>

      {/* Selectors */}
      <div style={{ backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px", marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "20px", marginBottom: "16px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
              Collection to Export
            </label>
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", backgroundColor: "var(--panel-dark)" }}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
              Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", backgroundColor: "var(--panel-dark)" }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          <strong>Papers in export:</strong> {papers.length}
        </div>
      </div>

      {/* Export Action Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Word Document */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px",
            backgroundColor: "var(--panel-dark)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>📝</div>
            <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>Microsoft Word (.docx)</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              Generates a formatted DOCX document with title, structured comparison table, quotation appendix, claim lineage, and references.
            </p>
          </div>
          <button
            onClick={handleExportDocx}
            disabled={exporting !== null || papers.length === 0}
            style={{
              padding: "10px 18px",
              backgroundColor: "#2B579A",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: exporting !== null || papers.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {exporting === "docx" ? "Generating DOCX..." : "Export to Word DOCX"}
          </button>
        </div>

        {/* PDF Document */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px",
            backgroundColor: "var(--panel-dark)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>📄</div>
            <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>PDF Document (.pdf)</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              Generates a landscape PDF document via pdfmake with identical table structure, annotations, claims, and references.
            </p>
          </div>
          <button
            onClick={handleExportPdf}
            disabled={exporting !== null || papers.length === 0}
            style={{
              padding: "10px 18px",
              backgroundColor: "#D9381E",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: exporting !== null || papers.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {exporting === "pdf" ? "Generating PDF..." : "Export to PDF"}
          </button>
        </div>
      </div>
    </div>
  );
};
