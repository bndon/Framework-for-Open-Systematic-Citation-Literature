import React, { useState } from "react";
import JSZip from "jszip";
import { toast } from "../lib/toast";

interface DetectedHeading {
  text: string;
  level: number;
}

interface ComplianceCheck {
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export const ConferenceConverter: React.FC = () => {
  const [targetTemplate, setTargetTemplate] = useState<"ieee" | "acm" | "springer">("ieee");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [headings, setHeadings] = useState<DetectedHeading[]>([]);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setAnalyzed(false);
    setHeadings([]);
    setChecks([]);

    // Real DOCX structure parsing via JSZip (DOCX is a zip containing word/document.xml)
    setAnalyzing(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const docXmlFile = zip.file("word/document.xml");

      if (!docXmlFile) {
        toast.error("Invalid DOCX file: word/document.xml not found inside archive.");
        setAnalyzing(false);
        return;
      }

      const xmlContent = await docXmlFile.async("text");
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "application/xml");

      // Extract all paragraphs
      const paragraphs = xmlDoc.getElementsByTagName("w:p");
      const detected: DetectedHeading[] = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const pStyle = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") || "";
        
        // Extract paragraph text from all w:t runs
        const textRuns = p.getElementsByTagName("w:t");
        let pText = "";
        for (let j = 0; j < textRuns.length; j++) {
          pText += textRuns[j].textContent || "";
        }
        pText = pText.trim();

        if (!pText) continue;

        // Check if paragraph is marked as Heading or Title
        const lowerStyle = pStyle.toLowerCase();
        let level = 0;
        if (lowerStyle.includes("heading 1") || lowerStyle === "1" || lowerStyle.includes("title")) {
          level = 1;
        } else if (lowerStyle.includes("heading 2") || lowerStyle === "2") {
          level = 2;
        } else if (lowerStyle.includes("heading 3") || lowerStyle === "3") {
          level = 3;
        } else if (/^(abstract|introduction|methodology|methods|experiments|results|discussion|conclusion|references)/i.test(pText) && pText.length < 80) {
          level = 1; // Fallback heuristic for bold unstyled section headings
        }

        if (level > 0) {
          detected.push({ text: pText, level });
        }
      }

