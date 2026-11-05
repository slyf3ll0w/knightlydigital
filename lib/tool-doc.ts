import { computeQuoteTotals } from "@/lib/quote-totals";

/**
 * The document the free invoice / estimate generator (/tools/*) edits.
 * Client-safe (no Prisma): the browser builds it, /api/public/tools/pdf
 * renders it with the real WorkBench PDF builder, and lib/tool-drafts.ts
 * turns a stored copy into a real Invoice or Quote when the visitor signs
 * up. Money is plain dollars; `taxRate` is a percent (8.25), unlike the
 * app's stored fraction. Every field has a length cap so the same shape
 * is safe to accept from a stranger.
 */

export type ToolKind = "invoice" | "estimate";

export type ToolParty = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export type ToolLine = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Estimates only: the client can leave this line off. */
  optional: boolean;
};

export type DiscountType = "NONE" | "PERCENT" | "FIXED";
export type DepositType = "NONE" | "PERCENT" | "FIXED";

export type ToolDoc = {
  kind: ToolKind;
  business: ToolParty;
  client: ToolParty;
  number: number;
  /** YYYY-MM-DD */
  issuedAt: string;
  /** Invoice: due date. Estimate: valid-until date. YYYY-MM-DD or "". */
  dueAt: string;
  lines: ToolLine[];
  /** Percent, e.g. 8.25. */
  taxRate: number;
  discountType: DiscountType;
  discountValue: number;
  depositType: DepositType;
  depositValue: number;
  /** Printed on the document for the client. */
  clientMessage: string;
  /** Hex accent for the header and totals. */
  accent: string;
};

export const MAX_LINES = 40;
export const MAX_LOGO_BYTES = 400_000;
export const DEFAULT_ACCENT = "#0B57D8";

const TEXT_LIMITS = { short: 120, line: 160, message: 1_000 } as const;

export function emptyParty(): ToolParty {
  return { name: "", email: "", phone: "", address: "", city: "", state: "", zip: "" };
}

export function newLineId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newLine(partial: Partial<Omit<ToolLine, "id">> = {}): ToolLine {
  return { id: newLineId(), name: "", description: "", quantity: 1, unitPrice: 0, optional: false, ...partial };
}

export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

export function emptyDoc(kind: ToolKind): ToolDoc {
  const issuedAt = todayIso();
  return {
    kind,
    business: emptyParty(),
    client: emptyParty(),
    number: kind === "invoice" ? 1001 : 101,
    issuedAt,
    dueAt: addDaysIso(issuedAt, kind === "invoice" ? 14 : 30),
    lines: [newLine()],
    taxRate: 0,
    discountType: "NONE",
    discountValue: 0,
    depositType: "NONE",
    depositValue: 0,
    clientMessage: kind === "invoice" ? "Thank you for your business." : "Thanks for the opportunity. This estimate is good through the date above.",
    accent: DEFAULT_ACCENT,
  };
}

export function lineTotal(l: ToolLine): number {
  return Math.round(Math.max(0, l.quantity) * Math.max(0, l.unitPrice) * 100) / 100;
}

export type ToolTotals = {
  subtotal: number;
  discount: number;
  tax: number | null;
  total: number;
  deposit: number;
};

/** Same math as the app (lib/quote-totals.ts), so the PDF and the app agree to the cent. */
export function docTotals(doc: ToolDoc): ToolTotals {
  // Optional lines count toward the total (the app does the same until the client opts out).
  const subtotal = doc.lines.reduce((s, l) => s + lineTotal(l), 0);
  const { discount, tax, total } = computeQuoteTotals({
    subtotal: Math.round(subtotal * 100) / 100,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    taxRate: doc.taxRate ? doc.taxRate / 100 : null,
  });
  const deposit =
    doc.depositType === "PERCENT"
      ? Math.round(total * Math.min(Math.max(doc.depositValue, 0), 100)) / 100
      : doc.depositType === "FIXED"
        ? Math.min(Math.max(doc.depositValue, 0), total)
        : 0;
  return { subtotal: Math.round(subtotal * 100) / 100, discount, tax, total: Math.round(total * 100) / 100, deposit };
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "Lynne Carver" → first/last the way the app stores a Contact. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

// ── Validation (server side; also used to load a saved draft in the browser) ──

function s(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";
}

function n(v: unknown, min: number, max: number, fallback = 0): number {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(x, min), max);
}

function party(v: unknown): ToolParty {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    name: s(o.name, TEXT_LIMITS.short),
    email: s(o.email, TEXT_LIMITS.short),
    phone: s(o.phone, 40),
    address: s(o.address, TEXT_LIMITS.short),
    city: s(o.city, 80),
    state: s(o.state, 40),
    zip: s(o.zip, 20),
  };
}

function isoDate(v: unknown): string {
  const str = s(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(new Date(str + "T00:00:00").getTime()) ? str : "";
}

/** Accepts anything (a request body, localStorage) and returns a safe ToolDoc, or null when it is not a document at all. */
export function sanitizeToolDoc(input: unknown): ToolDoc | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const kind: ToolKind = o.kind === "estimate" ? "estimate" : "invoice";
  const base = emptyDoc(kind);
  const rawLines = Array.isArray(o.lines) ? o.lines.slice(0, MAX_LINES) : [];
  const lines: ToolLine[] = rawLines
    .map((l) => {
      const x = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      return {
        id: s(x.id, 16) || newLineId(),
        name: s(x.name, TEXT_LIMITS.line),
        description: s(x.description, TEXT_LIMITS.message),
        quantity: n(x.quantity, 0, 100_000, 1),
        unitPrice: n(x.unitPrice, 0, 10_000_000, 0),
        optional: kind === "estimate" && x.optional === true,
      };
    })
    .filter((l) => l.name || l.description || l.unitPrice);
  const discountType: DiscountType = o.discountType === "PERCENT" || o.discountType === "FIXED" ? o.discountType : "NONE";
  const depositType: DepositType = kind === "estimate" && (o.depositType === "PERCENT" || o.depositType === "FIXED") ? o.depositType : "NONE";
  const accent = s(o.accent, 7);
  return {
    kind,
    business: party(o.business),
    client: party(o.client),
    number: Math.round(n(o.number, 1, 99_999_999, base.number)),
    issuedAt: isoDate(o.issuedAt) || base.issuedAt,
    dueAt: isoDate(o.dueAt),
    lines: lines.length ? lines : [newLine()],
    taxRate: n(o.taxRate, 0, 30, 0),
    discountType,
    discountValue: discountType === "PERCENT" ? n(o.discountValue, 0, 100) : discountType === "FIXED" ? n(o.discountValue, 0, 10_000_000) : 0,
    depositType,
    depositValue: depositType === "PERCENT" ? n(o.depositValue, 0, 100) : depositType === "FIXED" ? n(o.depositValue, 0, 10_000_000) : 0,
    clientMessage: s(o.clientMessage, TEXT_LIMITS.message),
    accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : DEFAULT_ACCENT,
  };
}

/** Enough of a document to be worth a PDF: a business name and one priced line. */
export function docReady(doc: ToolDoc): { ok: true } | { ok: false; reason: string } {
  if (!doc.business.name.trim()) return { ok: false, reason: "Add your business name." };
  if (!doc.lines.some((l) => (l.name.trim() || l.description.trim()) && lineTotal(l) > 0)) return { ok: false, reason: "Add at least one line item with a price." };
  return { ok: true };
}
