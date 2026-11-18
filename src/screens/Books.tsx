import React from "react";
import { useSearchParams } from "react-router-dom";
import { EpubLibrary } from "./EpubLibrary";
import { PdfShelf } from "./PdfShelf";

/** The Books screen: one shelf for EPUB books, one for PDF papers. */
export const Books: React.FC = () => {
  const [params] = useSearchParams();
  return params.get("tab") === "pdf" ? <PdfShelf /> : <EpubLibrary />;
};
