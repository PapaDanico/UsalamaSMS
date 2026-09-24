/* =====================================================================
   MANUAL TEXT EXTRACTION — PDF and Word, on the server.

   The analysis itself (outline, Annex 19 mentions, ERP contacts) is in
   packages/shared/src/manual.ts and is pure. This file only turns bytes
   into per-page text, because the two libraries it needs are server
   dependencies and must never reach the browser bundle.

   unpdf is a serverless build of Mozilla's pdf.js — no native binary, no
   canvas — so it runs inside a Netlify Function as it runs here. mammoth
   reads the text of a .docx; Word has no pages until it is laid out, so a
   Word manual is split on its own page breaks where it has them and is
   one "page" otherwise, and the screen says so.

   A MANUAL THAT CANNOT BE READ IS STILL STORED. Extraction failing is a
   fact about the parser, not about the document: the approved revision is
   held, hashed and served exactly as uploaded, and the analysis says it
   could not read the text rather than pretending the manual is empty.
   ===================================================================== */
import {
  analyseManual,
  DOCX_TYPE,
  PDF_TYPE,
  MANUAL_PARSER_VERSION,
  type ManualAnalysis,
  type ManualKind,
} from "../../../packages/shared/src/manual";

/** Stored text is bounded; the file itself is always kept whole. */
const TEXT_CAP = 2_000_000;

export interface ParsedManual {
  pages: string[];
  pageCount: number;
  analysis: ManualAnalysis & { error?: string };
  text: string;
  parserVersion: string;
}

export async function extractPages(buf: Buffer, type: string): Promise<string[]> {
  if (type === PDF_TYPE) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return Array.isArray(text) ? text : [String(text)];
  }
  if (type === DOCX_TYPE) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    // Form feeds are where Word's explicit page breaks land in raw text.
    const parts = value.split("\f").map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts : [value];
  }
  throw new Error(`no parser for ${type}`);
}

export async function parseManual(buf: Buffer, type: string, kind: ManualKind): Promise<ParsedManual> {
  try {
    const pages = await extractPages(buf, type);
    const text = pages.join("\n\f\n").slice(0, TEXT_CAP);
    return {
      pages,
      pageCount: pages.length,
      analysis: analyseManual(kind, pages),
      text,
      parserVersion: MANUAL_PARSER_VERSION,
    };
  } catch {
    return {
      pages: [],
      pageCount: 0,
      analysis: {
        outline: [],
        noText: true,
        error: "The text of this file could not be read. The manual itself is stored unchanged.",
      },
      text: "",
      parserVersion: MANUAL_PARSER_VERSION,
    };
  }
}
