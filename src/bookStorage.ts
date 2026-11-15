import type { Book, Note } from "./types";

const BOOKS_KEY = "foscl:library";
const NOTES_KEY = "foscl:notes";
const SHELVES_KEY = "foscl:shelves";
const NOTE_FOLDERS_KEY = "foscl:noteFolders";

const DEFAULT_SHELVES = ["All", "Favorites", "Currently Reading", "To Read"];
const DEFAULT_NOTE_FOLDERS = ["All", "General", "Book Notes", "Ideas"];

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, items: unknown[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

export const loadBooks = (): Book[] => load<Book>(BOOKS_KEY);
export const saveBooks = (books: Book[]): void => save(BOOKS_KEY, books);

export const loadNotes = (): Note[] => load<Note>(NOTES_KEY);
export const saveNotes = (notes: Note[]): void => save(NOTES_KEY, notes);

export function loadShelves(): string[] {
  const loaded = load<string>(SHELVES_KEY);
  if (!loaded.length) {
    saveShelves(DEFAULT_SHELVES);
    return DEFAULT_SHELVES;
  }
  return loaded;
}

export const saveShelves = (shelves: string[]): void =>
  save(SHELVES_KEY, shelves);

export function loadNoteFolders(): string[] {
  const loaded = load<string>(NOTE_FOLDERS_KEY);
  if (!loaded.length) {
    saveNoteFolders(DEFAULT_NOTE_FOLDERS);
    return DEFAULT_NOTE_FOLDERS;
  }
  return loaded;
}

export const saveNoteFolders = (folders: string[]): void =>
  save(NOTE_FOLDERS_KEY, folders);
