export * from "./types/index";

export type Book = {
  id: string;
  title: string;
  author: string;
  fileName: string;
  addedAt: number;
  lastOpenedAt?: number;
  progress?: { chapterIndex: number };
  coverDataUrl?: string;
  shelf?: string;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  bookId?: string;
  folder?: string;
  bookTitle?: string;
  bookPage?: number;
  bookChapter?: number;
};

export type EpubChapter = {
  id: string;
  href: string;
  title?: string;
};

export type TocItem = {
  id: string;
  title: string;
  href: string;
  chapterIndex: number;
  anchor?: string;
};

export type ReadingMode = "continuous" | "single" | "double";

export type AppTheme = "cream" | "night" | "sepia";
