/**
 * Highlights and notes for the EPUB reader.
 * A highlight is anchored by character offsets inside one chapter, plus the quoted text and a little
 * text before and after it, so it can be found again even if the offsets drift.
 */

export type HlColor = "yellow" | "green" | "blue" | "pink";
export const HL_COLORS: { id: HlColor; label: string; solid: string }[] = [
  { id: "yellow", label: "Yellow", solid: "#f2c500" },
  { id: "green", label: "Green", solid: "#3fae5a" },
  { id: "blue", label: "Blue", solid: "#3d8bf2" },
  { id: "pink", label: "Pink", solid: "#e5559a" },
];

export interface Highlight {
  id: string;
  chapter: number; // data-chapter-index of the section
  start: number; // character offsets inside the chapter text
  end: number;
  quote: string;
  before: string;
  after: string;
  color: HlColor;
  note: string;
  createdAt: number;
}

const KEY = (bookId: string) => `foscl:epub_highlights:${bookId}`;

export function loadHighlights(bookId: string): Highlight[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(bookId)) || "[]");
    return Array.isArray(raw) ? raw.filter((h) => h && typeof h.id === "string" && typeof h.quote === "string") : [];
  } catch {
    return [];
  }
}

export function saveHighlights(bookId: string, list: Highlight[]) {
  try {
    if (list.length) localStorage.setItem(KEY(bookId), JSON.stringify(list));
    else localStorage.removeItem(KEY(bookId));
  } catch {}
}

export function deleteHighlightsFor(bookId: string) {
  try {
    localStorage.removeItem(KEY(bookId));
  } catch {}
}

// ---------------------------------------------------------------------------
// Finding the text again
// ---------------------------------------------------------------------------
const CONTEXT = 30;

/** Where does the highlight sit in this chapter text? Tries the saved offsets first, then searches for the quote. */
export function locate(text: string, h: Pick<Highlight, "start" | "end" | "quote" | "before" | "after">): [number, number] | null {
  if (!h.quote) return null;
  if (text.slice(h.start, h.end) === h.quote) return [h.start, h.end];
  // look for every place the quote occurs and take the one whose surroundings match best
  let best: { at: number; score: number } | null = null;
  let from = 0;
  for (;;) {
    const at = text.indexOf(h.quote, from);
    if (at === -1) break;
    let score = 0;
    const b = text.slice(Math.max(0, at - h.before.length), at);
    const a = text.slice(at + h.quote.length, at + h.quote.length + h.after.length);
    for (let i = 1; i <= Math.min(b.length, h.before.length); i++) if (b[b.length - i] === h.before[h.before.length - i]) score++;
    for (let i = 0; i < Math.min(a.length, h.after.length); i++) if (a[i] === h.after[i]) score++;
    score -= Math.abs(at - h.start) / 100000; // prefer the closest on a tie
    if (!best || score > best.score) best = { at, score };
    from = at + 1;
  }
  return best ? [best.at, best.at + h.quote.length] : null;
}

