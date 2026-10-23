/**
 * A quick charge ("Request payment"): one amount and what it is for, turned
 * into a live pay link without the invoice editor. Behind it is an ordinary
 * invoice (`kind: QUICK_CHARGE`) so the money lands in the same reports,
 * reminders, QuickBooks sync and refund flow as every other payment.
 * Client-safe: the form and the route share these limits.
 * Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 1.
 */

export const QUICK_CHARGE_MIN = 1;
export const QUICK_CHARGE_MAX = 25_000;
export const QUICK_CHARGE_DESCRIPTION_MAX = 120;

/** Why the request can't be made, or null when it can. */
export function quickChargeIssue(input: { amount: number; description: string }): string | null {
  if (!Number.isFinite(input.amount) || input.amount < QUICK_CHARGE_MIN) {
    return `Enter an amount of at least $${QUICK_CHARGE_MIN.toFixed(2)}.`;
  }
  if (input.amount > QUICK_CHARGE_MAX) {
    return `Payment requests top out at $${QUICK_CHARGE_MAX.toLocaleString("en-US")} — make an invoice for more.`;
  }
  if (!input.description.trim()) return "Say what the payment is for.";
  if (input.description.trim().length > QUICK_CHARGE_DESCRIPTION_MAX) {
    return `Keep "what for" under ${QUICK_CHARGE_DESCRIPTION_MAX} characters.`;
  }
  return null;
}

/** Dollars typed into the form ("120", "1,200.5", "$80") → a number, or NaN. */
export function parseDollars(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") return NaN;
  return Math.round(Number(cleaned) * 100) / 100;
}
