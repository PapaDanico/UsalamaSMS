/* =====================================================================
   APPROVED MANUALS — what an operator uploads, and what the parser may
   say about it.

   THE PARSER READS; IT DOES NOT JUDGE. An SMS manual that mentions
   "hazard identification" has a heading about it. Whether the process
   under that heading is adequate is the safety manager's and the
   regulator's question, and a product that turned keyword hits into
   "compliant" would be selling the same overstatement /coverage exists
   to refuse. So every result below is phrased as MENTIONED or NOT FOUND,
   with the page it was found on, so a reader can check the parser
   against the manual in a minute.

   Pure functions over text. Extraction from PDF and Word lives in the
   API (apps/api/src/manual-parse.ts), because the libraries are server
   dependencies and this module is shared with the browser.
   ===================================================================== */
import { SMS_ELEMENTS } from "./maturity";

export const MANUAL_KINDS = Object.freeze([
  { id: "SMS_MANUAL", label: "SMS manual" },
  { id: "ERP", label: "Emergency response plan" },
  { id: "OPERATIONS_MANUAL", label: "Operations manual" },
  { id: "OTHER", label: "Other approved manual" },
] as const);
export type ManualKind = (typeof MANUAL_KINDS)[number]["id"];
export const isManualKind = (k: unknown): k is ManualKind =>
  typeof k === "string" && MANUAL_KINDS.some((m) => m.id === k);

export const PDF_TYPE = "application/pdf";
export const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MANUAL_TYPES: ReadonlyArray<string> = Object.freeze([PDF_TYPE, DOCX_TYPE]);

/** A whole manual. Large enough for a scanned-free 300-page PDF. */
export const MANUAL_MAX_BYTES = 25 * 1024 * 1024;
/**
 * One piece of it. Netlify refuses a function request body above about
 * six megabytes; two megabytes of file is under three as base64, which
 * leaves room on a slow link for the request to finish.
 */
export const MANUAL_CHUNK_BYTES = 2 * 1024 * 1024;
export const MANUAL_MAX_CHUNKS = Math.ceil(MANUAL_MAX_BYTES / MANUAL_CHUNK_BYTES);
/** An abandoned upload is deleted after this long. */
export const MANUAL_UPLOAD_TTL_MS = 60 * 60 * 1000;
/** Bump when the analysis below changes, so old results are identifiable. */
export const MANUAL_PARSER_VERSION = "1";

export type ManualCheck =
  | { ok: true; type: string }
  | { ok: false; message: string };

/**
 * The declared type must match what the bytes are. A PDF begins "%PDF-";
 * a DOCX is a ZIP ("PK\x03\x04") holding word/document.xml. Anything
 * else is refused, whatever its name says.
 */
export function checkManual(declared: unknown, head: Uint8Array, bytes: number): ManualCheck {
  if (typeof declared !== "string" || !MANUAL_TYPES.includes(declared)) {
    return {
      ok: false,
      message:
        "Manuals are accepted as PDF or Word (.docx). Export the approved revision to one " +
        "of those and upload that.",
    };
  }
  if (!Number.isInteger(bytes) || bytes <= 0) {
    return { ok: false, message: "That file is empty." };
  }
  if (bytes > MANUAL_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(bytes / 1048576).toFixed(1)} MB; manuals are held up to ${
        MANUAL_MAX_BYTES / 1048576
      } MB. A PDF exported with "reduce file size" is usually well under that.`,
    };
  }
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (declared === PDF_TYPE && !starts([0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { ok: false, message: "That file says it is a PDF but is not one." };
  }
  if (declared === DOCX_TYPE && !starts([0x50, 0x4b, 0x03, 0x04])) {
    return { ok: false, message: "That file says it is a Word document but is not one." };
  }
  return { ok: true, type: declared };
}

/* ---------------------------------------------------------------------
   OUTLINE. Headings found in the text, in order, with their page.

   Manuals number their sections ("3.2 Hazard identification"), or name
   them ("CHAPTER 4 — EMERGENCY RESPONSE", "Section 2: ..."). A line that
   looks like either, and is short enough to be a heading rather than a
   sentence, is taken as one. Table-of-contents lines with dot leaders
   and a trailing page number are skipped, or the outline would list
   every heading twice.
   --------------------------------------------------------------------- */
export interface OutlineEntry {
  readonly number: string | null;
  readonly title: string;
  readonly page: number;
}

const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][^\n]{2,90})$/;
const NAMED = /^(chapter|section|part|appendix|annex)\s+([0-9IVXLC]+|[A-Z])\b[\s.:\-–—]*([^\n]{0,90})$/i;
const TOC_LINE = /(\.{3,}|\s{2,}\d{1,4}\s*$|\t\d{1,4}\s*$)/;

export function outline(pages: ReadonlyArray<string>, max = 200): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const seen = new Set<string>();
  pages.forEach((text, i) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line.length < 4 || line.length > 100 || TOC_LINE.test(raw)) continue;
      let entry: OutlineEntry | null = null;
      const n = line.match(NUMBERED);
      if (n && !/[.;,]$/.test(line) && (n[2] ?? "").split(" ").length <= 12) {
        entry = { number: n[1] ?? null, title: (n[2] ?? "").trim(), page: i + 1 };
      } else {
        const m = line.match(NAMED);
        if (m) {
          const title = (m[3] || "").trim();
          entry = { number: `${cap(m[1] ?? "")} ${m[2] ?? ""}`, title: title || cap(m[1] ?? ""), page: i + 1 };
        }
      }
      if (!entry) continue;
      const key = `${entry.number}|${entry.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
      if (out.length >= max) return;
    }
  });
  return out;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/* ---------------------------------------------------------------------
   SMS MANUAL — which of Annex 19's twelve elements the text MENTIONS.

   Each element has the phrases an SMS manual uses for it. The first page
   any of them appears on is reported with a short excerpt, so the reader
   can see what the parser saw. The element names come from SMS_ELEMENTS,
   the registry the coverage and maturity screens use, so the numbering
   cannot drift from the rest of the product.
   --------------------------------------------------------------------- */
