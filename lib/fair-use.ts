import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { notifyUsers } from "@/lib/push";
import { limit } from "@/lib/rate-limit";
import { DISPATCH_FAIR_USE_MINUTES, DISPATCH_FAIR_USE_TEXTS } from "@/lib/plans";

/**
 * The Voice plan's fair-use ceiling, enforced (readiness review 2026-11-02:
 * it had only ever been copy). "Unlimited talk and text" means up to
 * DISPATCH_FAIR_USE_TEXTS outbound texts and DISPATCH_FAIR_USE_MINUTES
 * minutes of talk a calendar month (lib/plans.ts; the pricing page, Help
 * and Terms all read those constants). Past the ceiling the line pauses
 * for the rest of the month — outbound texts and calls from the business
 * number are refused with a plain message, inbound keeps working — and
 * the owners are told at 80% and at the ceiling (once each per month).
 * Overage billing (3¢ a text / minute) is NOT built; the ceiling is a hard
 * stop so the plan can never cost more than it sells for. A superadmin can
 * lift it for one company with Company.fairUseWaived (planGrants carry it
 * as "FAIR_USE" until a column exists).
 *
 * Minutes = Call.durationSec summed per month, in or out (both legs ride the
 * platform's account). Texts = CompanyUsageDaily.smsSent (outbound sends).
 * Pure parts (`fairUseVerdict`) are unit-tested in scripts/test-fixes-nov2.ts.
 */

export type FairUseKind = "texts" | "minutes";
export type FairUseVerdict = { ok: boolean; used: number; cap: number; pct: number; warn: boolean };

export function fairUseVerdict(used: number, cap: number): FairUseVerdict {
  const pct = cap > 0 ? used / cap : 0;
  return { ok: cap <= 0 || used < cap, used, cap, pct, warn: pct >= 0.8 };
}

export const FAIR_USE_TEXT_MESSAGE = `This month's texting allowance (${DISPATCH_FAIR_USE_TEXTS.toLocaleString("en-US")} texts) has been used. Texting from the business line starts again on the 1st.`;
export const FAIR_USE_CALL_MESSAGE = `This month's calling allowance (${DISPATCH_FAIR_USE_MINUTES.toLocaleString("en-US")} minutes) has been used. Calls from the business line start again on the 1st; your cell still works.`;

function monthBounds(now: Date): { start: Date; end: Date; key: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}` };
}

async function waived(companyId: string): Promise<boolean> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { planGrants: true } });
  return Boolean(c?.planGrants.includes("FAIR_USE"));
}

/** Outbound texts sent this month (CompanyUsageDaily.smsSent). */
export async function textsThisMonth(companyId: string, now: Date = new Date()): Promise<number> {
  const { key } = monthBounds(now);
  const rows = await prisma.companyUsageDaily.aggregate({
    where: { companyId, day: { startsWith: key } },
    _sum: { smsSent: true },
  });
  return rows._sum.smsSent ?? 0;
}

/** Talk minutes this month (Call.durationSec, any direction), rounded up per call like a carrier does. */
export async function minutesThisMonth(companyId: string, now: Date = new Date()): Promise<number> {
  const { start, end } = monthBounds(now);
  const calls = await prisma.call.findMany({
    where: { companyId, createdAt: { gte: start, lt: end }, durationSec: { gt: 0 } },
    select: { durationSec: true },
  });
  return calls.reduce((s, c) => s + Math.ceil((c.durationSec ?? 0) / 60), 0);
}

/**
 * May this company send one more text / start one more call this month?
 * Never throws; a read failure answers ok (a metering hiccup must not stop
 * a business from working).
 */
export async function checkFairUse(companyId: string, kind: FairUseKind, now: Date = new Date()): Promise<FairUseVerdict> {
  const cap = kind === "texts" ? DISPATCH_FAIR_USE_TEXTS : DISPATCH_FAIR_USE_MINUTES;
  try {
    if (await waived(companyId)) return { ok: true, used: 0, cap, pct: 0, warn: false };
    const used = kind === "texts" ? await textsThisMonth(companyId, now) : await minutesThisMonth(companyId, now);
    const v = fairUseVerdict(used, cap);
    if (v.warn) void warnOwners(companyId, kind, v, now);
    return v;
  } catch (err) {
    reportError("[fair-use] check failed", companyId, kind, err);
    return { ok: true, used: 0, cap, pct: 0, warn: false };
  }
}

/** Owners hear once at 80% and once at the ceiling, per month and kind (deduped through the rate-limit store). */
async function warnOwners(companyId: string, kind: FairUseKind, v: FairUseVerdict, now: Date): Promise<void> {
  const stage = v.ok ? "80" : "100";
  const { key } = monthBounds(now);
  const gate = await limit(`fair-use:${companyId}:${kind}:${key}:${stage}`, 1, 40 * 86_400_000);
  if (!gate.ok) return;
  const owners = await prisma.user.findMany({ where: { companyId, role: "OWNER", isActive: true }, select: { id: true } });
  const what = kind === "texts" ? "texts" : "talk minutes";
  await notifyUsers(
    owners.map((o) => o.id),
    {
      title: v.ok ? `Business line: ${Math.round(v.pct * 100)}% of this month's ${what} used` : `Business line paused for ${what} until the 1st`,
      body: v.ok
        ? `${v.used.toLocaleString("en-US")} of ${v.cap.toLocaleString("en-US")} ${what} so far this month. At the ceiling, ${kind === "texts" ? "texting" : "calling"} from the line pauses until next month.`
        : `${v.used.toLocaleString("en-US")} ${what} this month — the Voice plan's fair-use ceiling. ${kind === "texts" ? "Texts" : "Calls"} from the business number resume on the 1st.`,
      url: "/app/settings/plans",
      tag: `fair-use-${kind}-${stage}`,
    }
  ).catch((e) => reportError("[fair-use] owner notice failed", companyId, e));
}
