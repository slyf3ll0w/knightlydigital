/**
 * Online store rules (lane 1, 2026-10-31 — docs/plans/online-store-2026-10-31.md).
 * Pure: what a shop page may sell, how an order's numbers add up, and what a
 * buyer has to type. The server (lib/store.ts) and the public page both read
 * these so the price the buyer saw is the invoice they get.
 *   npx tsx scripts/test-store.ts
 */

/** Most of one product per order — a cart and real quantities are lane 2. */
export const STORE_MAX_QUANTITY = 20;
/** Same ceiling as a payment request (lib/quick-charge.ts); above it, make an invoice. */
export const STORE_MAX_ORDER = 25_000;
/** The pay page's floor. */
export const STORE_MIN_ORDER = 1;
/** An order nobody paid archives itself after this (cron step `storeOrders`). */
export const STORE_ORDER_HOLD_HOURS = 48;
export const STORE_NOTE_MAX = 300;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The invoice's numbers for `quantity` of a product: company sales tax applies when the company has a default rate. */
export function orderTotals(p: { unitPrice: number; quantity: number; taxRate: number | null | undefined }): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(Math.max(0, Number(p.unitPrice) || 0) * Math.max(0, Math.floor(Number(p.quantity) || 0)));
  const rate = Number(p.taxRate ?? 0);
  const tax = Number.isFinite(rate) && rate > 0 ? round2(subtotal * rate) : 0;
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** A whole number from 1 to the cap, else why not. */
export function storeQuantityIssue(raw: unknown): string | null {
  const q = Number(raw);
  if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) return "Pick how many you'd like.";
  if (q > STORE_MAX_QUANTITY) return `Up to ${STORE_MAX_QUANTITY} per order — contact us for more.`;
  return null;
}

/** The order must fit the pay page: at least $1, at most the payment-request ceiling. */
export function orderAmountIssue(total: number): string | null {
  if (!Number.isFinite(total) || total < STORE_MIN_ORDER) return "This product can't be ordered online right now.";
  if (total > STORE_MAX_ORDER) return `Orders top out at $${STORE_MAX_ORDER.toLocaleString("en-US")} — contact us for a larger order.`;
  return null;
}

export type StoreBuyer = { firstName: string; lastName: string; email: string; phone: string };

/** Name and a real email (the pay link and receipt go there); phone optional. */
export function storeBuyerIssue(b: StoreBuyer): string | null {
  if (!b.firstName.trim()) return "Enter your name.";
  if (!b.email.trim()) return "Enter your email — that's where the receipt goes.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) return "That email address doesn't look right.";
  return null;
}

/** "Order · 3 × Air filter" — the invoice subject. */
export function storeOrderSubject(productName: string, quantity: number): string {
  return `Order · ${quantity > 1 ? `${quantity} × ` : ""}${productName}`;
}
