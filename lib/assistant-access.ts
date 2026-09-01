/**
 * Who gets Atlas. Every assistant turn is real AI spend, so Atlas is a
 * premium add-on: by default a company gets a limited free trial
 * (ATLAS_TRIAL_TURNS assistant turns, started by an owner/admin from the
 * paywall), and after that the full-plan upsell — pricing TBD, shown as
 * "Coming Soon".
 *
 * assistantEnabled is the per-company superadmin override:
 *   true  → full Atlas, no trial accounting (the whitelist — test accounts
 *           like Streamflaire's and Summit Plumbing's, comped users)
 *   false → Atlas hidden entirely (no bubble, no trial, API rejects)
 *   null  → the default paywall/trial policy above
 *
 * Enforced in app/platform/layout.tsx (what the bubble/drawer shows) AND in
 * app/api/app/assistant/route.ts (rejects direct calls + counts trial turns)
 * — the UI alone wouldn't stop a hand-crafted request.
 */

/** Assistant turns included in the free trial (env-tunable). */
export const ATLAS_TRIAL_TURNS = Math.max(1, Number(process.env.ATLAS_TRIAL_TURNS) || 25);

export type AssistantAccessCompany = {
  assistantEnabled: boolean | null;
  atlasTrialStartedAt: Date | null;
  atlasTrialUsed: number;
};

export type AtlasAccess =
  /** Whitelisted / future paid plan: unmetered Atlas. */
  | { level: "full" }
  /** Free trial running: `remaining` turns left. */
  | { level: "trial"; remaining: number }
  /** Paywalled: trial not started yet (trialUsed false) or exhausted (true). */
  | { level: "locked"; trialUsed: boolean }
  /** Superadmin turned Atlas off — hide every surface. */
  | { level: "off" };

export function atlasAccess(company: AssistantAccessCompany): AtlasAccess {
  if (company.assistantEnabled === true) return { level: "full" };
  if (company.assistantEnabled === false) return { level: "off" };
  if (!company.atlasTrialStartedAt) return { level: "locked", trialUsed: false };
  const remaining = ATLAS_TRIAL_TURNS - company.atlasTrialUsed;
  if (remaining <= 0) return { level: "locked", trialUsed: true };
  return { level: "trial", remaining };
}
