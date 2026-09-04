import {
  ATLAS_FREE_TOKENS,
  ATLAS_PLAN_PRICE_CENTS,
  ATLAS_PLAN_TOKENS,
  ATLAS_PRICING,
  METER_SELECT,
  freeBalance,
  planBalance,
  type AtlasPricing,
  type MeterBalance,
  type MeterCompany,
} from "@/lib/assistant-billing";

/**
 * Who gets Atlas. Every assistant turn is real AI spend, so Atlas is
 * metered. The ladder, top to bottom:
 *
 *   assistantEnabled === true  → "full": unmetered (the whitelist — test
 *                                 accounts, comped users). Turns are still
 *                                 logged to AssistantTurn for visibility.
 *   assistantEnabled === false → "off": Atlas hidden entirely.
 *   atlasPlanActiveAt set       → "plan": the paid plan, ATLAS_PLAN_TOKENS
 *                                 per billing month (lib/assistant-billing.ts).
 *                                 Out of tokens → "locked" until the period
 *                                 resets on the billing day.
 *   otherwise                   → "free": every account's ATLAS_FREE_TOKENS
 *                                 per calendar month on the SAME meter, no
 *                                 sign-up step. Out of tokens → "locked"
 *                                 (with the plan upsell) until the 1st.
 *
 * Enforced in app/platform/layout.tsx (what the bubble/drawer shows) AND in
 * app/api/app/assistant/route.ts (rejects direct calls + meters turns) — the
 * UI alone wouldn't stop a hand-crafted request.
 */

export type AssistantAccessCompany = MeterCompany & {
  assistantEnabled: boolean | null;
};

/** A meter as it travels to the client (dates as ISO strings). */
export type AtlasMeter = {
  included: number;
  used: number;
  remaining: number;
  /** ISO time the allowance refills — the 1st for the free tier, the
   *  billing day for the plan. */
  refillsAt: string;
};

export type AtlasAccess =
  /** Whitelisted: unmetered Atlas. */
  | { level: "full" }
  /** Paid plan with tokens left this period. */
  | { level: "plan"; meter: AtlasMeter }
  /** Free tier with tokens left this month. */
  | { level: "free"; meter: AtlasMeter }
  /** Out of tokens on the free tier or the plan; resetsAt = the refill. */
  | { level: "locked"; reason: "free-spent" | "plan-spent"; resetsAt: string }
  /** Superadmin turned Atlas off — hide every surface. */
  | { level: "off" };

/** Prisma select covering everything atlasAccess() needs. */
export const ATLAS_ACCESS_SELECT = {
  assistantEnabled: true,
  ...METER_SELECT,
} as const;

export function meterToClient(b: MeterBalance): AtlasMeter {
  return {
    included: b.included,
    used: b.used,
    remaining: b.remaining,
    refillsAt: b.refillsAt.toISOString(),
  };
}

export function atlasAccess(company: AssistantAccessCompany, now: Date = new Date()): AtlasAccess {
  if (company.assistantEnabled === true) return { level: "full" };
  if (company.assistantEnabled === false) return { level: "off" };
  const plan = planBalance(company, now);
  if (plan) {
    if (plan.remaining <= 0) {
      return { level: "locked", reason: "plan-spent", resetsAt: plan.periodEnd.toISOString() };
    }
    return { level: "plan", meter: meterToClient(plan) };
  }
  const free = freeBalance(company, now);
  if (free.remaining <= 0) {
    return { level: "locked", reason: "free-spent", resetsAt: free.periodEnd.toISOString() };
  }
  return { level: "free", meter: meterToClient(free) };
}

export { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, ATLAS_PLAN_PRICE_CENTS, ATLAS_PRICING, type AtlasPricing };
