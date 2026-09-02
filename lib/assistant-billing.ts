import { prisma } from "@/lib/db";
import { unitPrices } from "@/lib/platform-costs";

/**
 * Atlas metering — SPEND, framed as tokens. One meter for the free trial
 * and the paid plan.
 *
 * A message costs anywhere from a fraction of a cent (a quick lookup) to
 * several cents (a 40-record bulk edit), so counting messages is unfair in
 * both directions. Instead every turn is priced at what it actually cost
 * us — Gemini's usageMetadata × the same unit prices the superadmin
 * profitability dashboard uses (lib/platform-costs.ts) — and presented to
 * the user as "Atlas tokens":
 *
 *   1 Atlas token = ATLAS_TOKEN_CENTS of our cost (default 0.01 cents, so
 *   10,000 tokens is about $1 of spend). Measured 2026-09-02 with 95 tools
 *   and gemini-2.5-flash: a quick question ≈ 100–200 tokens, a multi-step
 *   lookup ≈ 300–500, a bulk edit ≈ 1,000–2,000.
 *
 * Two allowances draw on the meter:
 *   - the free trial: ATLAS_TRIAL_TOKENS once, ever (default 10,000 ≈ $1
 *     of raw spend per company — roughly 25–60 messages, enough to see
 *     Atlas do real work while capping what a trial can cost us);
 *   - the paid plan: ATLAS_PLAN_TOKENS per monthly period (default
 *     100,000, about $10 of raw spend), anchored on the day the plan
 *     activated. Margin lives in the gap between the plan's price and the
 *     tokens it includes — no multiplier to keep in sync.
 * Every rate is env-tunable so pricing is a Railway variable change, not a
 * deploy.
 *
 * Debits happen AFTER the turn (the cost isn't known before): a turn is
 * allowed while any tokens remain, so a meter can overshoot by at most one
 * turn — a few cents — which is cheaper than reserving and truer than
 * guessing.
 *
 * NOT LIVE: nothing sells the plan yet. Superadmin grants it for testing.
 */

const envNum = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Our cost, in cents, that one Atlas token represents. */
export const ATLAS_TOKEN_CENTS = envNum(process.env.ATLAS_TOKEN_CENTS, 0.01);
/** Tokens in the one-time free trial allowance. */
export const ATLAS_TRIAL_TOKENS = Math.round(envNum(process.env.ATLAS_TRIAL_TOKENS, 10_000));
/** Tokens included in each monthly plan period. */
export const ATLAS_PLAN_TOKENS = Math.round(envNum(process.env.ATLAS_PLAN_TOKENS, 100_000));

export type TurnUsage = { tokensIn: number; tokensOut: number; tokensCached: number };

/** Cents one turn's Gemini usage cost us (cached share at the cached rate). */
export function turnCostCents(u: TurnUsage): number {
  const p = unitPrices();
  const freshIn = Math.max(0, u.tokensIn - u.tokensCached);
  return (
    (freshIn * p.aiInCentsPerMTokens) / 1_000_000 +
    (u.tokensCached * p.aiCachedCentsPerMTokens) / 1_000_000 +
    (u.tokensOut * p.aiOutCentsPerMTokens) / 1_000_000
  );
}

/** Cents → Atlas tokens, rounded up so no turn is free. */
export function centsToAtlasTokens(cents: number): number {
  if (!(cents > 0)) return 0;
  return Math.max(1, Math.ceil(cents / ATLAS_TOKEN_CENTS));
}

/** "12,400 tokens" — one formatter so every surface agrees. */
export function formatTokens(n: number): string {
  return `${Math.max(0, Math.round(n)).toLocaleString("en-US")} tokens`;
}

// ── balances ─────────────────────────────────────────────────────────────────

/** What a meter looks like from the outside — trial and plan agree. */
export type MeterBalance = {
  included: number;
  used: number;
  remaining: number;
  /** When the allowance refills; null for the one-time trial. */
  refillsAt: Date | null;
};

export type TrialCompany = {
  atlasTrialStartedAt: Date | null;
  atlasTrialTokensUsed: number;
};

/** The trial's live balance, or null when the trial was never started. */
export function trialBalance(company: TrialCompany): MeterBalance | null {
  if (!company.atlasTrialStartedAt) return null;
  const used = Math.max(0, company.atlasTrialTokensUsed);
  return {
    included: ATLAS_TRIAL_TOKENS,
    used,
    remaining: Math.max(0, ATLAS_TRIAL_TOKENS - used),
    refillsAt: null,
  };
}

// ── plan periods ─────────────────────────────────────────────────────────────

/**
 * Monthly periods anchored on the activation timestamp: the period containing
 * `now` starts on the activation day-of-month (clamped for short months) and
 * ends one calendar month later. UTC arithmetic — a few hours of drift at the
 * boundary doesn't matter for a spend meter.
 */
export function planPeriod(activeAt: Date, now: Date = new Date()): { start: Date; end: Date } {
  const anchorDay = activeAt.getUTCDate();
  const monthsSince =
    (now.getUTCFullYear() - activeAt.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - activeAt.getUTCMonth());
  const at = (monthOffset: number) => {
    const y = activeAt.getUTCFullYear();
    const m = activeAt.getUTCMonth() + monthOffset;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(
      Date.UTC(
        y,
        m,
        Math.min(anchorDay, lastDay),
        activeAt.getUTCHours(),
        activeAt.getUTCMinutes(),
        activeAt.getUTCSeconds()
      )
    );
  };
  let k = monthsSince;
  let start = at(k);
  if (start > now) {
    k -= 1;
    start = at(k);
  }
  let end = at(k + 1);
  if (end <= now) {
    start = end;
    end = at(k + 2);
  }
  return { start, end };
}

