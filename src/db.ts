/**
 * IndexedDB wrapper for storing raw EPUB file content.
 * Book metadata lives in localStorage (fast to read on startup);
 * binary EPUB data lives here (can be several MB per book).
 */

const DB_NAME = "foscl-db";
const DB_VERSION = 1;
const EPUB_STORE = "epubs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(EPUB_STORE)) {
        req.result.createObjectStore(EPUB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function saveEpub(id: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EPUB_STORE, "readwrite");
    tx.objectStore(EPUB_STORE).put(data, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadEpub(id: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EPUB_STORE, "readonly");
    const req = tx.objectStore(EPUB_STORE).get(id);
    req.onsuccess = () =>
      resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEpub(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EPUB_STORE, "readwrite");
    tx.objectStore(EPUB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
