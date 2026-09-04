/**
 * Atlas allowances and price — pure constants, safe to import from the
 * marketing site and client components (no Prisma). lib/assistant-billing.ts
 * re-exports these and does the metering.
 *
 *   1 Atlas token = ATLAS_TOKEN_CENTS of our real Gemini cost (0.01¢ →
 *   10,000 tokens ≈ $1 of spend).
 *   Free tier: ATLAS_FREE_TOKENS per calendar month, every account,
 *   refilled on the 1st.
 *   Paid plan: ATLAS_PLAN_TOKENS per billing month for
 *   ATLAS_PLAN_PRICE_CENTS, refilled on the billing day.
 *
 * Every value is env-tunable so pricing is a Railway variable change, not a
 * deploy. Marketing copy reads these so the site can't drift from the app.
 */

const envNum = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Our cost, in cents, that one Atlas token represents. */
export const ATLAS_TOKEN_CENTS = envNum(process.env.ATLAS_TOKEN_CENTS, 0.01);
/** Tokens every account gets each calendar month, free. */
export const ATLAS_FREE_TOKENS = Math.round(envNum(process.env.ATLAS_FREE_TOKENS, 10_000));
/** Tokens included in each monthly plan period. */
export const ATLAS_PLAN_TOKENS = Math.round(envNum(process.env.ATLAS_PLAN_TOKENS, 150_000));
/** What the plan costs per month, in cents — copy only until checkout exists. */
export const ATLAS_PLAN_PRICE_CENTS = Math.round(envNum(process.env.ATLAS_PLAN_PRICE_CENTS, 2_000));

/** The allowances as the UI quotes them — one shape, so copy never drifts. */
export type AtlasPricing = {
  freeTokens: number;
  planTokens: number;
  planPriceCents: number;
};

export const ATLAS_PRICING: AtlasPricing = {
  freeTokens: ATLAS_FREE_TOKENS,
  planTokens: ATLAS_PLAN_TOKENS,
  planPriceCents: ATLAS_PLAN_PRICE_CENTS,
};

/** "12,400 tokens" — one formatter so every surface agrees. */
export function formatTokens(n: number): string {
  return `${Math.max(0, Math.round(n)).toLocaleString("en-US")} tokens`;
}

/** "10,000" — the bare number for prose that supplies its own noun. */
export function tokenCount(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("en-US");
}

/** "$20" / "$19.50" — the plan price as marketing writes it. */
export function formatPlanPrice(cents: number = ATLAS_PLAN_PRICE_CENTS): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