      setHeadings(detected);
      runComplianceChecks(detected, targetTemplate);
      setAnalyzed(true);
      toast.success(`Successfully analyzed ${detected.length} headings in "${file.name}"!`);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to parse DOCX file: " + err?.toString());
    } finally {
      setAnalyzing(false);
    }
  };

  const runComplianceChecks = (foundHeadings: DetectedHeading[], style: "ieee" | "acm" | "springer") => {
    const headingTexts = foundHeadings.map((h) => h.text.toLowerCase());

    const hasSection = (keywords: string[]) =>
      headingTexts.some((text) => keywords.some((k) => text.includes(k)));

    const resultChecks: ComplianceCheck[] = [
      {
        title: "Title & Affiliation",
        status: foundHeadings.length > 0 ? "pass" : "fail",
        detail: foundHeadings.length > 0 ? "Document structure identified." : "No valid document title identified.",
      },
      {
        title: "Abstract",
        status: hasSection(["abstract"]) ? "pass" : "fail",
        detail: hasSection(["abstract"]) ? "Explicit Abstract section found." : "Missing explicit 'Abstract' heading.",
      },
      {
        title: "Introduction",
        status: hasSection(["introduction", "intro", "background"]) ? "pass" : "fail",
        detail: hasSection(["introduction", "intro", "background"]) ? "Introduction section confirmed." : "Missing 'Introduction' heading.",
      },
      {
        title: "Methodology / Approach",
        status: hasSection(["method", "approach", "proposed", "model", "architecture"]) ? "pass" : "warn",
        detail: hasSection(["method", "approach", "proposed", "model", "architecture"])
          ? "Methodological description section found."
          : "Could not clearly identify a methodology/system architecture section heading.",
      },
      {
        title: "Evaluation / Results",
        status: hasSection(["result", "evaluation", "experiment", "benchmark"]) ? "pass" : "warn",
        detail: hasSection(["result", "evaluation", "experiment", "benchmark"])
          ? "Results / experiments section confirmed."
          : "Recommended experimental evaluation section not clearly designated.",
      },
      {
        title: style === "ieee" ? "Limitations / Threats to Validity" : "Conclusion & Future Work",
        status: hasSection(["limit", "threat", "validity", "conclusion", "future"]) ? "pass" : "warn",
        detail: hasSection(["limit", "threat", "validity", "conclusion", "future"])
          ? "Concluding / limitation discussion section identified."
          : "Missing dedicated section for limitations or future work.",
      },
      {
        title: "References / Bibliography",
        status: hasSection(["reference", "bibliography", "citations"]) ? "pass" : "fail",
        detail: hasSection(["reference", "bibliography", "citations"])
          ? "References section heading found."
          : "No explicit 'References' or 'Bibliography' heading found.",
      },
    ];

    setChecks(resultChecks);
  };

  const getTargetHeadingFormat = (text: string, level: number, style: "ieee" | "acm" | "springer") => {
    const clean = text.replace(/^[0-9IVXLCDM\.\s]+/, "").trim();
    if (style === "ieee") {
      return level === 1 ? `ROMAN NUMERAL. ${clean.toUpperCase()} (Small Caps, Centered)` : `A. ${clean} (Italicized, Left-aligned)`;
    } else if (style === "acm") {
      return level === 1 ? `1. ${clean} (Bold, 11pt)` : `1.1 ${clean} (Italicized, 10pt)`;
    } else {
      return level === 1 ? `1 ${clean} (Springer Bold, 12pt)` : `1.1 ${clean} (Springer Semi-bold, 10pt)`;
    }
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: "900px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", color: "var(--text-main)", margin: "0 0 6px 0" }}>Conference Manuscript Analyzer</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
          Parses your real <code>.docx</code> file structure and checks it against publisher guidelines (IEEE, ACM, Springer LNCS).
        </p>
      </header>

      {/* Upload & Style selection */}
      <div style={{ backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
              Upload Manuscript (.docx)
            </label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                id="converter-file"
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => document.getElementById("converter-file")?.click()}
                disabled={analyzing}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "var(--panel-dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {analyzing ? "Reading DOCX..." : "📁 Choose .docx File"}
              </button>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedFileName || "No file selected"}
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
              Target Conference Style
            </label>
            <select
              value={targetTemplate}
              onChange={(e) => {
                const newStyle = e.target.value as any;
                setTargetTemplate(newStyle);
                if (headings.length > 0) runComplianceChecks(headings, newStyle);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "var(--panel-dark)",
              }}
            >
              <option value="ieee">IEEE Standard (Two-Column, 10pt, Roman Numerals)</option>
              <option value="acm">ACM Primary Article (Single-Column Submission)</option>
              <option value="springer">Springer LNCS (Single-Column, 122 × 193 mm)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Analysis Results */}
      {analyzed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Section Checklist */}
          <div style={{ backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", color: "var(--text-main)" }}>
              Required Section Checklist ({targetTemplate.toUpperCase()})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12.5px" }}>
              {checks.map((chk, i) => {
                const isPass = chk.status === "pass";
                const isWarn = chk.status === "warn";
                return (
                  <div
                    key={i}
                    style={{
                      padding: "10px 12px",
                      backgroundColor: isPass ? "color-mix(in srgb, var(--success-ink) 13%, var(--panel-dark))" : isWarn ? "color-mix(in srgb, var(--warn-ink) 13%, var(--panel-dark))" : "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))",
                      color: isPass ? "var(--success-ink)" : isWarn ? "var(--warn-ink)" : "var(--danger-ink)",
                      borderRadius: "6px",
                      border: `1px solid ${isPass ? "color-mix(in srgb, var(--success-ink) 35%, var(--panel-dark))" : isWarn ? "color-mix(in srgb, var(--warn-ink) 35%, var(--panel-dark))" : "color-mix(in srgb, var(--danger-ink) 35%, var(--panel-dark))"}`,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: "2px" }}>
                      {isPass ? "✓" : isWarn ? "⚠" : "✕"} {chk.title}
                    </div>
                    <div style={{ fontSize: "11.5px", opacity: 0.9 }}>{chk.detail}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heading Mapping Preview Table */}
          <div style={{ backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "var(--text-main)" }}>
              Detected Headings from Document ({headings.length})
            </h3>
            <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "0 0 14px 0" }}>
              Extracted directly from the XML structure of <strong>{selectedFileName}</strong>:
            </p>

            {headings.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontStyle: "italic", fontSize: "13px" }}>
                No standard headings detected in this DOCX file. Make sure sections use Word's Heading 1/2 styles.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--panel-dark)", borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "8px 10px" }}>Detected Input Heading</th>
                    <th style={{ padding: "8px 10px" }}>Target {targetTemplate.toUpperCase()} Format</th>
                    <th style={{ padding: "8px 10px" }}>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {headings.map((h, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--text-main)" }}>
                        "{h.text}"
                      </td>
                      <td style={{ padding: "8px 10px", color: "var(--accent-ink)", fontFamily: "monospace" }}>
                        {getTargetHeadingFormat(h.text, h.level, targetTemplate)}
                      </td>
                      <td style={{ padding: "8px 10px", color: "var(--text-muted)", fontSize: "12px" }}>
                        Level {h.level}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
