import JSZip from "jszip";
import type { Book, EpubChapter, TocItem } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedEpub = {
  chapters: EpubChapter[];
  toc: TocItem[];
  zip: JSZip;
  packageDir: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getTextNS(xml: Document, tag: string): string | null {
  return (
    xml.getElementsByTagNameNS("*", tag).item(0)?.textContent?.trim() ?? null
  );
}

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith("/")) {
    relative = relative.slice(1);
  }
  const combined = base ? `${base}/${relative}` : relative;
  const parts = combined.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      out.pop();
    } else {
      out.push(p);
    }
  }
  return out.join("/");
}

function findZipFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  return (
    zip.file(path) ??
    zip.file(decodeURIComponent(path)) ??
    zip.file(encodeURI(path)) ??
    null
  );
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return map[ext] ?? "image/octet-stream";
}

async function replaceAsync(
  str: string,
  regex: RegExp,
  fn: (match: string, ...groups: string[]) => Promise<string>,
): Promise<string> {
  const re = new RegExp(
    regex.source,
    regex.flags.includes("g") ? regex.flags : `${regex.flags}g`,
  );
  const hits: Array<{ start: number; end: number; job: Promise<string> }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const captured = m;
    hits.push({
      start: captured.index,
      end: captured.index + captured[0].length,
      job: fn(captured[0], ...captured.slice(1)),
    });
  }
  if (!hits.length) return str;
  const values = await Promise.all(hits.map((h) => h.job));
  let result = "";
  let cursor = 0;
  for (let i = 0; i < hits.length; i++) {
    result += str.slice(cursor, hits[i].start) + values[i];
    cursor = hits[i].end;
  }
  return result + str.slice(cursor);
}

// ---------------------------------------------------------------------------
// Cover Image Extraction
// ---------------------------------------------------------------------------

