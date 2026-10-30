/**
 * Pure autopay policy: decline classification, retry schedule, and what
 * counts as "the processor didn't answer" versus "the card said no". No DB
 * and no imports, so scripts/test-subscriptions.ts can exercise it and
 * lib/payments.ts can use it without an import cycle.
 */

/** Hours until the next retry, keyed by how many attempts have failed. */
export const RETRY_DELAY_HOURS: Record<number, number> = { 1: 24, 2: 72, 3: 168 };
/** Total attempts (1 initial + 3 retries) before autopay gives up. */
export const MAX_AUTO_CHARGE_ATTEMPTS = 4;

/**
 * Hard declines: the card itself is dead — retrying can never succeed until
 * the client saves a different card. Matched against the processor's decline
 * CODE only: free-text messages ("invalid credentials", "unsupported media
 * type", "not permitted") come from config and gateway errors too, and
 * matching them used to stop autopay permanently on an invoice because Finix
 * had a bad hour. Unknown or missing codes default to soft (retryable): the
 * attempt cap bounds the damage either way.
 */
const HARD_DECLINE = /lost|stolen|invalid|expired|fraud|pick.?up|restricted|closed|not.?permitted|security|revocation|no.?such|unsupported/i;

export function classifyDecline(_error: string, code?: string | null): "hard" | "soft" {
  return code && HARD_DECLINE.test(code) ? "hard" : "soft";
}

/**
 * A processor response that says nothing about the card: auth/config errors
 * (401/403), rate limits (429), gateway/server errors (5xx). The charge never
 * reached a decision, so it is neither an attempt nor a decline.
 */
export function isTransientProcessorStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

/** When a soft decline retries next, or null when autopay gives up. */
export function nextRetryAt(params: {
  attempts: number;
  kind: "hard" | "soft";
  now: Date;
}): Date | null {
  const giveUp = params.kind === "hard" || params.attempts >= MAX_AUTO_CHARGE_ATTEMPTS;
  if (giveUp) return null;
  return new Date(params.now.getTime() + (RETRY_DELAY_HOURS[params.attempts] ?? 168) * 3600_000);
}

/** The widest card surcharge Settings accepts (0–10%) — anything else is a bad row, not a fee. */
export const MAX_SURCHARGE_RATE = 0.1;

/**
 * What a card-on-file (autopay) charge collects: the invoice balance plus the
 * company's card surcharge when its Service fee switch is on — the same fee
 * the client would pay for that card on the pay page (2026-10-30; before
 * this, autopay charged the bare balance and the business ate Square's fee).
 * Rounding matches lib/payments.ts calculateSurcharge. Pure: lib/payments.ts
 * imports this module, so the helper can't import it back.
 */
export function cardOnFileCharge(params: {
  amount: number;
  surchargeEnabled: boolean;
  surchargeRate: number | null | undefined;
}): { amount: number; surcharge: number; total: number } {
  const amount = Math.round(params.amount * 100) / 100;
  const rate = Number(params.surchargeRate ?? 0);
  const usable = params.surchargeEnabled && Number.isFinite(rate) && rate > 0 && rate <= MAX_SURCHARGE_RATE && amount > 0;
  const surcharge = usable ? Math.round(amount * rate * 100) / 100 : 0;
  return { amount, surcharge, total: Math.round((amount + surcharge) * 100) / 100 };
}