const ELEMENT_TERMS: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  "1.1": ["safety policy", "safety objectives", "management commitment"],
  "1.2": ["accountable executive", "safety accountabilities", "safety responsibilities"],
  "1.3": ["safety manager", "key safety personnel", "safety review board", "safety action group"],
  "1.4": ["emergency response plan", "emergency response planning", "erp"],
  "1.5": ["sms documentation", "sms manual", "document control", "safety management system manual"],
  "2.1": ["hazard identification", "hazard reporting", "safety reporting", "occurrence reporting"],
  "2.2": ["risk assessment", "risk mitigation", "risk matrix", "tolerability", "safety risk management"],
  "3.1": ["safety performance indicator", "safety performance monitoring", "spi", "alert level", "target level"],
  "3.2": ["management of change", "change management"],
  "3.3": ["continuous improvement", "internal audit", "safety audit", "corrective action"],
  "4.1": ["safety training", "training and education", "sms training", "recurrent training"],
  "4.2": ["safety communication", "safety bulletin", "safety promotion"],
});

export interface ElementMention {
  readonly id: string;
  readonly name: string;
  readonly found: boolean;
  readonly page: number | null;
  readonly term: string | null;
  readonly excerpt: string | null;
}

/* A contents-page line points at a section; it is not a mention of the
   subject. Without this every manual "mentions" every chapter it lists
   on page 2, and the page reported is the contents page. */
const withoutContents = (p: string) =>
  p.split(/\r?\n/).filter((l) => !TOC_LINE.test(l)).join("\n");

export function smsCoverage(pages: ReadonlyArray<string>): ElementMention[] {
  pages = pages.map(withoutContents);
  const lower = pages.map((p) => p.toLowerCase());
  return SMS_ELEMENTS.map((el) => {
    const terms = ELEMENT_TERMS[el.id] ?? [];
    for (let i = 0; i < lower.length; i++) {
      for (const term of terms) {
        const at = findWord(lower[i] ?? "", term);
        if (at >= 0) {
          return {
            id: el.id, name: el.name, found: true, page: i + 1, term,
            excerpt: excerpt(pages[i] ?? "", at, term.length),
          };
        }
      }
    }
    return { id: el.id, name: el.name, found: false, page: null, term: null, excerpt: null };
  });
}

/** Whole-word match, so "erp" does not match "interpret". */
function findWord(hay: string, needle: string): number {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return -1;
    const before = at === 0 ? " " : (hay[at - 1] ?? " ");
    const after = hay[at + needle.length] ?? " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return at;
    from = at + 1;
  }
}

function excerpt(text: string, at: number, len: number): string {
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + len + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() +
    (end < text.length ? "…" : "");
}

/* ---------------------------------------------------------------------
   ERP — the contacts and the named roles an emergency plan has to hold.

   An ERP is judged in the first ten minutes by whether somebody can find
   the number to call. So the parser lists every telephone number and
   email address it finds, with the line it sits on, and says which of
   the parties an East African operator's plan is expected to name it
   found a mention of. A party NOT found is the useful result: it is the
   gap to check before the plan is needed.
   --------------------------------------------------------------------- */
export interface ErpContact {
  readonly kind: "phone" | "email";
  readonly value: string;
  readonly context: string;
  readonly page: number;
}
export interface ErpParty {
  readonly party: string;
  readonly found: boolean;
  readonly page: number | null;
}

