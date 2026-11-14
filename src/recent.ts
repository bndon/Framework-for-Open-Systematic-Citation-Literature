import type { Book } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderRecentPage(
  books: Book[],
  onOpen: (book: Book) => void,
): void {
  const listEl = document.getElementById("recent-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const recent = books
    .filter((b) => b.lastOpenedAt !== undefined)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));

  if (recent.length === 0) {
    const p = document.createElement("p");
    p.className = "recent-empty";
    p.textContent =
      "No recently opened books yet. Open any book from your library to track reading history here.";
    listEl.append(p);
    return;
  }

  for (const book of recent) {
    const row = document.createElement("button");
    row.className = "recent-item";
    row.type = "button";

    const cover = document.createElement("div");
    cover.className = "recent-cover";
    cover.setAttribute("aria-hidden", "true");

    if (book.coverDataUrl) {
      const img = document.createElement("img");
      img.className = "recent-cover-img";
      img.src = book.coverDataUrl;
      img.alt = "";
      cover.append(img);
    } else {
      cover.textContent = book.title.charAt(0).toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "recent-item-info";

    const title = document.createElement("span");
    title.className = "recent-item-title";
    title.textContent = book.title;

    const author = document.createElement("span");
    author.className = "recent-item-author";
    author.textContent = book.author;

    const when = document.createElement("span");
    when.className = "recent-item-when";
    when.textContent = `Opened ${relativeTime(book.lastOpenedAt!)}`;

    info.append(title, author, when);

    const progress = document.createElement("span");
    progress.className = "recent-item-progress";
    if (book.progress) {
      progress.textContent = `Ch. ${book.progress.chapterIndex + 1}`;
    } else {
      progress.textContent = "Start";
    }

    row.append(cover, info, progress);
    row.addEventListener("click", () => onOpen(book));
    listEl.append(row);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const ms = Date.now() - ts;
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
