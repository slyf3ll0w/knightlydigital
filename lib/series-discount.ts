/**
 * A discount on a recurring series (tickets #kw6905, #cil2or; 2026-11-23).
 *
 * The series carries the discount; every invoice the series makes takes it
 * off before tax and records it on the invoice's own discount columns, so the
 * invoice page, the PDF and the pay page show a Discount line with no extra
 * work. Two shapes: dollars off each invoice (FIXED) or a percent off its
 * subtotal (PERCENT). It lasts for every invoice (`invoicesLeft` null) or for
 * the next N invoices, counting down as each one is made and clearing itself
 * at zero.
 *
 * Pure: no database, no clock. The engine (lib/subscriptions.ts) and both
 * subscription routes call in here. `npx tsx scripts/test-series-discount.ts`.
 */
import { computeQuoteTotals } from "@/lib/quote-totals";

export type SeriesDiscountType = "NONE" | "FIXED" | "PERCENT";

export interface SeriesDiscount {
  discountType: SeriesDiscountType;
  /** Dollars (FIXED) or percent 0–100 (PERCENT). */
  discountValue: number | null;
  /** null = every invoice; a number = only that many more invoices. */
  discountInvoicesLeft: number | null;
}

/** What the database columns look like when there is no discount. */
export const NO_SERIES_DISCOUNT: SeriesDiscount = {
  discountType: "NONE",
  discountValue: null,
  discountInvoicesLeft: null,
};

/** Most invoices a counted discount can cover (ten years of monthly bills). */
export const MAX_DISCOUNT_INVOICES = 120;

type Loose = {
  discountType?: string | null;
  discountValue?: unknown;
  discountInvoicesLeft?: number | null;
};

/** Normalize whatever the row holds (Prisma Decimals included). */
export function readSeriesDiscount(row: Loose | null | undefined): SeriesDiscount {
  const type = row?.discountType === "FIXED" || row?.discountType === "PERCENT" ? row.discountType : "NONE";
  const value = row?.discountValue == null ? 0 : Number(row.discountValue);
  const left = row?.discountInvoicesLeft ?? null;
  if (type === "NONE" || !Number.isFinite(value) || value <= 0) return NO_SERIES_DISCOUNT;
  if (left !== null && left <= 0) return NO_SERIES_DISCOUNT;
  return { discountType: type, discountValue: value, discountInvoicesLeft: left };
}

export function hasSeriesDiscount(row: Loose | null | undefined): boolean {
  return readSeriesDiscount(row).discountType !== "NONE";
}

export interface SeriesInvoiceMoney {
  /** What to write on the invoice. */
  discountType: SeriesDiscountType;
  discountValue: number | null;
  discount: number | null;
  tax: number | null;
  total: number;
  /** True when the discount took something off, so the count should drop. */
  used: boolean;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Money for one invoice of the series: discount off the subtotal, then tax. */
export function seriesInvoiceMoney(
  row: Loose | null | undefined,
  subtotal: number,
  taxRate: number | null
): SeriesInvoiceMoney {
  const d = readSeriesDiscount(row);
  const { discount, tax, total } = computeQuoteTotals({
    subtotal,
    discountType: d.discountType,
    discountValue: d.discountValue,
    taxRate,
  });
  const off = cents(discount);
  const used = off > 0;
  return {
    discountType: used ? d.discountType : "NONE",
    discountValue: used ? d.discountValue : null,
    discount: used ? off : null,
    tax,
    total: cents(total),
    used,
  };
}

/** The series' discount columns after one invoice used it. */
export function seriesDiscountAfterUse(row: Loose | null | undefined): SeriesDiscount {
  const d = readSeriesDiscount(row);
  if (d.discountType === "NONE" || d.discountInvoicesLeft === null) return d;
  const left = d.discountInvoicesLeft - 1;
  return left <= 0 ? NO_SERIES_DISCOUNT : { ...d, discountInvoicesLeft: left };
}

/**
 * Read a discount out of a request body. `undefined` = the body says nothing
 * about a discount; an `error` string = it tried and got it wrong.
 * Accepts { discountType, discountValue, discountInvoices } where
 * discountInvoices is null / "" / "all" for every invoice, or a count.
 */
export function parseSeriesDiscountInput(
  body: Record<string, unknown>
): { discount: SeriesDiscount } | { error: string } | undefined {
  if (body.discountType === undefined) return undefined;
  const type = body.discountType;
  if (type === null || type === "NONE" || type === "") return { discount: NO_SERIES_DISCOUNT };
  if (type !== "FIXED" && type !== "PERCENT") return { error: "Pick dollars off or percent off." };
  const value = Number(body.discountValue);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "The discount needs an amount above zero." };
  }
  if (type === "PERCENT" && value > 100) return { error: "A percent discount can't be more than 100." };
  if (type === "FIXED" && value > 99_999_999) return { error: "That discount is too large." };
  const rawCount = body.discountInvoices;
  let left: number | null = null;
  if (rawCount !== undefined && rawCount !== null && rawCount !== "" && rawCount !== "all") {
    const n = Number(rawCount);
    if (!Number.isInteger(n) || n < 1 || n > MAX_DISCOUNT_INVOICES) {
      return { error: `The discount can cover 1 to ${MAX_DISCOUNT_INVOICES} invoices, or every invoice.` };
    }
    left = n;
  }
  return { discount: { discountType: type, discountValue: cents(value), discountInvoicesLeft: left } };
}

function money(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "$25 off every invoice" · "10% off the next 3 invoices" · "" when none. */
export function seriesDiscountLabel(row: Loose | null | undefined): string {
  const d = readSeriesDiscount(row);
  if (d.discountType === "NONE" || d.discountValue === null) return "";
  const amount = d.discountType === "PERCENT" ? `${d.discountValue}%` : money(d.discountValue);
  const span =
    d.discountInvoicesLeft === null
      ? "every invoice"
      : d.discountInvoicesLeft === 1
        ? "the next invoice"
        : `the next ${d.discountInvoicesLeft} invoices`;
  return `${amount} off ${span}`;
}

/** What one invoice of the series comes to before tax, for list rows. */
export function seriesDiscountedPrice(row: Loose | null | undefined, subtotal: number): number {
  return cents(subtotal - (seriesInvoiceMoney(row, subtotal, null).discount ?? 0));
}
