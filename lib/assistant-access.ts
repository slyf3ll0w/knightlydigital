import {
  ATLAS_PLAN_TOKENS,
  ATLAS_TRIAL_TOKENS,
  METER_SELECT,
  planBalance,
  trialBalance,
  type MeterBalance,
  type MeterCompany,
} from "@/lib/assistant-billing";

/**
 * Who gets Atlas. Every assistant turn is real AI spend, so Atlas is a
 * premium add-on. The ladder, top to bottom:
 *
 *   assistantEnabled === true  → "full": unmetered (the whitelist — test
 *                                 accounts, comped users). Turns are still
 *                                 logged to AssistantTurn for visibility.
 *   assistantEnabled === false → "off": Atlas hidden entirely.
 *   atlasPlanActiveAt set       → "plan": the paid plan, metered in Atlas
 *                                 tokens per monthly period
 *                                 (lib/assistant-billing.ts). Out of tokens
 *                                 → "locked" until the period resets.
 *   otherwise                   → the free trial: a one-time allowance of
 *                                 ATLAS_TRIAL_TOKENS on the SAME meter,
 *                                 started by an owner/admin from the
 *                                 paywall, then "locked" with the upsell.
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
  /** ISO refill time for the plan; null for the one-time trial. */
  refillsAt: string | null;
};

export type AtlasAccess =
  /** Whitelisted: unmetered Atlas. */
  | { level: "full" }
  /** Paid plan with tokens left this period. */
  | { level: "plan"; meter: AtlasMeter }
  /** Free trial running with tokens left. */
  | { level: "trial"; meter: AtlasMeter }
  /** Paywalled. reason: trial not started / trial allowance spent / plan
   *  period spent (resetsAt = when the meter refills). trialUsed is kept
   *  for the older callers that only distinguish offer vs. ended. */
  | {
      level: "locked";
      trialUsed: boolean;
      reason: "trial-offer" | "trial-ended" | "plan-spent";
      resetsAt?: string;
    }
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
    refillsAt: b.refillsAt ? b.refillsAt.toISOString() : null,
  };
}

export function atlasAccess(company: AssistantAccessCompany, now: Date = new Date()): AtlasAccess {
  if (company.assistantEnabled === true) return { level: "full" };
  if (company.assistantEnabled === false) return { level: "off" };
  const plan = planBalance(company, now);
  if (plan) {
    if (plan.remaining <= 0) {
      return {
        level: "locked",
        trialUsed: true,
        reason: "plan-spent",
        resetsAt: plan.periodEnd.toISOString(),
      };
    }
    return { level: "plan", meter: meterToClient(plan) };
  }
  const trial = trialBalance(company);
  if (!trial) return { level: "locked", trialUsed: false, reason: "trial-offer" };
  if (trial.remaining <= 0) return { level: "locked", trialUsed: true, reason: "trial-ended" };
  return { level: "trial", meter: meterToClient(trial) };
}

export { ATLAS_PLAN_TOKENS, ATLAS_TRIAL_TOKENS };
