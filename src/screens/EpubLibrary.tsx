import React, { useState, useEffect } from "react";
import { loadBooks, saveBooks } from "../bookStorage";
import { saveEpub, loadEpub, deleteEpub } from "../db";
import { parseEpub, importEpubFile, loadFullBookHtml } from "../epub";
import type { Book } from "../types";

export const EpubLibrary: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [bookHtml, setBookHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setBooks(loadBooks());
  }, []);

  const handleImportEpub = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { book, data } = await importEpubFile(file);
      await saveEpub(book.id, data);
      const updated = [book, ...books];
      setBooks(updated);
      saveBooks(updated);
    } catch (err: any) {
      alert("Failed to parse EPUB: " + err?.toString());
    }
  };

  const handleOpenBook = async (b: Book) => {
    setLoading(true);
    setReadingBook(b);
    try {
      const data = await loadEpub(b.id);
      if (!data) throw new Error("EPUB file data not found in local IndexedDB storage.");
      const parsed = await parseEpub(data);
      const html = await loadFullBookHtml(parsed, "cream", 17, "continuous");
      setBookHtml(html);
    } catch (err: any) {
      alert(err?.toString());
      setReadingBook(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBook = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}" from EPUB library?`)) return;
    await deleteEpub(id);
    const updated = books.filter((b) => b.id !== id);
    setBooks(updated);
    saveBooks(updated);
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: "900px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", color: "var(--text-main)", margin: "0 0 6px 0" }}>Library reader (EPUB)</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            Classic FOSCL local EPUB book archive with IndexedDB storage.
          </p>
        </div>

        <div>
          <input
            id="epub-upload"
            type="file"
            accept=".epub"
            onChange={handleImportEpub}
            style={{ display: "none" }}
          />
          <button
            onClick={() => document.getElementById("epub-upload")?.click()}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            + Import EPUB Book
          </button>
        </div>
      </header>

      {readingBook ? (
        <div style={{ backgroundColor: "var(--panel-dark)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "18px", color: "var(--text-main)", margin: 0 }}>{readingBook.title}</h2>
            <button
              onClick={() => setReadingBook(null)}
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "4px", backgroundColor: "var(--panel-dark)", cursor: "pointer", fontWeight: 600 }}
            >
              ← Back to Bookshelf
            </button>
          </div>

          {loading ? (
            <div>Loading book contents...</div>
          ) : (
            <iframe
              srcDoc={bookHtml || ""}
              style={{
                width: "100%",
                height: "70vh",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                backgroundColor: "var(--panel-dark)",
              }}
              title={readingBook.title}
            />
          )}
        </div>
      ) : (
        <div>
          {books.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", backgroundColor: "var(--panel-dark)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>📖</div>
              <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)" }}>No EPUB books in archive</h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
                Import any standard .epub file to read with the built-in reader.
              </p>
              <button
                onClick={() => document.getElementById("epub-upload")?.click()}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "var(--accent)",
                  color: "var(--on-accent)",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Choose EPUB File
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
              {books.map((b) => (
                <div
                  key={b.id}
                  style={{
                    backgroundColor: "var(--panel-dark)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "var(--text-main)" }}>{b.title}</h3>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                      Author: {b.author || "Unknown"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => handleOpenBook(b)}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "var(--accent)",
                        color: "var(--on-accent)",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Read
                    </button>
                    <button
                      onClick={() => handleDeleteBook(b.id, b.title)}
                      style={{
                        padding: "6px 8px",
                        backgroundColor: "color-mix(in srgb, var(--danger-ink) 13%, var(--panel-dark))",
                        color: "var(--danger-ink)",
                        border: "1px solid color-mix(in srgb, var(--danger-ink) 35%, var(--panel-dark))",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
