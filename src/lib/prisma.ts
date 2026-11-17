import type { Paper, ScreeningDecision, SearchLogEntry } from "../types";

export interface ReasonCount {
  reason: string;
  n: number;
}

export interface PrismaCounts {
  /** Records found by searches (or typed in by hand). null = nothing known, so the first box shows the collection size. */
  identified: number;
  identifiedSource: "log" | "manual" | "collection";
  searches: number;
  duplicates: number;
  /** Found, not duplicate, but never imported into the collection (dismissed while browsing results). */
  notImported: number;
  screened: number;
  stage1Undecided: number;
  excludedStage1: number;
  /** include + maybe at title/abstract stage, i.e. papers that go on to full-text assessment */
  assessed: number;
  fullTextUndecided: number;
  excludedFullText: number;
  excludedReasons: ReasonCount[];
  /** still "maybe" after full-text assessment */
  maybeFullText: number;
  included: number;
}

export const NO_REASON = "No reason given";

export function computePrisma(
  papers: Paper[],
  decisions: ScreeningDecision[],
  searches: SearchLogEntry[],
  manualIdentified?: number | null
): PrismaCounts {
  const inColl = new Set(papers.map((p) => p.id));
  const d1 = new Map<string, ScreeningDecision>();
  const d2 = new Map<string, ScreeningDecision>();
  for (const d of decisions) {
    if (!inColl.has(d.paper_id)) continue;
    (d.stage === "title_abstract" ? d1 : d2).set(d.paper_id, d);
  }

  const screened = papers.length;
  let excludedStage1 = 0;
  const toFullText: string[] = [];
  for (const p of papers) {
    const d = d1.get(p.id);
    if (!d) continue;
    if (d.decision === "exclude") excludedStage1++;
    else toFullText.push(p.id);
  }
  const stage1Decided = excludedStage1 + toFullText.length;

  let excludedFullText = 0;
  let included = 0;
  let maybeFullText = 0;
  const reasons = new Map<string, number>();
  for (const id of toFullText) {
    const d = d2.get(id);
    if (!d) continue;
    if (d.decision === "include") included++;
    else if (d.decision === "maybe") maybeFullText++;
    else {
      excludedFullText++;
      const r = d.reason?.trim() || NO_REASON;
      reasons.set(r, (reasons.get(r) || 0) + 1);
    }
  }

  const logFound = searches.reduce((a, s) => a + s.found, 0);
  const logUnique = searches.reduce((a, s) => a + s.unique_count, 0);
  let identified = screened;
  let source: PrismaCounts["identifiedSource"] = "collection";
  let duplicates = 0;
  if (manualIdentified != null && manualIdentified >= 0) {
    identified = manualIdentified;
    source = "manual";
    duplicates = Math.max(0, logFound - logUnique);
  } else if (logFound > 0) {
    identified = logFound;
    source = "log";
    duplicates = Math.max(0, logFound - logUnique);
  }
  const afterDup = Math.max(0, identified - duplicates);

  return {
    identified,
    identifiedSource: source,
    searches: searches.length,
    duplicates,
    notImported: source === "collection" ? 0 : Math.max(0, afterDup - screened),
    screened,
    stage1Undecided: screened - stage1Decided,
    excludedStage1,
    assessed: toFullText.length,
    fullTextUndecided: toFullText.length - excludedFullText - included - maybeFullText,
    excludedFullText,
    excludedReasons: [...reasons.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    maybeFullText,
    included,
  };
}

export function prismaText(c: PrismaCounts, collectionName: string): string {
  const lines = [
    `PRISMA flow — ${collectionName}`,
    "",
    c.identifiedSource === "collection"
      ? `Records in collection: ${c.identified}`
      : `Records identified from searches${c.searches ? ` (${c.searches} search${c.searches === 1 ? "" : "es"})` : ""}: ${c.identified}${c.identifiedSource === "manual" ? " (entered manually)" : ""}`,
  ];
  if (c.identifiedSource !== "collection") {
    lines.push(`Duplicates removed: ${c.duplicates}`);
    if (c.notImported) lines.push(`Dismissed before import: ${c.notImported}`);
  }
  lines.push(
    `Records screened (title/abstract): ${c.screened}`,
    `  Excluded: ${c.excludedStage1}`,
    `  Not decided yet: ${c.stage1Undecided}`,
    `Assessed in full text: ${c.assessed}`,
    `  Excluded: ${c.excludedFullText}`,
    ...c.excludedReasons.map((r) => `    ${r.reason}: ${r.n}`),
    `  Still undecided: ${c.fullTextUndecided + c.maybeFullText}`,
    `Included in the review: ${c.included}`
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Flow diagram (SVG as a string, so the same code draws it on screen and writes the file)
// ---------------------------------------------------------------------------
export interface PrismaPalette {
  bg: string;
  box: string;
  stroke: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

export function prismaSvg(c: PrismaCounts, p: PrismaPalette): { svg: string; width: number; height: number } {
  const W = 600;
  const mainX = 20;
  const mainW = 250;
  const sideX = 330;
  const sideW = 250;
  const LH = 19;
  let out = "";
  let y = 18;

  type Box = { x: number; w: number; y: number; h: number };
  const box = (x: number, w: number, top: number, title: string, lines: string[], accent = false): Box => {
    const body = lines.flatMap((l) => wrap(l, Math.floor(w / 8.2)));
    const h = 16 + LH * (1 + body.length) + 6;
    out += `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="7" fill="${accent ? p.accent : p.box}" stroke="${accent ? p.accent : p.stroke}" stroke-width="1.5"/>`;
    out += `<text x="${x + 12}" y="${top + 23}" font-size="15" font-weight="700" fill="${accent ? p.accentText : p.text}">${esc(title)}</text>`;
    body.forEach((l, i) => {
      out += `<text x="${x + 12}" y="${top + 23 + LH * (i + 1)}" font-size="13.5" fill="${accent ? p.accentText : p.muted}">${esc(l)}</text>`;
    });
    return { x, w, y: top, h };
  };
  const down = (b: Box, toY: number) => {
    const cx = b.x + b.w / 2;
    out += `<line x1="${cx}" y1="${b.y + b.h}" x2="${cx}" y2="${toY - 3}" stroke="${p.stroke}" stroke-width="1.5"/>`;
    out += `<path d="M${cx - 5} ${toY - 9} L${cx} ${toY - 2} L${cx + 5} ${toY - 9}" fill="none" stroke="${p.stroke}" stroke-width="1.5"/>`;
  };
  const right = (from: Box, to: Box) => {
    const yy = Math.min(from.y + from.h / 2, to.y + to.h - 8);
    out += `<line x1="${from.x + from.w}" y1="${yy}" x2="${to.x - 3}" y2="${yy}" stroke="${p.stroke}" stroke-width="1.5"/>`;
    out += `<path d="M${to.x - 9} ${yy - 5} L${to.x - 2} ${yy} L${to.x - 9} ${yy + 5}" fill="none" stroke="${p.stroke}" stroke-width="1.5"/>`;
  };
  const GAP = 30;

  // 1. identification
  const first =
    c.identifiedSource === "collection"
      ? box(mainX, mainW, y, "Records in collection", [`n = ${c.identified}`, "No search log linked to this collection"])
      : box(mainX, mainW, y, "Records identified", [`n = ${c.identified}`, c.identifiedSource === "manual" ? "entered manually" : `from ${c.searches} search${c.searches === 1 ? "" : "es"}`]);
  let prev = first;
  y = first.y + first.h + GAP;

  if (c.identifiedSource !== "collection") {
    const side = box(sideX, sideW, y - 6, "Removed before screening", [`Duplicates: ${c.duplicates}`, ...(c.notImported ? [`Dismissed in Discover: ${c.notImported}`] : [])]);
    // connector from the box above, through to the side box
    out += `<line x1="${prev.x + prev.w / 2}" y1="${prev.y + prev.h}" x2="${prev.x + prev.w / 2}" y2="${y}" stroke="${p.stroke}" stroke-width="1.5"/>`;
    out += `<line x1="${prev.x + prev.w / 2}" y1="${side.y + 24}" x2="${side.x - 3}" y2="${side.y + 24}" stroke="${p.stroke}" stroke-width="1.5"/>`;
    out += `<path d="M${side.x - 9} ${side.y + 19} L${side.x - 2} ${side.y + 24} L${side.x - 9} ${side.y + 29}" fill="none" stroke="${p.stroke}" stroke-width="1.5"/>`;
    y = Math.max(y, side.y + side.h) + 16;
  }

  // 2. screening
  const screened = box(mainX, mainW, y, "Records screened", [`n = ${c.screened}`, "title and abstract", ...(c.stage1Undecided ? [`${c.stage1Undecided} not decided yet`] : [])]);
  if (c.identifiedSource === "collection") down(prev, screened.y);
  else down({ ...prev, y: y - GAP - 6, h: 6 }, screened.y);
  const ex1 = box(sideX, sideW, screened.y, "Excluded", [`n = ${c.excludedStage1}`, "at title / abstract"]);
  right(screened, ex1);
  prev = screened;
  y = Math.max(screened.y + screened.h, ex1.y + ex1.h) + GAP;

  // 3. full text
  const assessed = box(mainX, mainW, y, "Assessed in full text", [`n = ${c.assessed}`, ...(c.fullTextUndecided + c.maybeFullText ? [`${c.fullTextUndecided + c.maybeFullText} not decided yet`] : [])]);
  down(prev, assessed.y);
  const reasonLines = c.excludedReasons.length ? c.excludedReasons.map((r) => `${r.reason}: ${r.n}`) : ["No reasons recorded yet"];
  const ex2 = box(sideX, sideW, assessed.y, "Excluded with reasons", [`n = ${c.excludedFullText}`, ...reasonLines]);
  right(assessed, ex2);
  prev = assessed;
  y = Math.max(assessed.y + assessed.h, ex2.y + ex2.h) + GAP;

  // 4. included
  const inc = box(mainX, mainW, y, "Included in the review", [`n = ${c.included}`], true);
  down(prev, inc.y);
  const height = inc.y + inc.h + 14;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" font-family="Inter, Segoe UI, Arial, sans-serif"><rect width="${W}" height="${height}" fill="${p.bg}"/>${out}</svg>`;
  return { svg, width: W, height };
}
