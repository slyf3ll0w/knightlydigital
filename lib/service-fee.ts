import { PROCESSING_RATES, RATES } from "@/lib/plans";

/**
 * The client service fee (2026-10-31, David): when a company's Service fee
 * switch is on, the client pays the processing fee on top of what they owe —
 * on a card AND on a bank transfer — at the rates of the service-fee billing
 * plan in lib/plans.ts PROCESSING_RATES. The rates are fixed per billing
 * category; nothing in Settings adjusts them (Company.surchargeRate is a
 * legacy column nobody reads). Pure and client-safe: the pay page, the
 * booking stepper, Tap to Pay, autopay and the Plans page all compute the
 * same cents from here, so every surface agrees to the penny.
 *
 *   card: 3.50% + 30¢        bank (ACH): 0.75%, $1 minimum, $8 maximum
 */
export type ServiceFeeMethod = "CARD" | "ACH";

/** "3.50% + 30¢" */
export const SERVICE_FEE_CARD = RATES.serviceFee.card;
/** "0.75%, $1–$8" */
export const SERVICE_FEE_ACH = RATES.serviceFee.achShort;
/** "0.75% ($1 minimum, $8 maximum)" */
export const SERVICE_FEE_ACH_LONG = RATES.serviceFee.ach;

/** The fee in cents on a payment of `amountCents` by `method`; 0 for nothing to pay. */
export function serviceFeeCents(amountCents: number, method: ServiceFeeMethod): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const r = PROCESSING_RATES.serviceFee;
  if (method === "CARD") return Math.round((amountCents * r.cardBps) / 10_000) + r.cardFixedCents;
  const pct = Math.round((amountCents * r.achBps) / 10_000);
  return Math.min(r.achMaxCents, Math.max(r.achMinCents, pct));
}

/** The fee in dollars (2 dp) on a payment of `amount` dollars, or 0 when the switch is off. */
export function serviceFee(amount: number, method: ServiceFeeMethod, enabled: boolean): number {
  if (!enabled) return 0;
  return serviceFeeCents(Math.round(amount * 100), method) / 100;
}

/** "Card service fee (3.50% + 30¢)" / "Bank service fee (0.75%, $1–$8)" — the totals-row label. */
export function serviceFeeLabel(method: ServiceFeeMethod): string {
  return method === "CARD" ? `Card service fee (${SERVICE_FEE_CARD})` : `Bank service fee (${SERVICE_FEE_ACH})`;
}

/** One quiet sentence for places that disclose the fee without selling it. */
export const SERVICE_FEE_SENTENCE = `A ${SERVICE_FEE_CARD} service fee applies to card payments and ${SERVICE_FEE_ACH} to bank transfers.`;
