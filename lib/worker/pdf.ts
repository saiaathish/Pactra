/**
 * PDF/DOCX/TXT text extraction for brief parsing (replaces pypdf in the
 * Python worker). PDFs use pdfjs-dist's legacy Node build; DOCX uses
 * adm-zip + a minimal word/document.xml strip; TXT is read as-is.
 */

import "./pdf-polyfills"; // MUST run before pdfjs evaluates (DOMMatrix/Path2D)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import AdmZip from "adm-zip";
import type { BriefPage } from "./briefParser";

async function pdfPages(buffer: Buffer): Promise<BriefPage[]> {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  try {
    const pages: BriefPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) pages.push({ page: i, text });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

function docxText(buffer: Buffer): BriefPage[] {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("DOCX is missing word/document.xml");
  const xml = entry.getData().toString("utf8");
  // Pull text from <w:t> runs; keep paragraph boundaries as spaces.
  const text = xml
    .replace(/<w:p[ >]/g, "\n")
    .replace(/<w:tab[ /]/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? [{ page: 1, text }] : [];
}

/** Returns [{page, text}] per page/section. */
export async function loadPdfText(buffer: Buffer, ext: string): Promise<BriefPage[]> {
  if (ext === "pdf") return pdfPages(buffer);
  if (ext === "docx") return docxText(buffer);
  if (ext === "txt" || ext === "text" || ext === "md") {
    const text = buffer.toString("utf8").trim();
    return text ? [{ page: 1, text }] : [];
  }
  throw new Error(`Unsupported brief format: ${ext || "unknown"} — use PDF, DOCX, or TXT`);
}
