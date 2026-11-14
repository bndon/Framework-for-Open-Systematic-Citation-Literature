import React, { useState, useEffect } from "react";
import {
  searchOpenAlex,
  lookupDoi,
  getCollections,
  upsertPaper,
  addPaperToCollection,
  createCollection,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { Collection, PaperResult } from "../types";

export const Discover: React.FC = () => {
  const [mode, setMode] = useState<"search" | "doi">("search");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PaperResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionByPaper, setSelectedCollectionByPaper] = useState<Record<string, string>>({});
  const [expandedAbstracts, setExpandedAbstracts] = useState<Record<string, boolean>>({});

  // Inline collection creation states
  const [newCollName, setNewCollName] = useState("");
  const [creatingColl, setCreatingColl] = useState(false);
  const [paperNewCollName, setPaperNewCollName] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const list = await getCollections();
      setCollections(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    setLoading(true);
    setError(null);
    setCurrentPage(1);

    try {
      if (mode === "search") {
        const res = await searchOpenAlex(cleanQuery, 1);
        setResults(res);
        setHasMore(res.length >= 20);
        if (res.length === 0) {
          setError(`No papers found for "${cleanQuery}". Try broader keywords like "machine learning" or "computer vision".`);
        }
      } else {
        // Automatically sanitize DOI inputs (strip https://doi.org/, http://dx.doi.org/, doi:, etc.)
        let cleanDoi = cleanQuery
          .replace(/^https?:\/\/doi\.org\//i, "")
          .replace(/^https?:\/\/dx\.doi\.org\//i, "")
          .replace(/^doi:\s*/i, "")
          .trim();

        const res = await lookupDoi(cleanDoi);
        setResults([res]);
        setHasMore(false);
      }
    } catch (err: any) {
      setError(err?.toString() || "Failed to fetch data from OpenAlex. Check your network or try another search.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!query.trim() || mode !== "search" || loadingMore) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const res = await searchOpenAlex(query.trim(), nextPage);
      setResults((prev) => [...prev, ...res]);
      setCurrentPage(nextPage);
      setHasMore(res.length >= 20);
    } catch (err: any) {
      toast.error("Failed to load more results: " + err?.toString());
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreateTopCollection = async () => {
    if (!newCollName.trim() || creatingColl) return;
    setCreatingColl(true);
    try {
      const created = await createCollection(newCollName.trim());
      setNewCollName("");
      await loadCollections();
      toast.success(`Collection "${created.name}" created!`);
    } catch (err: any) {
      toast.error("Failed to create collection: " + err?.toString());
    } finally {
      setCreatingColl(false);
    }
  };

  const handleSaveToCollection = async (paper: PaperResult, overrideCollId?: string) => {
    const collId =
      overrideCollId ||
      selectedCollectionByPaper[paper.openalex_id] ||
      (collections[0]?.id ?? "");

    if (!collId) {
      toast.error("Please create a collection first!");
      return;
    }

    try {
      const savedPaper = await upsertPaper({
        openalex_id: paper.openalex_id,
        doi: paper.doi,
        title: paper.title,
        year: paper.year,
        venue: paper.venue,
        authors_json: JSON.stringify(paper.authors),
        abstract: paper.abstract,
        oa_url: paper.oa_url,
      });

      await addPaperToCollection(collId, savedPaper.id);
      const collName = collections.find((c) => c.id === collId)?.name || "collection";
      toast.success(`Saved "${paper.title.slice(0, 45)}..." to ${collName}!`);
    } catch (err: any) {
      toast.error("Error saving paper: " + err?.toString());
    }
  };

  const handleCreateAndSave = async (paper: PaperResult) => {
    const name = paperNewCollName[paper.openalex_id]?.trim();
    if (!name) return;
    try {
      const created = await createCollection(name);
      setPaperNewCollName((prev) => ({ ...prev, [paper.openalex_id]: "" }));
      await loadCollections();
      await handleSaveToCollection(paper, created.id);
    } catch (err: any) {
      toast.error("Error creating collection: " + err?.toString());
    }
  };

  const noCollections = collections.length === 0;

  return (
    <div style={{ padding: "28px 36px", maxWidth: "1000px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "26px", color: "#4A2418", marginBottom: "6px" }}>Discover Papers</h1>
        <p style={{ color: "#7A6458", fontSize: "14px", margin: 0 }}>
          Search millions of scholarly works from OpenAlex or lookup directly by DOI.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          onClick={() => {
            setMode("search");
            setQuery("");
            setError(null);
            setResults([]);
            setHasMore(false);
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid #D5C8B8",
            backgroundColor: mode === "search" ? "#8A5A7A" : "#FAF5EC",
            color: mode === "search" ? "#FAF5EC" : "#4A2418",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Keyword Search
        </button>
        <button
          onClick={() => {
            setMode("doi");
            setQuery("");
            setError(null);
            setResults([]);
            setHasMore(false);
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid #D5C8B8",
            backgroundColor: mode === "doi" ? "#8A5A7A" : "#FAF5EC",
            color: mode === "doi" ? "#FAF5EC" : "#4A2418",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          DOI Lookup
        </button>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "search"
              ? "e.g. network intrusion detection, transformer models..."
              : "e.g. 10.1145/3372297.3417884"
          }
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid #C4B5A5",
            fontSize: "14px",
            backgroundColor: "#fff",
            color: "#4A2418",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: "10px 22px",
            backgroundColor: "#8A5A7A",
            color: "#FAF5EC",
            border: "none",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading || !query.trim() ? 0.7 : 1,
          }}
        >
          {loading ? "Searching..." : mode === "search" ? "Search" : "Lookup"}
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#FDEDEC",
            color: "#C0392B",
            border: "1px solid #F5B7B1",
            borderRadius: "6px",
            marginBottom: "16px",
            fontSize: "13px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{ border: "none", background: "none", color: "#C0392B", cursor: "pointer", fontWeight: 700 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Inline Create Collection callout if user has 0 collections */}
      {noCollections && results.length > 0 && (
        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#FAF7F2",
            border: "1px solid #EADDCB",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#4A2418", marginBottom: "6px" }}>
            📁 You haven't created any collections yet
          </div>
          <p style={{ margin: "0 0 10px 0", fontSize: "12.5px", color: "#7A6458" }}>
            Create one here so you can save papers to it:
          </p>
          <div style={{ display: "flex", gap: "8px", maxWidth: "450px" }}>
            <input
              type="text"
              value={newCollName}
              onChange={(e) => setNewCollName(e.target.value)}
              placeholder="e.g. Literature Review, Key Papers..."
              style={{
                flex: 1,
                padding: "6px 10px",
                border: "1px solid #C4B5A5",
                borderRadius: "4px",
                fontSize: "13px",
              }}
            />
            <button
              type="button"
              onClick={handleCreateTopCollection}
              disabled={!newCollName.trim() || creatingColl}
              style={{
                padding: "6px 14px",
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
                border: "none",
                borderRadius: "4px",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {creatingColl ? "Creating..." : "+ Create Collection"}
            </button>
          </div>
        </div>
      )}

      {/* Results List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {results.map((paper) => {
          const isExpanded = expandedAbstracts[paper.openalex_id];
          const hasAbstract = Boolean(paper.abstract && paper.abstract.trim().length > 0);
          const abstractText = paper.abstract || "No abstract available.";

          return (
            <div
              key={paper.openalex_id}
              style={{
                backgroundColor: "#fff",
                border: "1px solid #E8DFD3",
                borderRadius: "8px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: "0 0 6px 0", fontSize: "17px", color: "#4A2418", lineHeight: 1.35 }}>
                    {paper.title}
                  </h3>
                  <div style={{ fontSize: "13px", color: "#7A6458", marginBottom: "8px" }}>
                    <span>{paper.authors && paper.authors.length > 0 ? paper.authors.join(", ") : "Unknown authors"}</span>
                    {paper.year && <span> • {paper.year}</span>}
                    {paper.venue && <span> • <em>{paper.venue}</em></span>}
                  </div>

                  {/* Metadata Tags */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                    {paper.doi && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "#F0EAE1",
                          color: "#6E4363",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: 500,
                        }}
                      >
                        DOI: {paper.doi}
                      </span>
                    )}
                    {paper.oa_url ? (
                      <a
                        href={paper.oa_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: "11px",
                          backgroundColor: "#E8F8F5",
                          color: "#16A085",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        🔓 Open Access PDF/HTML
                      </a>
                    ) : (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "#F5EEF8",
                          color: "#8E44AD",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        Paywalled
                      </span>
                    )}
                  </div>
                </div>

                {/* Save To Collection Selector or Quick-Create */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "200px", alignItems: "flex-end" }}>
                  {noCollections ? (
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <input
                        type="text"
                        placeholder="Collection name..."
                        value={paperNewCollName[paper.openalex_id] || ""}
                        onChange={(e) =>
                          setPaperNewCollName({
                            ...paperNewCollName,
                            [paper.openalex_id]: e.target.value,
                          })
                        }
                        style={{
                          padding: "6px 8px",
                          borderRadius: "4px",
                          border: "1px solid #D5C8B8",
                          fontSize: "12px",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateAndSave(paper)}
                        disabled={!paperNewCollName[paper.openalex_id]?.trim()}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#8A5A7A",
                          color: "#FAF5EC",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: !paperNewCollName[paper.openalex_id]?.trim() ? "not-allowed" : "pointer",
                          opacity: !paperNewCollName[paper.openalex_id]?.trim() ? 0.6 : 1,
                        }}
                      >
                        + Create & Save
                      </button>
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedCollectionByPaper[paper.openalex_id] || (collections[0]?.id ?? "")}
                        onChange={(e) =>
                          setSelectedCollectionByPaper({
                            ...selectedCollectionByPaper,
                            [paper.openalex_id]: e.target.value,
                          })
                        }
                        style={{
                          padding: "6px 8px",
                          borderRadius: "4px",
                          border: "1px solid #D5C8B8",
                          fontSize: "12px",
                          backgroundColor: "#FAF5EC",
                          color: "#4A2418",
                          width: "100%",
                        }}
                      >
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSaveToCollection(paper)}
                        style={{
                          padding: "6px 14px",
                          backgroundColor: "#6E4363",
                          color: "#FAF5EC",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          width: "100%",
                        }}
                      >
                        + Save to Collection
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Abstract */}
              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#55463E",
                  lineHeight: 1.5,
                  backgroundColor: "#FAF7F2",
                  padding: "10px 12px",
                  borderRadius: "4px",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "11px",
                    textTransform: "uppercase",
                    color: "#8A5A7A",
                    marginBottom: "4px",
                  }}
                >
                  Abstract
                </div>
                <div>
                  {hasAbstract ? (
                    isExpanded || abstractText.length <= 260 ? (
                      abstractText
                    ) : (
                      <>
                        {abstractText.slice(0, 260)}...
                        <button
                          onClick={() => setExpandedAbstracts({ ...expandedAbstracts, [paper.openalex_id]: true })}
                          style={{
                            border: "none",
                            background: "none",
                            color: "#8A5A7A",
                            cursor: "pointer",
                            fontWeight: 600,
                            paddingLeft: "6px",
                          }}
                        >
                          Show more
                        </button>
                      </>
                    )
                  ) : (
                    <em style={{ color: "#9E8B7F" }}>Not available in OpenAlex metadata</em>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Load More Button */}
      {hasMore && mode === "search" && (
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: "10px 24px",
              backgroundColor: "#FAF5EC",
              border: "1px solid #8A5A7A",
              color: "#8A5A7A",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loadingMore ? "wait" : "pointer",
            }}
          >
            {loadingMore ? "Loading more papers..." : "Load More Results ↓"}
          </button>
        </div>
      )}
    </div>
  );
};
