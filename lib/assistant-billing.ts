import { prisma } from "@/lib/db";
import { unitPrices } from "@/lib/platform-costs";
import { ATLAS_TOKEN_CENTS, ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS } from "@/lib/atlas-pricing";

/**
 * Atlas metering — SPEND, framed as tokens. One meter, two allowances.
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
 *   - the FREE tier, every account, no sign-up step: ATLAS_FREE_TOKENS per
 *     calendar month (default 10,000 ≈ $1 of raw spend, roughly 25–60
 *     messages), refilled on the 1st. Enough to use Atlas for real every
 *     month while capping what a free account can cost us.
 *   - the PAID plan: ATLAS_PLAN_TOKENS per billing month (default 150,000,
 *     about $15 of raw spend) for ATLAS_PLAN_PRICE_CENTS (default $20),
 *     the period anchored on the day the plan activated — i.e. the billing
 *     day. Margin lives in the gap between the plan's price and the tokens
 *     it includes — no multiplier to keep in sync.
 * Every rate is env-tunable so pricing is a Railway variable change, not a
 * deploy.
 *
 * Debits happen AFTER the turn (the cost isn't known before): a turn is
 * allowed while any tokens remain, so a meter can overshoot by at most one
 * turn — a few cents — which is cheaper than reserving and truer than
 * guessing.
 *
 * NOT LIVE: nothing sells the plan yet. Superadmin grants it for testing;
 * the in-app upsell shows the price with a Coming Soon button.
 */

// The rates live in lib/atlas-pricing.ts (no Prisma) so the marketing site
// and client components can quote them; re-exported here for the callers
// that only know the billing module.
export {
  ATLAS_TOKEN_CENTS,
  ATLAS_FREE_TOKENS,
  ATLAS_PLAN_TOKENS,
  ATLAS_PLAN_PRICE_CENTS,
  ATLAS_PRICING,
  formatTokens,
  formatPlanPrice,
  type AtlasPricing,
} from "@/lib/atlas-pricing";

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

// ── balances ─────────────────────────────────────────────────────────────────

/** What a meter looks like from the outside — free tier and plan agree. */
export type MeterBalance = {
  included: number;
  used: number;
  remaining: number;
  /** When the allowance refills. */
  refillsAt: Date;
  periodStart: Date;
  periodEnd: Date;
};

// ── free tier periods ────────────────────────────────────────────────────────

/**
 * The calendar month containing `now`, in UTC: the 1st at 00:00 through the
 * 1st of the next month. A few hours of timezone drift at the boundary
 * doesn't matter for a spend meter.
 */
export function freePeriod(now: Date = new Date()): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}

export type FreeCompany = {
  atlasFreePeriodStart: Date | null;
  atlasFreeTokensUsed: number;
};

/** The free tier's live balance — every company has one; a stale stored
 *  period (last month's) reads as a fresh allowance. */
export function freeBalance(company: FreeCompany, now: Date = new Date()): MeterBalance {
  const { start, end } = freePeriod(now);
  const current =
    !!company.atlasFreePeriodStart && company.atlasFreePeriodStart.getTime() >= start.getTime();
  const used = current ? Math.max(0, company.atlasFreeTokensUsed) : 0;
  return {
    included: ATLAS_FREE_TOKENS,
    used,
    remaining: Math.max(0, ATLAS_FREE_TOKENS - used),
    refillsAt: end,
    periodStart: start,
    periodEnd: end,
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

/** The plan's live balance, treating a stale stored period as a fresh one. */
export function planBalance(company: PlanCompany, now: Date = new Date()): MeterBalance | null {
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

export type MeterCompany = FreeCompany & PlanCompany;

/** Prisma select covering everything the meter needs. */
export const METER_SELECT = {
  atlasFreePeriodStart: true,
  atlasFreeTokensUsed: true,
  atlasPlanActiveAt: true,
  atlasPeriodStart: true,
  atlasPeriodTokensUsed: true,
} as const;

export type Debit = { level: "plan" | "free"; balance: MeterBalance };

/**
 * Add `tokens` to one meter's period counter, rolling the period forward
 * first if the stored one is stale. Two racing turns can't double-reset a
 * period: the rollover is a conditional write keyed on the old period
 * start, and the loser just increments on top.
 */
async function rollAndDebit(
  companyId: string,
  fields:
    | { start: "atlasFreePeriodStart"; used: "atlasFreeTokensUsed" }
    | { start: "atlasPeriodStart"; used: "atlasPeriodTokensUsed" },
  storedStart: Date | null,
  periodStart: Date,
  tokens: number
): Promise<void> {
  const stale = !storedStart || storedStart.getTime() < periodStart.getTime();
  if (stale) {
    const rolled = await prisma.company.updateMany({
      where: { id: companyId, [fields.start]: storedStart },
      data: { [fields.start]: periodStart, [fields.used]: tokens },
    });
    if (rolled.count > 0) return;
    // someone else rolled it first — just add ours on top
  }
  await prisma.company.update({
    where: { id: companyId },
    data: { [fields.used]: { increment: tokens } },
  });
}

/**
 * Debit a finished turn from whichever meter the company is on — the plan
 * when one is active, otherwise the free tier. Returns the post-debit
 * balance, or null when the company doesn't exist.
 */
export async function debitAtlasTokens(companyId: string, tokens: number): Promise<Debit | null> {
  const now = new Date();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: METER_SELECT });
  if (!company) return null;

  if (company.atlasPlanActiveAt) {
    const { start } = planPeriod(company.atlasPlanActiveAt, now);
    await rollAndDebit(
      companyId,
      { start: "atlasPeriodStart", used: "atlasPeriodTokensUsed" },
      company.atlasPeriodStart,
      start,
      tokens
    );
    const after = await prisma.company.findUnique({ where: { id: companyId }, select: METER_SELECT });
    const balance = after ? planBalance(after, now) : null;
    return balance ? { level: "plan", balance } : null;
  }

  const { start } = freePeriod(now);
  await rollAndDebit(
    companyId,
    { start: "atlasFreePeriodStart", used: "atlasFreeTokensUsed" },
    company.atlasFreePeriodStart,
    start,
    tokens
  );
  const after = await prisma.company.findUnique({ where: { id: companyId }, select: METER_SELECT });
  return after ? { level: "free", balance: freeBalance(after, now) } : null;
}

// ── ledger ───────────────────────────────────────────────────────────────────

/**
 * Record one turn in the ledger. Fire-and-forget like lib/usage.ts — the
 * meter must never fail the reply it rides along with.
 */
export function recordAssistantTurn(row: {
  companyId: string;
  userId: string;
  access: "free" | "plan" | "full";
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