async function extractCoverDataUrl(
  zip: JSZip,
  packageXml: Document,
  packageDir: string,
): Promise<string | undefined> {
  try {
    let coverHref: string | null = null;
    const items = Array.from(packageXml.getElementsByTagNameNS("*", "item"));

    // 1. EPUB 3: item with properties="cover-image"
    for (const item of items) {
      const props = item.getAttribute("properties");
      if (props && props.includes("cover-image")) {
        coverHref = item.getAttribute("href");
        break;
      }
    }

    // 2. EPUB 2: meta name="cover" pointing to item id
    if (!coverHref) {
      const metas = Array.from(packageXml.getElementsByTagNameNS("*", "meta"));
      for (const meta of metas) {
        if (meta.getAttribute("name")?.toLowerCase() === "cover") {
          const coverId = meta.getAttribute("content");
          if (coverId) {
            const matchItem = items.find((it) => it.getAttribute("id") === coverId);
            if (matchItem) {
              coverHref = matchItem.getAttribute("href");
              break;
            }
          }
        }
      }
    }

    // 3. Fallback: item with id or href containing "cover" and an image media-type
    if (!coverHref) {
      for (const item of items) {
        const id = item.getAttribute("id")?.toLowerCase() ?? "";
        const href = item.getAttribute("href")?.toLowerCase() ?? "";
        const media = item.getAttribute("media-type")?.toLowerCase() ?? "";
        if (
          media.startsWith("image/") &&
          (id.includes("cover") || href.includes("cover"))
        ) {
          coverHref = item.getAttribute("href");
          break;
        }
      }
    }

    if (!coverHref) return undefined;

    const resolved = resolvePath(packageDir, coverHref);
    const file = findZipFile(zip, resolved);
    if (!file) return undefined;

    const base64 = await file.async("base64");
    const mime = mimeForPath(resolved);
    return `data:${mime};base64,${base64}`;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Import: extract metadata + raw bytes from a File
// ---------------------------------------------------------------------------

export async function importEpubFile(
  file: File,
): Promise<{ book: Book; data: ArrayBuffer }> {
  const data = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(data);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Missing META-INF/container.xml — not a valid EPUB");
  }

  const containerXml = new DOMParser().parseFromString(
    await containerFile.async("text"),
    "application/xml",
  );
  if (containerXml.querySelector("parsererror")) {
    throw new Error("Could not parse EPUB container XML");
  }

  const packagePath = containerXml
    .getElementsByTagNameNS("*", "rootfile")
    .item(0)
    ?.getAttribute("full-path");
  if (!packagePath) throw new Error("Could not locate EPUB package document");

  const packageFile = findZipFile(zip, packagePath);
  if (!packageFile) {
    throw new Error(`Package document not found at: ${packagePath}`);
  }

  const packageXml = new DOMParser().parseFromString(
    await packageFile.async("text"),
    "application/xml",
  );
  if (packageXml.querySelector("parsererror")) {
    throw new Error("Could not parse EPUB package XML");
  }

  const packageDir = packagePath.includes("/")
    ? packagePath.substring(0, packagePath.lastIndexOf("/"))
    : "";

  const coverDataUrl = await extractCoverDataUrl(zip, packageXml, packageDir);

  const book: Book = {
    id: crypto.randomUUID(),
    title:
      getTextNS(packageXml, "title") ?? file.name.replace(/\.epub$/i, ""),
    author: getTextNS(packageXml, "creator") ?? "Unknown author",
    fileName: file.name,
    addedAt: Date.now(),
    coverDataUrl,
  };

  return { book, data };
}

// ---------------------------------------------------------------------------
// Table of Contents (TOC) Extraction
// ---------------------------------------------------------------------------

async function extractToc(
  zip: JSZip,
  packageXml: Document,
  packageDir: string,
  chapters: EpubChapter[],
): Promise<TocItem[]> {
  const tocEntries: Array<{ title: string; href: string }> = [];
  const items = Array.from(packageXml.getElementsByTagNameNS("*", "item"));

  // Helper to normalize href without anchor or query
  const normalizeHref = (href: string) =>
    href.split("#")[0].split("?")[0].trim().toLowerCase();

  // 1. Try EPUB 3 Navigation Document (item with properties="nav")
  const navItem = items.find((it) =>
    it.getAttribute("properties")?.includes("nav"),
  );

  if (navItem) {
    const navHref = navItem.getAttribute("href");
    if (navHref) {
      const resolved = resolvePath(packageDir, navHref);
      const navFile = findZipFile(zip, resolved);
      if (navFile) {
        try {
          const navText = await navFile.async("text");
          const navDoc = new DOMParser().parseFromString(
            navText,
            "application/xhtml+xml",
          );
          const navDir = resolved.includes("/")
            ? resolved.substring(0, resolved.lastIndexOf("/"))
            : "";

          const links = Array.from(navDoc.querySelectorAll("nav a"));
          for (const a of links) {
            const rawHref = a.getAttribute("href");
            const text = a.textContent?.trim();
            if (rawHref && text) {
              const fullTarget = resolvePath(navDir, rawHref);
              tocEntries.push({ title: text, href: fullTarget });
            }
          }
        } catch {
          // Fall through to NCX
        }
      }
    }
  }

  // 2. Try EPUB 2 NCX Document (toc.ncx)
  if (tocEntries.length === 0) {
    let ncxHref: string | null = null;
    const ncxItem = items.find(
      (it) =>
        it.getAttribute("media-type") === "application/x-dtbncx+xml" ||
        it.getAttribute("id")?.toLowerCase() === "ncx",
    );
    if (ncxItem) {
      ncxHref = ncxItem.getAttribute("href");
    } else {
      const spineTocId = packageXml
        .getElementsByTagNameNS("*", "spine")
        .item(0)
        ?.getAttribute("toc");
      if (spineTocId) {
        const match = items.find((it) => it.getAttribute("id") === spineTocId);
        if (match) ncxHref = match.getAttribute("href");
      }
    }

    if (ncxHref) {
      const resolved = resolvePath(packageDir, ncxHref);
      const ncxFile = findZipFile(zip, resolved);
      if (ncxFile) {
        try {
          const ncxText = await ncxFile.async("text");
          const ncxDoc = new DOMParser().parseFromString(
            ncxText,
            "application/xml",
          );
          const ncxDir = resolved.includes("/")
            ? resolved.substring(0, resolved.lastIndexOf("/"))
            : "";

          const navPoints = Array.from(
            ncxDoc.getElementsByTagNameNS("*", "navPoint"),
          );
          for (const np of navPoints) {
            const textEl = np.getElementsByTagNameNS("*", "text").item(0);
            const contentEl = np.getElementsByTagNameNS("*", "content").item(0);
            const title = textEl?.textContent?.trim();
            const src = contentEl?.getAttribute("src");
            if (title && src) {
              const fullTarget = resolvePath(ncxDir, src);
              tocEntries.push({ title, href: fullTarget });
            }
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  // Map TOC entries to spine chapter indices
  const result: TocItem[] = [];
  const chapterHrefMap = new Map<string, number>();

  chapters.forEach((ch, idx) => {
    const full = resolvePath(packageDir, ch.href);
    chapterHrefMap.set(normalizeHref(full), idx);
    chapterHrefMap.set(normalizeHref(ch.href), idx);
  });

  for (const entry of tocEntries) {
    const rawHref = entry.href;
    const [pathPart, anchorPart] = rawHref.split("#");
    const norm = normalizeHref(pathPart);
    let chIdx = chapterHrefMap.get(norm);

    if (chIdx === undefined) {
      // Fuzzy match by filename suffix
      const filename = norm.split("/").pop();
      if (filename) {
        for (const [key, idx] of chapterHrefMap.entries()) {
          if (key.endsWith(filename)) {
            chIdx = idx;
            break;
          }
        }
      }
    }

    if (chIdx !== undefined) {
      // Assign title to chapter if not yet assigned
      if (!chapters[chIdx].title) {
        chapters[chIdx].title = entry.title;
      }
      result.push({
        id: `toc_${result.length}`,
        title: entry.title,
        href: pathPart,
        chapterIndex: chIdx,
        anchor: anchorPart ? anchorPart.split("?")[0].trim() : undefined,
      });
    }
  }

  // Fallback: if no TOC was parsed or mapped, generate from chapters
  if (result.length === 0) {
    chapters.forEach((ch, idx) => {
      const title = ch.title || `Chapter ${idx + 1}`;
      result.push({
        id: `ch_${idx}`,
        title,
        href: ch.href,
        chapterIndex: idx,
      });
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Parse: open an ArrayBuffer as a navigable EPUB
// ---------------------------------------------------------------------------

export async function parseEpub(data: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(data);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Missing META-INF/container.xml — not a valid EPUB");
  }

  const containerXml = new DOMParser().parseFromString(
    await containerFile.async("text"),
    "application/xml",
  );
  if (containerXml.querySelector("parsererror")) {
    throw new Error("Could not parse EPUB container XML");
  }

  const packagePath = containerXml
    .getElementsByTagNameNS("*", "rootfile")
    .item(0)
    ?.getAttribute("full-path");
  if (!packagePath) throw new Error("Could not locate EPUB package document");

  const packageFile = findZipFile(zip, packagePath);
  if (!packageFile) {
    throw new Error(`Package document not found at: ${packagePath}`);
  }

  const packageXml = new DOMParser().parseFromString(
    await packageFile.async("text"),
    "application/xml",
  );
  if (packageXml.querySelector("parsererror")) {
    throw new Error("Could not parse EPUB package XML");
  }

  const packageDir = packagePath.includes("/")
    ? packagePath.substring(0, packagePath.lastIndexOf("/"))
    : "";

  // Build manifest: id → href
  const manifest = new Map<string, string>();
  for (const item of Array.from(
    packageXml.getElementsByTagNameNS("*", "item"),
  )) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, href);
  }

  // Walk spine
  const chapters: EpubChapter[] = [];
  for (const itemref of Array.from(
    packageXml.getElementsByTagNameNS("*", "itemref"),
  )) {
    const idref = itemref.getAttribute("idref");
    if (!idref) continue;
    const href = manifest.get(idref);
    if (href) {
      chapters.push({ id: idref, href });
    }
  }

  if (chapters.length === 0) {
    throw new Error("EPUB spine is empty — cannot read this book");
  }

  // Extract Table of Contents
  const toc = await extractToc(zip, packageXml, packageDir, chapters);

  return { chapters, toc, zip, packageDir };
}

// ---------------------------------------------------------------------------
// Load a single chapter as a self-contained HTML string
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: extract theme colors
// ---------------------------------------------------------------------------

function getThemePalette(theme: string): { bg: string; text: string; link: string; border: string; rule: string } {
  if (theme === "sepia") {
    return {
      bg: "#f4ebd6",
      text: "#3a2c1b",
      link: "#855527",
      border: "#cfc09f",
      rule: "rgba(58, 44, 27, 0.12)",
    };
  }
  if (theme === "cream" || theme === "light") {
    return {
      bg: "#fbf8f1",
      text: "#2b2724",
      link: "#377663",
      border: "#dcd4c4",
      rule: "rgba(0, 0, 0, 0.08)",
    };
  }
  // Night / dark (default)
  return {
    bg: "#161c1e",
    text: "#edf2f4",
    link: "#86b4a4",
    border: "#2e373b",
    rule: "rgba(255, 255, 255, 0.08)",
  };
}

// ---------------------------------------------------------------------------
// Load entire book as a unified document for seamless continuous/paginated reading
// ---------------------------------------------------------------------------

export async function loadFullBookHtml(
  parsed: ParsedEpub,
  theme: string,
  fontSize: number,
  readingMode: "continuous" | "single" | "double" = "continuous",
): Promise<string> {
  const palette = getThemePalette(theme);
  const imageCache = new Map<string, string>();
  const collectedStyles: string[] = [];
  const chapterSections: string[] = [];

  for (let idx = 0; idx < parsed.chapters.length; idx++) {
    const chapter = parsed.chapters[idx];
    const href = chapter.href.split("#")[0].split("?")[0];
    const fullPath = resolvePath(parsed.packageDir, href);
    const chapterDir = fullPath.includes("/")
      ? fullPath.substring(0, fullPath.lastIndexOf("/"))
      : "";

    const file = findZipFile(parsed.zip, fullPath);
    if (!file) continue;

    let chapterRaw = await file.async("text");

    // 1. Inline / collect stylesheets
    chapterRaw = await replaceAsync(
      chapterRaw,
      /<link\b[^>]*>/gi,
      async (tag) => {
        if (!/rel=["']stylesheet["']/i.test(tag)) return tag;
        const hm = /href=["']([^"']+)["']/i.exec(tag);
        if (!hm) return tag;
        if (/^https?:\/\//i.test(hm[1])) return tag;
        const cleanCssHref = hm[1].split("#")[0].split("?")[0];
        const resolved = resolvePath(chapterDir, cleanCssHref);
        const cssFile = findZipFile(parsed.zip, resolved);
        if (!cssFile) return "";
        const cssContent = await cssFile.async("text");
        collectedStyles.push(`<style>${cssContent}</style>`);
        return "";
      },
    );

    // 2. Inline images using imageCache
    chapterRaw = await replaceAsync(
      chapterRaw,
      /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
      async (full, before, src, after) => {
        if (/^data:|^https?:\/\//i.test(src)) return full;
        const cleanSrc = src.split("#")[0].split("?")[0];
        const resolved = resolvePath(chapterDir, cleanSrc);
        if (imageCache.has(resolved)) {
          return `${before}${imageCache.get(resolved)!}${after}`;
        }
        const imgFile = findZipFile(parsed.zip, resolved);
        if (!imgFile) return full;
        try {
          const b64 = await imgFile.async("base64");
          const dataUri = `data:${mimeForPath(resolved)};base64,${b64}`;
          imageCache.set(resolved, dataUri);
          return `${before}${dataUri}${after}`;
        } catch {
          return full;
        }
      },
    );

    // 2b. Inline SVG images
    chapterRaw = await replaceAsync(
      chapterRaw,
      /(<image\b[^>]*\b(?:xlink:href|href)=["'])([^"']+)(["'][^>]*>)/gi,
      async (full, before, src, after) => {
        if (/^data:|^https?:\/\//i.test(src)) return full;
        const cleanSrc = src.split("#")[0].split("?")[0];
        const resolved = resolvePath(chapterDir, cleanSrc);
        if (imageCache.has(resolved)) {
          return `${before}${imageCache.get(resolved)!}${after}`;
        }
        const imgFile = findZipFile(parsed.zip, resolved);
        if (!imgFile) return full;
        try {
          const b64 = await imgFile.async("base64");
          const dataUri = `data:${mimeForPath(resolved)};base64,${b64}`;
          imageCache.set(resolved, dataUri);
          return `${before}${dataUri}${after}`;
        } catch {
          return full;
        }
      },
    );

    // 3. Extract <style> from <head>
    const styleMatches = chapterRaw.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
    if (styleMatches) {
      collectedStyles.push(...styleMatches);
    }

    // 4. Extract body content
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(chapterRaw);
    const bodyContent = bodyMatch ? bodyMatch[1] : chapterRaw;

    // Wrap in section
    chapterSections.push(
      `<section class="foscl-chapter" id="foscl-chapter-${idx}" data-chapter-index="${idx}" data-href="${chapter.href}">
        ${bodyContent}
      </section>`,
    );
  }

  let modeStyles = "";
  if (readingMode === "continuous") {
    modeStyles = `
html {
  height: auto !important;
  min-height: 100% !important;
}
body {
  max-width: 680px !important;
  margin: 0 auto !important;
  padding: 40px 28px 140px !important;
  height: auto !important;
  min-height: 100% !important;
  overflow-y: visible !important;
  overflow-x: hidden !important;
}
.foscl-chapter {
  margin-bottom: 60px !important;
  padding-bottom: 40px !important;
}
.foscl-chapter:not(:last-child) {
  border-bottom: 1px dashed ${palette.border} !important;
}`;
  } else if (readingMode === "single") {
    modeStyles = `
html {
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
body {
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 32px 56px !important;
  box-sizing: border-box !important;
  column-width: calc(100vw - 112px) !important;
  column-gap: 112px !important;
  column-fill: auto !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
  max-width: none !important;
}
body::-webkit-scrollbar {
  display: none !important;
}
.foscl-chapter {
  break-before: page !important;
  page-break-before: always !important;
}
img, svg, video {
  max-width: 100% !important;
  max-height: calc(100vh - 90px) !important;
  object-fit: contain !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}`;
  } else {
    // "double" - two page spread
    modeStyles = `
html {
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
body {
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 32px 36px !important;
  box-sizing: border-box !important;
  column-width: calc(50vw - 72px) !important;
  column-gap: 72px !important;
  column-fill: auto !important;
  column-rule: 1px solid ${palette.rule} !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
  max-width: none !important;
}
body::-webkit-scrollbar {
  display: none !important;
}
.foscl-chapter {
  break-before: page !important;
  page-break-before: always !important;
}
img, svg, video {
  max-width: 100% !important;
  max-height: calc(100vh - 90px) !important;
  object-fit: contain !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${collectedStyles.join("\n")}
  <style id="foscl-reader-override">
    html {
      background: ${palette.bg} !important;
      color: ${palette.text} !important;
    }
    body {
      background: transparent !important;
      color: ${palette.text} !important;
      font-size: ${fontSize}px !important;
      line-height: 1.8 !important;
      font-family: Georgia, "Times New Roman", serif !important;
      box-sizing: border-box !important;
    }
    ${modeStyles}
    * {
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    a { color: ${palette.link} !important; }
    img, image, svg { max-width: 100% !important; height: auto !important; }
    pre, code { font-size: 0.85em !important; overflow-x: auto !important; }
  </style>
</head>
<body>
  ${chapterSections.join("\n")}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Load a single chapter as a self-contained HTML string (fallback)
// ---------------------------------------------------------------------------

export async function loadChapterHtml(
  parsed: ParsedEpub,
  chapterIndex: number,
  theme: string,
  fontSize: number,
  readingMode: "continuous" | "single" | "double" = "continuous",
): Promise<string> {
  const chapter = parsed.chapters[chapterIndex];
  if (!chapter) throw new Error("Chapter index out of range");

  const href = chapter.href.split("#")[0].split("?")[0];
  const fullPath = resolvePath(parsed.packageDir, href);
  const chapterDir = fullPath.includes("/")
    ? fullPath.substring(0, fullPath.lastIndexOf("/"))
    : "";

  const file = findZipFile(parsed.zip, fullPath);
  if (!file) throw new Error(`Chapter file not found: ${fullPath}`);

  let html = await file.async("text");
  const palette = getThemePalette(theme);

  // 1. Inline stylesheets
  html = await replaceAsync(
    html,
    /<link\b[^>]*>/gi,
    async (tag) => {
      if (!/rel=["']stylesheet["']/i.test(tag)) return tag;
      const hm = /href=["']([^"']+)["']/i.exec(tag);
      if (!hm) return tag;
      if (/^https?:\/\//i.test(hm[1])) return tag;
      const cleanCssHref = hm[1].split("#")[0].split("?")[0];
      const resolved = resolvePath(chapterDir, cleanCssHref);
      const cssFile = findZipFile(parsed.zip, resolved);
      if (!cssFile) return "";
      return `<style>${await cssFile.async("text")}</style>`;
    },
  );

  // 2. Inline images
  html = await replaceAsync(
    html,
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    async (full, before, src, after) => {
      if (/^data:|^https?:\/\//i.test(src)) return full;
      const cleanSrc = src.split("#")[0].split("?")[0];
      const resolved = resolvePath(chapterDir, cleanSrc);
      const imgFile = findZipFile(parsed.zip, resolved);
      if (!imgFile) return full;
      try {
        const b64 = await imgFile.async("base64");
        return `${before}data:${mimeForPath(resolved)};base64,${b64}${after}`;
      } catch {
        return full;
      }
    },
  );

  let modeStyles = "";
  if (readingMode === "continuous") {
    modeStyles = `
html { height: auto !important; min-height: 100% !important; }
body { max-width: 680px !important; margin: 0 auto !important; padding: 40px 28px 120px !important; overflow-y: visible !important; }`;
  } else if (readingMode === "single") {
    modeStyles = `
html { height: 100vh !important; overflow: hidden !important; }
body { height: calc(100vh - 40px) !important; max-width: 720px !important; margin: 20px auto !important; column-width: 656px !important; column-gap: 64px !important; overflow: hidden !important; }`;
  } else {
    modeStyles = `
html { height: 100vh !important; overflow: hidden !important; }
body { height: calc(100vh - 40px) !important; max-width: 1200px !important; margin: 20px auto !important; column-count: 2 !important; column-gap: 64px !important; overflow: hidden !important; }`;
  }

  const injected = `
<style id="foscl-reader-override">
html { background: ${palette.bg} !important; color: ${palette.text} !important; }
body { background: transparent !important; color: ${palette.text} !important; font-size: ${fontSize}px !important; line-height: 1.8 !important; font-family: Georgia, serif !important; }
${modeStyles}
a { color: ${palette.link} !important; }
img { max-width: 100% !important; height: auto !important; }
</style>`;

  return html.includes("</head>") ? html.replace("</head>", `${injected}</head>`) : injected + html;
}
