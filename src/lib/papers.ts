import type { PaperResult } from "../types";

/** Lowercase, strip accents and punctuation so "Deep-Learning: A Survey" === "deep learning a survey". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
}

function normalizeOpenAlexId(id: string): string {
  return id.trim().toLowerCase().replace(/^https?:\/\/openalex\.org\//, "");
}

/** First author's last name token, normalized. */
function firstAuthorKey(p: PaperResult): string {
  const first = p.authors?.[0];
  if (!first) return "";
  const parts = normalizeTitle(first).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Identity keys for a paper. Two papers are the same work if ANY key matches:
 *  - the OpenAlex id (same record returned on two result pages)
 *  - the DOI
 *  - same title + same year, or same title + same first author
 *    (OpenAlex often returns a preprint and its published version as separate works)
 */
export function paperKeys(p: PaperResult): string[] {
  const keys: string[] = [];
  if (p.openalex_id) keys.push(`oa:${normalizeOpenAlexId(p.openalex_id)}`);
  if (p.doi) keys.push(`doi:${normalizeDoi(p.doi)}`);

  const title = normalizeTitle(p.title || "");
  // Very short / generic titles ("Introduction", "Untitled") are not a safe identity.
  if (title.length >= 12) {
    if (p.year) keys.push(`ty:${title}|${p.year}`);
    const author = firstAuthorKey(p);
    if (author) keys.push(`ta:${title}|${author}`);
  }
  return keys;
}

/** Fill gaps in `base` from `extra` without overwriting anything `base` already has. */
function mergePaper(base: PaperResult, extra: PaperResult): PaperResult {
  const baseAbstract = base.abstract?.trim() ?? "";
  const extraAbstract = extra.abstract?.trim() ?? "";
  return {
    ...base,
    doi: base.doi || extra.doi,
    venue: base.venue || extra.venue,
    year: base.year ?? extra.year,
    oa_url: base.oa_url || extra.oa_url,
    abstract: extraAbstract.length > baseAbstract.length ? extra.abstract : base.abstract,
    authors: base.authors && base.authors.length > 0 ? base.authors : extra.authors,
    // two records of the same paper: keep the bigger citation count and every known reference
    cited_by_count: Math.max(base.cited_by_count ?? -1, extra.cited_by_count ?? -1) >= 0
      ? Math.max(base.cited_by_count ?? -1, extra.cited_by_count ?? -1)
      : undefined,
    referenced_works: Array.from(new Set([...(base.referenced_works ?? []), ...(extra.referenced_works ?? [])])),
  };
}

export interface DedupeResult {
  papers: PaperResult[];
  /** How many incoming records were folded into an existing one. */
  merged: number;
}

/**
 * Append `incoming` to `existing`, folding duplicates into the first occurrence.
 * Order of first appearance is preserved, so relevance ranking is untouched.
 */
export function mergeResults(existing: PaperResult[], incoming: PaperResult[]): DedupeResult {
  const out: PaperResult[] = [...existing];
  const index = new Map<string, number>();
  out.forEach((p, i) => paperKeys(p).forEach((k) => index.set(k, i)));

  let merged = 0;
  for (const candidate of incoming) {
    const keys = paperKeys(candidate);
    const hit = keys.map((k) => index.get(k)).find((i) => i !== undefined);

    if (hit === undefined) {
      const at = out.length;
      out.push(candidate);
      keys.forEach((k) => index.set(k, at));
    } else {
      out[hit] = mergePaper(out[hit], candidate);
      // The merged record may now carry keys (e.g. a DOI) it didn't have before.
      paperKeys(out[hit]).forEach((k) => index.set(k, hit));
      merged += 1;
    }
  }
  return { papers: out, merged };
}

export function dedupePapers(papers: PaperResult[]): DedupeResult {
  return mergeResults([], papers);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export type SortMode = "relevance" | "newest" | "oldest" | "title" | "cited";

export interface DiscoverFilters {
  yearFrom: string;
  yearTo: string;
  openAccessOnly: boolean;
  hasAbstract: boolean;
  sort: SortMode;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  yearFrom: "",
  yearTo: "",
  openAccessOnly: false,
  hasAbstract: false,
  sort: "relevance",
};

function parseYear(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function countActiveFilters(f: DiscoverFilters): number {
  return (
    (parseYear(f.yearFrom) !== null ? 1 : 0) +
    (parseYear(f.yearTo) !== null ? 1 : 0) +
    (f.openAccessOnly ? 1 : 0) +
    (f.hasAbstract ? 1 : 0) +
    (f.sort !== "relevance" ? 1 : 0)
  );
}

export function applyFilters(papers: PaperResult[], f: DiscoverFilters): PaperResult[] {
  let from = parseYear(f.yearFrom);
  let to = parseYear(f.yearTo);
  // Forgive a swapped range instead of silently showing nothing.
  if (from !== null && to !== null && from > to) [from, to] = [to, from];

  const filtered = papers.filter((p) => {
    if (from !== null && (p.year == null || p.year < from)) return false;
    if (to !== null && (p.year == null || p.year > to)) return false;
    if (f.openAccessOnly && !p.oa_url) return false;
    if (f.hasAbstract && !(p.abstract && p.abstract.trim().length > 0)) return false;
    return true;
  });

  if (f.sort === "relevance") return filtered; // keep API order
  const sorted = [...filtered];
  if (f.sort === "newest") sorted.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
  if (f.sort === "oldest") sorted.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
  if (f.sort === "cited") sorted.sort((a, b) => (b.cited_by_count ?? -1) - (a.cited_by_count ?? -1));
  if (f.sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  return sorted;
}

/**
 * Citation links among a set of papers: `from` cites `to`, judged from OpenAlex reference lists.
 * Only links between papers in the set are returned.
 */
export function citationLinks(papers: PaperResult[]): { from: string; to: string }[] {
  const byNorm = new Map(papers.map((p) => [normalizeOpenAlexId(p.openalex_id || ""), p.openalex_id]));
  const out: { from: string; to: string }[] = [];
  for (const p of papers) {
    const self = normalizeOpenAlexId(p.openalex_id || "");
    for (const ref of p.referenced_works ?? []) {
      const target = byNorm.get(normalizeOpenAlexId(ref));
      if (target && normalizeOpenAlexId(ref) !== self) out.push({ from: p.openalex_id, to: target });
    }
  }
  return out;
}