// ---------------------------------------------------------------------------
// DOM work (runs against the document inside the reader iframe)
// ---------------------------------------------------------------------------
function textNodes(root: Node): Text[] {
  const doc = root.ownerDocument!;
  const out: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const tag = (n.parentElement?.tagName || "").toLowerCase();
      return tag === "script" || tag === "style" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

export function chapterText(section: Element): string {
  return textNodes(section).map((t) => t.data).join("");
}

function offsetOf(section: Element, node: Node, offset: number): number {
  let total = 0;
  for (const t of textNodes(section)) {
    if (t === node) return total + offset;
    total += t.data.length;
  }
  // `node` is an element: count the text before its child at `offset`
  const r = section.ownerDocument!.createRange();
  r.setStart(section, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

export function sectionOf(node: Node | null): HTMLElement | null {
  const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
  return (el?.closest?.(".foscl-chapter") as HTMLElement | null) ?? null;
}

/** Turn the current selection into a highlight draft, or explain why not. */
export function selectionToDraft(doc: Document): { draft: Omit<Highlight, "id" | "color" | "note" | "createdAt">; rect: DOMRect } | { error: string } | null {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const a = sectionOf(range.startContainer);
  const b = sectionOf(range.endContainer);
  if (!a || !b) return null;
  if (a !== b) return { error: "Select text inside one chapter at a time." };
  const text = chapterText(a);
  const start = offsetOf(a, range.startContainer, range.startOffset);
  const end = offsetOf(a, range.endContainer, range.endOffset);
  if (end <= start) return null;
  const quote = text.slice(start, end);
  if (quote.trim().length < 2) return null;
  const rects = range.getClientRects();
  const rect = rects.length ? rects[0] : range.getBoundingClientRect();
  return {
    draft: {
      chapter: Number(a.dataset.chapterIndex),
      start,
      end,
      quote,
      before: text.slice(Math.max(0, start - CONTEXT), start),
      after: text.slice(end, end + CONTEXT),
    },
    rect,
  };
}

/** Wrap the highlighted text in <mark> elements. Returns false if the text could not be found. */
export function paintHighlight(doc: Document, h: Highlight): boolean {
  const section = doc.querySelector<HTMLElement>(`.foscl-chapter[data-chapter-index="${h.chapter}"]`);
  if (!section) return false;
  clearMarks(doc, h.id);
  const found = locate(chapterText(section), h);
  if (!found) return false;
  const [from, to] = found;

  // collect the pieces first, because wrapping splits text nodes
  const pieces: { node: Text; a: number; b: number }[] = [];
  let pos = 0;
  for (const t of textNodes(section)) {
    const len = t.data.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + len);
    if (b > a) pieces.push({ node: t, a: a - pos, b: b - pos });
    pos += len;
    if (pos >= to) break;
  }
  for (const p of pieces) {
    if (!p.node.data.slice(p.a, p.b).trim() && pieces.length > 1) continue; // skip whitespace-only gaps between blocks
    const r = doc.createRange();
    r.setStart(p.node, p.a);
    r.setEnd(p.node, p.b);
    const mark = doc.createElement("mark");
    mark.className = "foscl-hl";
    mark.dataset.hl = h.id;
    mark.dataset.color = h.color;
    if (h.note) mark.dataset.note = "1";
    r.surroundContents(mark);
  }
  return pieces.length > 0;
}

export function clearMarks(doc: Document, id: string) {
  doc.querySelectorAll(`mark.foscl-hl[data-hl="${id}"]`).forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

export function recolorMarks(doc: Document, id: string, color: HlColor, hasNote: boolean) {
  doc.querySelectorAll<HTMLElement>(`mark.foscl-hl[data-hl="${id}"]`).forEach((m) => {
    m.dataset.color = color;
    if (hasNote) m.dataset.note = "1";
    else delete m.dataset.note;
  });
}

/** Style rules for the marks, tuned to the page colour so text stays readable. */
export function highlightCss(pageTheme: string): string {
  const night = pageTheme === "night";
  const a = night ? 0.4 : 0.5;
  const rgb: Record<HlColor, string> = night
    ? { yellow: "230,190,40", green: "60,170,95", blue: "70,140,240", pink: "225,85,150" }
    : { yellow: "255,214,0", green: "80,200,110", blue: "100,170,255", pink: "255,120,180" };
  return (
    `mark.foscl-hl{color:inherit;border-radius:2px;cursor:pointer;padding:0;}` +
    (Object.keys(rgb) as HlColor[]).map((c) => `mark.foscl-hl[data-color="${c}"]{background:rgba(${rgb[c]},${a});}`).join("") +
    `mark.foscl-hl[data-note="1"]{border-bottom:2px solid currentColor;}` +
    `mark.foscl-hl.foscl-hl-flash{outline:2px solid ${night ? "#ffffff" : "#000000"};outline-offset:1px;}`
  );
}

// ---------------------------------------------------------------------------
export function highlightsMarkdown(title: string, author: string, list: Highlight[], chapterTitle: (i: number) => string): string {
  const out: string[] = [`# Highlights — ${title}`];
  if (author) out.push(`*${author}*`);
  out.push("");
  const sorted = [...list].sort((a, b) => a.chapter - b.chapter || a.start - b.start);
  let last = -1;
  for (const h of sorted) {
    if (h.chapter !== last) {
      out.push(`## ${chapterTitle(h.chapter)}`, "");
      last = h.chapter;
    }
    out.push(...h.quote.trim().split(/\n+/).map((l) => `> ${l.trim()}`));
    if (h.note.trim()) out.push("", `**Note:** ${h.note.trim().replace(/\n+/g, " ")}`);
    out.push("");
  }
  if (sorted.length === 0) out.push("_No highlights yet._", "");
  return out.join("\n");
}
