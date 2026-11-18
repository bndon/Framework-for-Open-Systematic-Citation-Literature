import { open } from "@tauri-apps/plugin-dialog";
import { createBackup, inspectBackup, readFileBytes, restoreBackup, writeExportFile } from "./api";
import { loadBooks } from "../bookStorage";
import { loadEpub, saveEpub } from "../db";
import type { BackupInfo, RestoreResult } from "../types";

const LAST_KEY = "foscl:last_backup";
const SKIP_KEYS = [LAST_KEY];

export interface LastBackup {
  at: string;
  path: string;
  papers: number;
  pdfs: number;
  epubs: number;
}

export function loadLastBackup(): LastBackup | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || "null");
  } catch {
    return null;
  }
}

/** Everything the app keeps in the webview: theme, settings, book shelf, EPUB highlights, reading positions. */
export function collectAppState(): string {
  const state: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("foscl:") && !SKIP_KEYS.includes(k)) state[k] = localStorage.getItem(k) ?? "";
    }
  } catch {}
  return JSON.stringify(state);
}

export function applyAppState(json: string): number {
  let n = 0;
  try {
    const state = JSON.parse(json) as Record<string, string>;
    for (const [k, v] of Object.entries(state)) {
      if (k.startsWith("foscl:") && !SKIP_KEYS.includes(k) && typeof v === "string") {
        localStorage.setItem(k, v);
        n++;
      }
    }
  } catch {}
  return n;
}

export async function pickFolder(title: string): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title });
  return typeof dir === "string" ? dir : null;
}

/** Choose a folder, then write the database, PDFs, books and settings into a new backup folder inside it. */
export async function runBackup(onStep?: (text: string) => void): Promise<BackupInfo | null> {
  const dir = await pickFolder("Choose where to save the backup");
  if (!dir) return null;
  onStep?.("Copying the database and PDFs…");
  const info = await createBackup(dir, collectAppState());

  const books = loadBooks();
  let epubs = 0;
  for (let i = 0; i < books.length; i++) {
    onStep?.(`Copying books ${i + 1} of ${books.length}…`);
    try {
      const data = await loadEpub(books[i].id);
      if (data) {
        await writeExportFile(`${info.path}/epubs/${books[i].id}.epub`, new Uint8Array(data));
        epubs++;
      }
    } catch {
      // one unreadable book should not fail the whole backup
    }
  }
  const done = { ...info, epubs };
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ at: new Date().toISOString(), path: info.path, papers: info.papers, pdfs: info.pdfs, epubs }));
  } catch {}
  return done;
}

export const inspect = (dir: string) => inspectBackup(dir);

/** Restore a backup folder. Returns what was restored; the page should be reloaded afterwards. */
export async function runRestore(dir: string, onStep?: (text: string) => void): Promise<RestoreResult & { settings: number; books: number }> {
  onStep?.("Restoring the database and PDFs…");
  const res = await restoreBackup(dir);
  const settings = res.app_state ? applyAppState(res.app_state) : 0;
  let books = 0;
  for (let i = 0; i < res.epub_ids.length; i++) {
    onStep?.(`Restoring books ${i + 1} of ${res.epub_ids.length}…`);
    try {
      const bytes = await readFileBytes(`${dir}/epubs/${res.epub_ids[i]}.epub`);
      await saveEpub(res.epub_ids[i], bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      books++;
    } catch {}
  }
  return { ...res, settings, books };
}