const ERP_PARTIES: ReadonlyArray<{ party: string; terms: string[] }> = [
  { party: "Accountable executive", terms: ["accountable executive"] },
  { party: "Emergency coordinator / crisis manager", terms: ["emergency coordinator", "crisis manager", "emergency response manager", "crisis management"] },
  { party: "Air traffic services", terms: ["air traffic", "atc", "tower"] },
  { party: "Airport rescue and firefighting", terms: ["rescue and fire", "arff", "fire service", "firefighting"] },
  { party: "Accident investigation authority", terms: ["aaid", "accident investigation", "investigation department"] },
  { party: "Civil aviation authority", terms: ["kcaa", "civil aviation authority", "caa"] },
  { party: "Police", terms: ["police"] },
  { party: "Hospital / medical", terms: ["hospital", "medical", "ambulance"] },
  { party: "Next of kin / family assistance", terms: ["next of kin", "family assistance", "relatives"] },
  { party: "Media / public relations", terms: ["media", "press", "public relations"] },
  { party: "Insurer", terms: ["insurer", "insurance", "underwriter"] },
];

const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)\d{3,4}[\s-]?\d{3,4}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function erpContacts(pages: ReadonlyArray<string>, max = 150): {
  contacts: ErpContact[];
  parties: ErpParty[];
} {
  const contacts: ErpContact[] = [];
  const seen = new Set<string>();
  pages.forEach((text, i) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      for (const m of line.match(EMAIL) ?? []) push("email", m, line, i);
      for (const m of line.match(PHONE) ?? []) {
        const digits = m.replace(/\D/g, "");
        // A phone number has 9 to 13 digits; years, page ranges and
        // section numbers do not, and dates look like 2026-09-24.
        if (digits.length < 9 || digits.length > 13) continue;
        if (/\b(19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(m)) continue;
        push("phone", m.trim(), line, i);
      }
    }
  });
  function push(kind: "phone" | "email", value: string, line: string, i: number) {
    const key = kind + value.replace(/\D/g, "") + (kind === "email" ? value.toLowerCase() : "");
    if (seen.has(key) || contacts.length >= max) return;
    seen.add(key);
    contacts.push({ kind, value, context: line.slice(0, 160), page: i + 1 });
  }
  const lower = pages.map((p) => p.toLowerCase());
  const parties = ERP_PARTIES.map(({ party, terms }) => {
    for (let i = 0; i < lower.length; i++) {
      if (terms.some((t) => findWord(lower[i] ?? "", t) >= 0)) return { party, found: true, page: i + 1 };
    }
    return { party, found: false, page: null };
  });
  return { contacts, parties };
}

/** Everything the parser says about one manual, stored as JSON. */
export interface ManualAnalysis {
  readonly outline: OutlineEntry[];
  readonly sms?: ElementMention[];
  readonly erp?: { contacts: ErpContact[]; parties: ErpParty[] };
  /** True when there was no text layer — a scanned manual. */
  readonly noText: boolean;
}

export function analyseManual(kind: ManualKind, pages: ReadonlyArray<string>): ManualAnalysis {
  const chars = pages.reduce((n, p) => n + p.trim().length, 0);
  const noText = chars < 40 * Math.max(1, pages.length) && chars < 400;
  const base = { outline: outline(pages), noText };
  if (kind === "SMS_MANUAL") return { ...base, sms: smsCoverage(pages) };
  if (kind === "ERP") return { ...base, erp: erpContacts(pages) };
  return base;
}

/* =====================================================================
   SEARCH INSIDE A MANUAL.

   "Where does our ERP say who calls the next of kin?" is a question
   asked during an event, against a manual nobody has open. The text is
   already stored per page (form feeds between them), so the answer is
   the page and the sentence around the words, not a relevance score.

   EVERY word must appear on the page. A page carrying "fuel" in one
   chapter and "spill" in another is not an answer to "fuel spill", and
   a search that pretends it is sends somebody to the wrong page at the
   worst possible moment. Words under two letters are dropped; nothing
   else is interpreted, so a query means what it says.
   ===================================================================== */
export const SEARCH_MAX_TERMS = 8;

export interface SearchHit {
  page: number;
  snippet: string;
}

export function searchTerms(query: unknown): string[] {
  if (typeof query !== "string") return [];
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, SEARCH_MAX_TERMS);
}

export function searchManual(text: string, terms: ReadonlyArray<string>, max = 10): SearchHit[] {
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  const pages = text.split("\f");
  for (let i = 0; i < pages.length && hits.length < max; i++) {
    const page = (pages[i] ?? "").replace(/\s+/g, " ").trim();
    const lower = page.toLowerCase();
    if (!terms.every((t) => lower.includes(t))) continue;
    const at = lower.indexOf(terms[0] ?? "");
    const from = Math.max(0, at - 90);
    const to = Math.min(page.length, at + (terms[0]?.length ?? 0) + 110);
    hits.push({
      page: i + 1,
      snippet: `${from > 0 ? "…" : ""}${page.slice(from, to)}${to < page.length ? "…" : ""}`,
    });
  }
  return hits;
}