export type PlanCompany = {
  atlasPlanActiveAt: Date | null;
  atlasPeriodStart: Date | null;
  atlasPeriodTokensUsed: number;
};

export type PlanBalance = MeterBalance & {
  periodStart: Date;
  periodEnd: Date;
};

/** The plan's live balance, treating a stale stored period as a fresh one. */
export function planBalance(company: PlanCompany, now: Date = new Date()): PlanBalance | null {
  if (!company.atlasPlanActiveAt) return null;
  const { start, end } = planPeriod(company.atlasPlanActiveAt, now);
  const current =
    company.atlasPeriodStart && company.atlasPeriodStart.getTime() >= start.getTime();
  const used = current ? company.atlasPeriodTokensUsed : 0;
  return {
    included: ATLAS_PLAN_TOKENS,
    used,
    remaining: Math.max(0, ATLAS_PLAN_TOKENS - used),
    refillsAt: end,
    periodStart: start,
    periodEnd: end,
  };
}

// ── debit ────────────────────────────────────────────────────────────────────

export type MeterCompany = TrialCompany & PlanCompany;

/** Prisma select covering everything the meter needs. */
export const METER_SELECT = {
  atlasTrialStartedAt: true,
  atlasTrialTokensUsed: true,
  atlasPlanActiveAt: true,
  atlasPeriodStart: true,
  atlasPeriodTokensUsed: true,
} as const;

export type Debit = { level: "plan" | "trial"; balance: MeterBalance };

/**
 * Debit a finished turn from whichever meter the company is on — the plan
 * when one is active (rolling the period forward if the stored one is
 * stale), otherwise the trial. Two racing turns can't double-reset a plan
 * period: the rollover is a conditional write keyed on the old period
 * start. Returns the post-debit balance, or null when the company is on
 * neither meter (whitelisted / never started).
 */
export async function debitAtlasTokens(companyId: string, tokens: number): Promise<Debit | null> {
  const now = new Date();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: METER_SELECT });
  if (!company) return null;

  if (company.atlasPlanActiveAt) {
    const { start } = planPeriod(company.atlasPlanActiveAt, now);
    const stale =
      !company.atlasPeriodStart || company.atlasPeriodStart.getTime() < start.getTime();
    if (stale) {
      const rolled = await prisma.company.updateMany({
        where: { id: companyId, atlasPeriodStart: company.atlasPeriodStart },
        data: { atlasPeriodStart: start, atlasPeriodTokensUsed: tokens },
      });
      if (rolled.count === 0) {
        // someone else rolled it first — just add ours on top
        await prisma.company.update({
          where: { id: companyId },
          data: { atlasPeriodTokensUsed: { increment: tokens } },
        });
      }
    } else {
      await prisma.company.update({
        where: { id: companyId },
        data: { atlasPeriodTokensUsed: { increment: tokens } },
      });
    }
    const after = await prisma.company.findUnique({ where: { id: companyId }, select: METER_SELECT });
    const balance = after ? planBalance(after, now) : null;
    return balance ? { level: "plan", balance } : null;
  }

  if (company.atlasTrialStartedAt) {
    const after = await prisma.company.update({
      where: { id: companyId },
      data: { atlasTrialTokensUsed: { increment: tokens } },
      select: METER_SELECT,
    });
    const balance = trialBalance(after);
    return balance ? { level: "trial", balance } : null;
  }

  return null;
}

// ── ledger ───────────────────────────────────────────────────────────────────

/**
 * Record one turn in the ledger. Fire-and-forget like lib/usage.ts — the
 * meter must never fail the reply it rides along with.
 */
export function recordAssistantTurn(row: {
  companyId: string;
  userId: string;
  access: "trial" | "plan" | "full";
  model: string;
  rounds: number;
  toolCalls: number;
  proposals: number;
  usage: TurnUsage;
  costCents: number;
  atlasTokens: number;
  ok: boolean;
}): void {
  void prisma.assistantTurn
    .create({
      data: {
        companyId: row.companyId,
        userId: row.userId,
        access: row.access,
        model: row.model,
        rounds: row.rounds,
        toolCalls: row.toolCalls,
        proposals: row.proposals,
        tokensIn: row.usage.tokensIn,
        tokensOut: row.usage.tokensOut,
        tokensCached: row.usage.tokensCached,
        costCents: row.costCents,
        atlasTokens: row.atlasTokens,
        ok: row.ok,
      },
    })
    .catch((err) => console.error("[assistant-billing] failed to record turn", err));
}

/** Rolling usage summary for the superadmin console. */
export async function assistantUsageSummary(companyId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const agg = await prisma.assistantTurn.aggregate({
    where: { companyId, createdAt: { gte: since } },
    _count: true,
    _sum: { costCents: true, atlasTokens: true, tokensIn: true, tokensOut: true, tokensCached: true, toolCalls: true },
    _max: { createdAt: true },
  });
  return {
    days,
    turns: agg._count,
    costCents: agg._sum.costCents ?? 0,
    atlasTokens: agg._sum.atlasTokens ?? 0,
    tokensIn: agg._sum.tokensIn ?? 0,
    tokensOut: agg._sum.tokensOut ?? 0,
    tokensCached: agg._sum.tokensCached ?? 0,
    toolCalls: agg._sum.toolCalls ?? 0,
    lastAt: agg._max.createdAt,
  };
}
