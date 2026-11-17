import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { addPaperToCollection, createCollection, getPapers, lookupDoi, setPaperMeta, upsertPaper } from "../lib/api";
import { paperKeys } from "../lib/papers";
import { detectKind, extractDois, parseBibtex, parseRis, toBibtex, toRis, type RefRecord } from "../lib/refs";
import { pickTextFile, saveTextFile } from "../lib/saveFile";
import { toast } from "../lib/toast";
import type { Collection, Paper, PaperResult } from "../types";

const field: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--panel-dark)",
  color: "var(--text-main)",
  fontSize: "13px",
  boxSizing: "border-box",
};
const btn = (primary = false): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: "6px",
  border: primary ? "1px solid transparent" : "1px solid var(--border)",
  background: primary ? "var(--accent)" : "var(--panel-dark)",
  color: primary ? "var(--on-accent)" : "var(--text-main)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
});
const help: React.CSSProperties = { fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 };

const asResult = (r: RefRecord & { openalex_id?: string }): PaperResult => ({
  openalex_id: r.openalex_id ?? "",
  doi: r.doi,
  title: r.title,
  year: r.year,
  venue: r.venue,
  authors: r.authors,
});

export function paperToRef(p: Paper): RefRecord {
  let authors: string[] = [];
  try {
    const a = JSON.parse(p.authors_json || "[]");
    if (Array.isArray(a)) authors = a.map(String);
  } catch {}
  return { title: p.title, authors, year: p.year, venue: p.venue, doi: p.doi, abstract: p.abstract, url: p.oa_url };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
interface Row extends RefRecord {
  openalex_id?: string;
  cited_by_count?: number;
  referenced_works?: string[];
  oa_url?: string;
  existing?: Paper;
  dupInFile?: boolean;
}

export const ImportReferencesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  defaultCollectionId: string | null;
  onImported: (collectionId: string, created?: Collection) => void;
}> = ({ isOpen, onClose, collections, defaultCollectionId, onImported }) => {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [library, setLibrary] = useState<Paper[]>([]);
  const [lookingUp, setLookingUp] = useState<{ done: number; total: number } | null>(null);
  const [collId, setCollId] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setText("");
    setFileName("");
    setRows([]);
    setPicked({});
    setProblems([]);
    setNewName("");
    setCollId(defaultCollectionId && collections.some((c) => c.id === defaultCollectionId) ? defaultCollectionId : collections[0]?.id ?? "");
    getPapers().then(setLibrary).catch(() => setLibrary([]));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = useMemo(() => (text.trim() ? detectKind(text) : null), [text]);
  const dois = useMemo(() => (kind === "dois" ? extractDois(text) : []), [kind, text]);

  const libMap = useMemo(() => {
    const m = new Map<string, Paper>();
    for (const p of library) {
      let authors: string[] = [];
      try {
        authors = JSON.parse(p.authors_json || "[]");
      } catch {}
      for (const k of paperKeys({ openalex_id: p.openalex_id ?? "", doi: p.doi, title: p.title, year: p.year, authors })) m.set(k, p);
    }
    return m;
  }, [library]);

  /** mark rows that are already in the library, or repeated inside this import */
  const withFlags = (list: Row[]): Row[] => {
    const seen = new Set<string>();
    return list.map((r) => {
      const keys = paperKeys(asResult(r));
      const existing = keys.map((k) => libMap.get(k)).find(Boolean);
      const dupInFile = keys.some((k) => seen.has(k));
      keys.forEach((k) => seen.add(k));
      return { ...r, existing, dupInFile };
    });
  };

  const show = (list: Row[], probs: string[]) => {
    const flagged = withFlags(list);
    setRows(flagged);
    setProblems(probs);
    setPicked(Object.fromEntries(flagged.map((r, i) => [i, !r.existing && !r.dupInFile])));
  };

  // re-evaluate the flags once the library has loaded
  useEffect(() => {
    if (rows.length) {
      const flagged = withFlags(rows);
      setRows(flagged);
      setPicked((prev) => Object.fromEntries(flagged.map((r, i) => [i, prev[i] ?? (!r.existing && !r.dupInFile)])));
    }
  }, [libMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const readText = (t: string) => {
    setText(t);
    const k = t.trim() ? detectKind(t) : null;
    if (k === "bibtex") {
      const r = parseBibtex(t);
      show(r.refs, r.problems);
    } else if (k === "ris") {
      const r = parseRis(t);
      show(r.refs, r.problems);
    } else {
      show([], []);
    }
  };

  const chooseFile = async () => {
    const f = await pickTextFile(["bib", "bibtex", "ris", "txt", "enw"]);
    if (!f) return;
    setFileName(f.name);
    readText(f.text);
  };

  const lookUpDois = async () => {
    setLookingUp({ done: 0, total: dois.length });
    const out: Row[] = [];
    const probs: string[] = [];
    for (let i = 0; i < dois.length; i++) {
      try {
        const r = await lookupDoi(dois[i]);
        out.push({
          title: r.title,
          authors: r.authors,
          year: r.year,
          venue: r.venue,
          doi: r.doi ? r.doi.replace(/^https?:\/\/doi\.org\//, "").toLowerCase() : dois[i],
          abstract: r.abstract,
          openalex_id: r.openalex_id,
          cited_by_count: r.cited_by_count,
          referenced_works: r.referenced_works,
          oa_url: r.oa_url,
        });
      } catch (err: any) {
        probs.push(`${dois[i]}: ${err?.toString?.() ?? err}`);
      }
      setLookingUp({ done: i + 1, total: dois.length });
    }
    setLookingUp(null);
    show(out, probs);
  };

  const chosen = rows.filter((_, i) => picked[i]);
  const typedName = newName.trim();
  const sameName = typedName ? collections.find((c) => c.name.trim().toLowerCase() === typedName.toLowerCase()) : undefined;
  const canImport = chosen.length > 0 && !busy && (!!typedName || !!collId);

  const doImport = async () => {
    if (!canImport) return;
    setBusy(true);
    try {
      let target = typedName ? sameName : collections.find((c) => c.id === collId);
      let created: Collection | undefined;
      if (!target) {
        created = await createCollection(typedName);
        target = created;
      }
      let added = 0;
      let reused = 0;
      let failed = 0;
      for (const r of chosen) {
        try {
          let paperId = r.existing?.id;
          if (paperId) reused++;
          else {
            const rec = await upsertPaper({
              title: r.title,
              authors_json: JSON.stringify(r.authors),
              year: r.year,
              venue: r.venue,
              abstract: r.abstract,
              doi: r.doi,
              openalex_id: r.openalex_id,
              oa_url: r.oa_url,
            });
            paperId = rec.id;
            if (r.cited_by_count != null || r.referenced_works?.length) {
              setPaperMeta(rec.id, r.cited_by_count, r.referenced_works?.length ? r.referenced_works : undefined).catch(() => {});
            }
            added++;
          }
          await addPaperToCollection(target.id, paperId);
        } catch {
          failed++;
        }
      }
      toast.success(
        `${added} new paper${added === 1 ? "" : "s"} imported${reused ? `, ${reused} already in your library added to “${target.name}”` : ` into “${target.name}”`}`
      );
      if (failed) toast.error(`${failed} could not be saved`);
      onImported(target.id, created);
      onClose();
    } catch (err: any) {
      toast.error("Import failed: " + (err?.toString?.() ?? err));
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = kind === "bibtex" ? "BibTeX" : kind === "ris" ? "RIS" : kind === "dois" ? `${dois.length} DOI${dois.length === 1 ? "" : "s"}` : kind === "unknown" ? "nothing recognised" : "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import references" width="720px">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={chooseFile} style={btn()}>
            Choose a file (.bib, .ris)…
          </button>
          {fileName && <span style={help}>Read {fileName}</span>}
          {kindLabel && (
            <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: kind === "unknown" ? "var(--danger-ink)" : "var(--accent-ink)" }}>
              Detected: {kindLabel}
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => readText(e.target.value)}
          placeholder={"…or paste BibTeX, RIS, or a list of DOIs here (one per line, or inside a reference list).\n\n@article{key, title = {…}, author = {…}, year = {2020}}\n10.1038/nature14539"}
          rows={6}
          aria-label="References to import"
          style={{ ...field, width: "100%", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", resize: "vertical" }}
        />

        {kind === "dois" && rows.length === 0 && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={lookUpDois} disabled={!!lookingUp} style={btn(true)}>
              {lookingUp ? `Looking up ${lookingUp.done} / ${lookingUp.total}…` : `Look up ${dois.length} DOI${dois.length === 1 ? "" : "s"} on OpenAlex`}
            </button>
            <span style={help}>Fetches title, authors, year, venue and abstract. Needs an internet connection.</span>
          </div>
        )}

        {problems.length > 0 && (
          <details style={{ ...help, border: "1px solid var(--border)", borderRadius: "6px", padding: "8px 12px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--danger-ink)" }}>
              {problems.length} item{problems.length === 1 ? "" : "s"} could not be read
            </summary>
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {problems.slice(0, 20).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </details>
        )}

        {rows.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)" }}>
                {chosen.length} of {rows.length} selected
              </span>
              <span style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => setPicked(Object.fromEntries(rows.map((_, i) => [i, true])))} style={{ ...btn(), padding: "4px 10px", fontSize: "12px" }}>
                  Select all
                </button>
                <button onClick={() => setPicked(Object.fromEntries(rows.map((r, i) => [i, !r.existing && !r.dupInFile])))} style={{ ...btn(), padding: "4px 10px", fontSize: "12px" }}>
                  New only
                </button>
              </span>
            </div>
            <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
              {rows.map((r, i) => (
                <label
                  key={i}
                  style={{ display: "flex", gap: "10px", padding: "9px 12px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", alignItems: "flex-start", background: picked[i] ? "var(--panel)" : "var(--panel-dark)" }}
                >
                  <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} style={{ marginTop: "3px", accentColor: "var(--accent)" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.35 }}>{r.title}</span>
                    <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>
                      {[r.authors.slice(0, 3).join(", ") + (r.authors.length > 3 ? " et al." : ""), r.year, r.venue].filter(Boolean).join(" · ")}
                    </span>
                    {(r.existing || r.dupInFile) && (
                      <span style={{ display: "inline-block", marginTop: "3px", fontSize: "11px", fontWeight: 700, color: "var(--warn-ink)" }}>
                        {r.existing ? "Already in your library (will be added to the collection without a copy)" : "Repeated in this import"}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ ...help, display: "block", marginBottom: "4px", fontWeight: 700 }}>Add to collection</label>
                <select value={collId} onChange={(e) => setCollId(e.target.value)} disabled={!!typedName || collections.length === 0} style={{ ...field, width: "100%", opacity: typedName ? 0.5 : 1 }}>
                  {collections.length === 0 && <option value="">No collections yet</option>}
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...help, display: "block", marginBottom: "4px", fontWeight: 700 }}>…or a new collection</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Type a name" style={{ ...field, width: "100%" }} />
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
          <button onClick={onClose} style={btn()}>
            Cancel
          </button>
          <button onClick={doImport} disabled={!canImport} style={{ ...btn(true), opacity: canImport ? 1 : 0.5, cursor: canImport ? "pointer" : "not-allowed" }}>
            {busy ? "Importing…" : `Import ${chosen.length || ""} paper${chosen.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const ExportReferencesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  name: string;
  papers: Paper[];
}> = ({ isOpen, onClose, name, papers }) => {
  const [format, setFormat] = useState<"bibtex" | "ris">("bibtex");
  const content = useMemo(() => {
    const refs = papers.map(paperToRef);
    return format === "bibtex" ? toBibtex(refs) : toRis(refs);
  }, [papers, format]);
  const base = (name || "references").replace(/[^a-zA-Z0-9_-]+/g, "_");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to the clipboard");
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };
  const save = async () => {
    try {
      const where = await saveTextFile(
        `${base}.${format === "bibtex" ? "bib" : "ris"}`,
        content,
        format === "bibtex" ? { name: "BibTeX", extensions: ["bib"] } : { name: "RIS", extensions: ["ris"] }
      );
      if (where) toast.success(`Saved ${papers.length} reference${papers.length === 1 ? "" : "s"}: ${where}`);
    } catch (err: any) {
      toast.error("Could not save: " + (err?.toString?.() ?? err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Export “${name}”`} width="680px">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {([
            ["bibtex", "BibTeX (.bib)"],
            ["ris", "RIS (.ris)"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFormat(id)}
              aria-pressed={format === id}
              style={{ ...btn(format === id), padding: "6px 14px", fontSize: "12px" }}
            >
              {label}
            </button>
          ))}
          <span style={{ ...help, marginLeft: "auto" }}>
            {papers.length} reference{papers.length === 1 ? "" : "s"} · {format === "bibtex" ? "for LaTeX, Zotero, JabRef" : "for EndNote, Zotero, Mendeley"}
          </span>
        </div>
        <textarea
          readOnly
          value={papers.length ? content : "This collection has no papers to export."}
          rows={14}
          aria-label="Export preview"
          style={{ ...field, width: "100%", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", resize: "vertical" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={onClose} style={btn()}>
            Close
          </button>
          <button onClick={copy} disabled={!papers.length} style={btn()}>
            Copy
          </button>
          <button onClick={save} disabled={!papers.length} style={{ ...btn(true), opacity: papers.length ? 1 : 0.5 }}>
            Save file…
          </button>
        </div>
      </div>
    </Modal>
  );
};
