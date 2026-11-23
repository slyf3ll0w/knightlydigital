"use client";

import { InfoTip } from "@/components/ds";
import { MAX_DISCOUNT_INVOICES } from "@/lib/series-discount";

/**
 * The discount fields of a recurring series (lib/series-discount.ts), shared
 * by the Recurring page's edit form and New recurring plan. Three controls:
 * what kind, how much, and for how long. The parent owns the draft and sends
 * `discountDraftBody(draft)` with its save.
 */
export type DiscountDraft = {
  type: "NONE" | "FIXED" | "PERCENT";
  value: string;
  /** "all" = every invoice, "count" = only the next `count` invoices. */
  span: "all" | "count";
  count: string;
};

export const EMPTY_DISCOUNT_DRAFT: DiscountDraft = { type: "NONE", value: "", span: "all", count: "1" };

export function discountDraftFrom(row: {
  discountType?: string | null;
  discountValue?: number | string | null;
  discountInvoicesLeft?: number | null;
}): DiscountDraft {
  const type = row.discountType === "FIXED" || row.discountType === "PERCENT" ? row.discountType : "NONE";
  const value = Number(row.discountValue) || 0;
  if (type === "NONE" || value <= 0) return EMPTY_DISCOUNT_DRAFT;
  const left = row.discountInvoicesLeft ?? null;
  return {
    type,
    value: String(value),
    span: left === null ? "all" : "count",
    count: left === null ? "1" : String(left),
  };
}

/** The request fields both subscription routes read (parseSeriesDiscountInput). */
export function discountDraftBody(d: DiscountDraft): Record<string, unknown> {
  if (d.type === "NONE") return { discountType: "NONE" };
  return {
    discountType: d.type,
    discountValue: parseFloat(d.value) || 0,
    discountInvoices: d.span === "all" ? null : parseInt(d.count, 10) || 0,
  };
}

/** A message when the draft can't be saved as typed, else "". */
export function discountDraftProblem(d: DiscountDraft): string {
  if (d.type === "NONE") return "";
  const value = parseFloat(d.value);
  if (!(value > 0)) return "Enter the discount amount, or set Discount to None.";
  if (d.type === "PERCENT" && value > 100) return "A percent discount can't be more than 100.";
  if (d.span === "count") {
    const n = Number(d.count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_DISCOUNT_INVOICES) {
      return `The discount can cover 1 to ${MAX_DISCOUNT_INVOICES} invoices.`;
    }
  }
  return "";
}

export default function SeriesDiscountFields({
  value,
  onChange,
  inputCls,
  labelCls = "block text-xs text-gray-500 mb-0.5",
}: {
  value: DiscountDraft;
  onChange: (next: DiscountDraft) => void;
  inputCls: string;
  labelCls?: string;
}) {
  const on = value.type !== "NONE";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-series-discount>
      <div>
        <label className={`${labelCls.replace(/\bblock\b/, "flex")} items-center gap-1`}>
          Discount
          <InfoTip label="How does a discount work?">
            It comes off each invoice this plan makes, before tax, and shows as a Discount line the
            client can see. Invoices already made keep their amounts.
          </InfoTip>
        </label>
        <select
          aria-label="Discount"
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as DiscountDraft["type"] })}
          className={`${inputCls} bg-white`}
        >
          <option value="NONE">None</option>
          <option value="FIXED">$ off</option>
          <option value="PERCENT">% off</option>
        </select>
      </div>
      {on && (
        <>
          <div>
            <label className={labelCls}>{value.type === "PERCENT" ? "Percent off" : "Dollars off"}</label>
            <input
              aria-label={value.type === "PERCENT" ? "Percent off" : "Dollars off"}
              type="number"
              min="0"
              max={value.type === "PERCENT" ? 100 : undefined}
              step="0.01"
              inputMode="decimal"
              value={value.value}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Applies to</label>
            <select
              aria-label="Discount applies to"
              value={value.span}
              onChange={(e) => onChange({ ...value, span: e.target.value as DiscountDraft["span"] })}
              className={`${inputCls} bg-white`}
            >
              <option value="all">Every invoice</option>
              <option value="count">Only the next…</option>
            </select>
          </div>
          {value.span === "count" && (
            <div>
              <label className={labelCls}>Invoices</label>
              <input
                aria-label="Number of invoices"
                type="number"
                min="1"
                max={MAX_DISCOUNT_INVOICES}
                step="1"
                inputMode="numeric"
                value={value.count}
                onChange={(e) => onChange({ ...value, count: e.target.value })}
                className={inputCls}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
