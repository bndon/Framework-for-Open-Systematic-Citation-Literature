/**
 * Reading and writing reference files (BibTeX, RIS) and picking DOIs out of free text.
 * Pure functions with no app dependencies, so they are easy to test.
 */

export interface RefRecord {
  title: string;
  authors: string[]; // "First Last"
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  url?: string;
  key?: string; // citation key from the source file
  type?: string;
}

export interface ParseResult {
  refs: RefRecord[];
  /** entries that could not be read (with a short reason) */
  problems: string[];
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
export function normalizeDoiString(raw: string): string {
  return raw
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/[.,;:)\]}>"']+$/, "")
    .toLowerCase();
}

/** Every DOI found in some text (a pasted list, a reference list, a URL...). Order kept, duplicates dropped. */
export function extractDois(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /10\.\d{4,9}\/[^\s"'<>,;]+/g;
  for (const m of text.matchAll(re)) {
    const d = normalizeDoiString(m[0]);
    if (d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

/** "Last, First" -> "First Last"; names already in "First Last" order are left alone. */
export function flipName(name: string): string {
  const n = name.replace(/\s+/g, " ").trim();
  if (!n) return "";
  const parts = n.split(",").map((s) => s.trim());
  if (parts.length === 2 && parts[0] && parts[1]) return `${parts[1]} ${parts[0]}`;
  if (parts.length === 3 && parts[0] && parts[2]) return `${parts[2]} ${parts[0]}${parts[1] ? " " + parts[1] : ""}`; // Last, Jr, First
  return n;
}

const ACCENTS: Record<string, string> = {
  '"': "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302", "~": "\u0303", "=": "\u0304", ".": "\u0307",
  c: "\u0327", v: "\u030C", u: "\u0306", H: "\u030B", k: "\u0328",
};
const LETTERS: Record<string, string> = {
  ss: "ß", o: "ø", O: "Ø", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å", l: "ł", L: "Ł", i: "ı", j: "ȷ",
};

/** Turn the LaTeX in a BibTeX value into plain text. */
export function latexToText(input: string): string {
  let s = input;
  // accents written as \"{o}, \"o, {\"o}, \c{c}, \v s ...
  s = s.replace(/\\([cvuHk])\s*\{(\w)\}|\\([cvuHk])\s+(\w)/g, (_m, a, b, c, d) => (b ?? d) + ACCENTS[a ?? c]);
  s = s.replace(/\\(["'`^~=.])\s*\{\\?(\w)\}|\\(["'`^~=.])\s*\\?(\w)/g, (_m, a, b, c, d) => (b ?? d) + ACCENTS[a ?? c]);
  s = s.replace(/\\(ss|oe|OE|ae|AE|aa|AA|o|O|l|L|i|j)(?![A-Za-z])\s*/g, (_m, l) => LETTERS[l]);
  s = s.replace(/\\([&%$#_{}])/g, "$1");
  s = s.replace(/\\(?:textit|textbf|emph|textsc|texttt|mathrm|mathit|text|url)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\[a-zA-Z]+\s*/g, ""); // any other command
  s = s.replace(/[{}]/g, "").replace(/~/g, " ").replace(/--+/g, "–");
  return s.replace(/\s+/g, " ").trim().normalize("NFC");
}

const yearOf = (v?: string): number | undefined => {
  const m = v?.match(/\b(1[5-9]\d\d|20\d\d|21\d\d)\b/);
  return m ? Number(m[1]) : undefined;
};

// ---------------------------------------------------------------------------
// BibTeX
// ---------------------------------------------------------------------------
function splitAuthors(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  const lower = raw;
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
    if (depth === 0 && /^\sand\s/i.test(lower.slice(i, i + 5))) {
      parts.push(cur);
      cur = "";
      i += 4;
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts
    .map((a) => a.trim())
    .filter((a) => a && a.toLowerCase() !== "others")
    .map((a) => flipName(latexToText(a)));
}

/** Read one braced or quoted value starting at `i`; returns [text, nextIndex]. */
function readValue(src: string, i: number, macros: Record<string, string>): [string, number] {
  let out = "";
  for (;;) {
    while (/\s/.test(src[i] ?? "")) i++;
    const ch = src[i];
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "\\") j++; // skip escaped char
        else if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      if (depth !== 0) throw new Error("unbalanced braces");
      out += src.slice(i + 1, j - 1);
      i = j;
    } else if (ch === '"') {
      let depth = 0;
      let j = i + 1;
      while (j < src.length && !(src[j] === '"' && depth === 0)) {
        if (src[j] === "\\") j++;
        else if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      if (j >= src.length) throw new Error("unterminated quote");
      out += src.slice(i + 1, j);
      i = j + 1;
    } else {
      const m = /^[A-Za-z0-9_:.\-+/]+/.exec(src.slice(i));
      if (!m) break;
      out += macros[m[0].toLowerCase()] ?? (/^\d+$/.test(m[0]) ? m[0] : m[0]);
      i += m[0].length;
    }
    while (/\s/.test(src[i] ?? "")) i++;
    if (src[i] === "#") {
      i++;
      continue; // concatenation
    }
    break;
  }
  return [out, i];
}

const MONTHS: Record<string, string> = { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December" };

export function parseBibtex(text: string): ParseResult {
  const refs: RefRecord[] = [];
  const problems: string[] = [];
  const macros: Record<string, string> = { ...Object.fromEntries(Object.entries(MONTHS).map(([k, v]) => [k, v])) };
  let i = 0;
  while ((i = text.indexOf("@", i)) !== -1) {
    const head = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(i, i + 80));
    if (!head) {
      i++;
      continue;
    }
    const type = head[1].toLowerCase();
    const close = head[2] === "{" ? "}" : ")";
    let p = i + head[0].length;
    try {
      if (type === "comment" || type === "preamble") {
        // skip the balanced block
        let depth = 1;
        while (p < text.length && depth > 0) {
          if (text[p] === head[2]) depth++;
          else if (text[p] === close) depth--;
          p++;
        }
        i = p;
        continue;
      }
      if (type === "string") {
        const m = /^\s*([A-Za-z0-9_\-]+)\s*=/.exec(text.slice(p));
        if (m) {
          const [val, next] = readValue(text, p + m[0].length, macros);
          macros[m[1].toLowerCase()] = latexToText(val);
          p = next;
        }
        i = Math.max(p, i + 1);
        continue;
      }
      // citation key
      const km = /^\s*([^,\s{}]*)\s*,/.exec(text.slice(p));
      const key = km ? km[1] : "";
      p += km ? km[0].length : 0;
      const fields: Record<string, string> = {};
      for (;;) {
        while (/[\s,]/.test(text[p] ?? "")) p++;
        if (p >= text.length || text[p] === close) {
          p++;
          break;
        }
        const fm = /^([A-Za-z][A-Za-z0-9_\-:]*)\s*=\s*/.exec(text.slice(p));
        if (!fm) throw new Error(`could not read a field near “${text.slice(p, p + 20).replace(/\s+/g, " ")}”`);
        const [val, next] = readValue(text, p + fm[0].length, macros);
        fields[fm[1].toLowerCase()] = val;
        p = next;
      }
      i = p;

      const title = latexToText(fields.title ?? "");
      if (!title) {
        problems.push(`${key || "(no key)"}: no title`);
        continue;
      }
      const doiRaw = fields.doi || extractDois(`${fields.url ?? ""} ${fields.note ?? ""}`)[0] || "";
      const venue = latexToText(fields.journal || fields.journaltitle || fields.booktitle || fields.series || fields.school || fields.institution || fields.publisher || "");
      refs.push({
        title,
        authors: splitAuthors(fields.author || fields.editor || ""),
        year: yearOf(fields.year) ?? yearOf(fields.date),
        venue: venue || undefined,
        doi: doiRaw ? normalizeDoiString(latexToText(doiRaw)) : undefined,
        abstract: fields.abstract ? latexToText(fields.abstract) : undefined,
        url: fields.url ? latexToText(fields.url) : undefined,
        key: key || undefined,
        type,
      });
    } catch (err: any) {
      problems.push(`Entry near character ${i}: ${err?.message ?? err}`);
      i = Math.max(p, i + 1);
    }
  }
  return { refs, problems };
}

const escBib = (s: string) => s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_])/g, "\\$1");

const asciiLower = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const STOP = new Set(["a", "an", "the", "of", "on", "in", "for", "and", "to", "with", "from", "by", "at", "is", "are"]);

export function citeKey(r: RefRecord): string {
  const last = asciiLower((r.authors[0] || "anon").trim().split(/\s+/).pop() || "anon") || "anon";
  const word = asciiLower(r.title.split(/\s+/).find((w) => !STOP.has(w.toLowerCase().replace(/[^a-z]/g, "")) && asciiLower(w).length > 2) || "");
  return `${last}${r.year ?? ""}${word}`;
}

export function toBibtex(refs: RefRecord[]): string {
  const used = new Map<string, number>();
  return (
    refs
      .map((r) => {
        let key = citeKey(r);
        const n = used.get(key) ?? 0;
        used.set(key, n + 1);
        if (n > 0) key += String.fromCharCode(96 + n); // a, b, c ... for repeats
        const type = r.venue ? "article" : "misc";
        const lines: string[] = [];
        lines.push(`  title = {{${escBib(r.title)}}}`);
        if (r.authors.length) lines.push(`  author = {${r.authors.map(escBib).join(" and ")}}`);
        if (r.year) lines.push(`  year = {${r.year}}`);
        if (r.venue) lines.push(`  ${type === "article" ? "journal" : "howpublished"} = {${escBib(r.venue)}}`);
        if (r.doi) lines.push(`  doi = {${r.doi}}`);
        if (r.url) lines.push(`  url = {${r.url}}`);
        if (r.abstract) lines.push(`  abstract = {${escBib(r.abstract)}}`);
        return `@${type}{${key},\n${lines.join(",\n")}\n}`;
      })
      .join("\n\n") + "\n"
  );
}

// ---------------------------------------------------------------------------
// RIS
// ---------------------------------------------------------------------------
export function parseRis(text: string): ParseResult {
  const refs: RefRecord[] = [];
  const problems: string[] = [];
  let rec: Record<string, string[]> | null = null;
  let lastTag = "";

  const finish = () => {
    if (!rec) return;
    const first = (...tags: string[]) => {
      for (const t of tags) if (rec![t]?.[0]?.trim()) return rec![t][0].trim();
      return "";
    };
    const title = first("TI", "T1");
    if (!title) problems.push(`Record ${refs.length + problems.length + 1}: no title`);
    else {
      const doi = first("DO") || extractDois(first("UR", "L2", "M3"))[0] || "";
      refs.push({
        title,
        authors: [...(rec["AU"] ?? []), ...(rec["A1"] ?? [])].map(flipName).filter(Boolean),
        year: yearOf(first("PY", "Y1", "DA")),
        venue: first("JO", "JF", "T2", "JA", "BT") || undefined,
        doi: doi ? normalizeDoiString(doi) : undefined,
        abstract: first("AB", "N2") || undefined,
        url: first("UR") || undefined,
        key: first("ID") || undefined,
        type: first("TY") || undefined,
      });
    }
    rec = null;
    lastTag = "";
  };

  for (const raw of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])  ?-\s?(.*)$/.exec(raw);
    if (m) {
      const [, tag, val] = m;
      if (tag === "TY") {
        finish();
        rec = {};
      }
      if (tag === "ER") {
        finish();
        continue;
      }
      if (!rec) rec = {};
      (rec[tag] ??= []).push(val.trim());
      lastTag = tag;
    } else if (rec && lastTag && raw.trim()) {
      // continuation of a long value (abstracts are often wrapped)
      const arr = rec[lastTag];
      arr[arr.length - 1] = `${arr[arr.length - 1]} ${raw.trim()}`;
    }
  }
  finish();
  return { refs, problems };
}

const lastFirst = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
};

export function toRis(refs: RefRecord[]): string {
  return refs
    .map((r) => {
      const l: string[] = [`TY  - ${r.venue ? "JOUR" : "GEN"}`];
      r.authors.forEach((a) => l.push(`AU  - ${lastFirst(a)}`));
      l.push(`TI  - ${r.title}`);
      if (r.venue) l.push(`JO  - ${r.venue}`);
      if (r.year) l.push(`PY  - ${r.year}`);
      if (r.doi) l.push(`DO  - ${r.doi}`);
      if (r.url) l.push(`UR  - ${r.url}`);
      if (r.abstract) l.push(`AB  - ${r.abstract.replace(/\s+/g, " ")}`);
      l.push("ER  - ");
      return l.join("\r\n");
    })
    .join("\r\n\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
/** What kind of text is this? */
export type SourceKind = "bibtex" | "ris" | "dois" | "unknown";
export function detectKind(text: string): SourceKind {
  if (/@\s*[A-Za-z]+\s*[{(]/.test(text)) return "bibtex";
  if (/^TY  ?-/m.test(text)) return "ris";
  if (extractDois(text).length > 0) return "dois";
  return "unknown";
}
