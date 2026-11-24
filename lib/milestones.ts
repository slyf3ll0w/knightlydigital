/**
 * Milestone moments (David 2026-11-24, "less repetitive", idea 3): small,
 * rare celebrations on Home when something real happens in the business —
 * a first $10k month, the best month yet, the 100th job, the 50th client, a
 * quote approved within the hour, an invoice paid the day it went out.
 *
 * Every milestone is detected from real records, only while it's fresh, and
 * shown to each person ONCE: it reuses the per-user CelebrationSeen table
 * (kind MILESTONE, entityId = the milestone's key), stamped by
 * POST /api/app/milestones/seen when the card has been on screen. At most
 * one milestone shows per visit — the biggest one waiting. Role-scoped like
 * the header notes (money milestones only for people who see money), and it
 * never throws: a milestone is a nicety, never a reason Home fails.
 */
import { prisma } from "@/lib/db";
import { money } from "@/lib/statuses";
import { canSeeMoney, canSell, viaContactScope, type Actor } from "@/lib/permissions";
import { zonedParts } from "@/lib/timezone";

export type Milestone = {
  /** CelebrationSeen.entityId — also the dedupe key */
  key: string;
  /** what kind of moment, for the badge glyph */
  kind: "money" | "record" | "jobs" | "clients" | "fast";
  /** the short label over the line ("Best month yet") */
  label: string;
  /** one plain sentence with the real numbers */
  line: string;
};

const DAY = 86_400_000;
const FRESH = 14 * DAY;
const MONTH_THRESHOLDS = [10_000, 25_000, 50_000, 100_000, 250_000];
const JOB_THRESHOLDS = [100, 250, 500, 1000, 2500, 5000];
const CLIENT_THRESHOLDS = [50, 100, 250, 500, 1000, 2500];
const KEY_RE = /^[a-z-]+:[A-Za-z0-9_-]{1,64}$/;

export const isMilestoneKey = (k: unknown): k is string => typeof k === "string" && KEY_RE.test(k);

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n.toLocaleString("en-US")}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
};

/** The biggest unseen milestone for this person, or null. */
export async function nextMilestone(actor: Actor): Promise<Milestone | null> {
  try {
    const candidates = await detect(actor);
    if (candidates.length === 0) return null;
    const seen = await prisma.celebrationSeen.findMany({
      where: { userId: actor.id, kind: "MILESTONE", entityId: { in: candidates.map((c) => c.key) } },
      select: { entityId: true },
    });
    const done = new Set(seen.map((s) => s.entityId));
    return candidates.find((c) => !done.has(c.key)) ?? null;
  } catch {
    return null;
  }
}

/** Every milestone that's true and fresh right now, biggest first. */
async function detect(actor: Actor): Promise<Milestone[]> {
  const companyId = actor.companyId;
  const out: Milestone[] = [];
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))?.timezone ??
    "America/Chicago";
  const now = new Date();
  const local = zonedParts(tz, now);
  const thisMonth = `${local.y}-${String(local.m).padStart(2, "0")}`;

  // ── money: the month so far against every month before it ──
  if (canSeeMoney(actor)) {
    const months = await prisma.$queryRaw<{ m: string; total: number }[]>`
      SELECT to_char(date_trunc('month', ("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM') AS m,
             SUM("amount")::float AS total
      FROM "Payment"
      WHERE "companyId" = ${companyId} AND "amount" > 0
      GROUP BY 1`;
    const current = months.find((r) => r.m === thisMonth)?.total ?? 0;
    const before = months.filter((r) => r.m < thisMonth);
    const record = before.reduce((best, r) => (r.total > best.total ? r : best), { m: "", total: 0 });
    // a first $10k / $25k / … month: this month crossed it, no month before did
    const crossed = MONTH_THRESHOLDS.filter((t) => current >= t && record.total < t).pop();
    if (crossed) {
      out.push({
        key: `month-${crossed}:${thisMonth}`,
        kind: "money",
        label: `Your first ${money(crossed).replace(".00", "")} month`,
        line: `${money(current)} collected in ${monthName(thisMonth)} so far, more than any month before it.`,
      });
    } else if (before.length >= 3 && record.total > 0 && current > record.total) {
      out.push({
        key: `best-month:${thisMonth}`,
        kind: "record",
        label: "Best month yet",
        line: `${money(current)} collected in ${monthName(thisMonth)}, ${money(current - record.total)} more than your old record (${monthLabel(record.m)}).`,
      });
    }
  }

  // ── jobs: the 100th / 250th / … job finished, while it's fresh ──
  const doneJobs = await prisma.job.count({ where: { companyId, completedAt: { not: null } } });
  const jobMark = JOB_THRESHOLDS.filter((t) => doneJobs >= t).pop();
  if (jobMark) {
    const nth = await prisma.job.findFirst({
      where: { companyId, completedAt: { not: null } },
      orderBy: { completedAt: "asc" },
      skip: jobMark - 1,
      select: { completedAt: true },
    });
    if (nth?.completedAt && now.getTime() - nth.completedAt.getTime() < FRESH) {
      out.push({
        key: `jobs:${jobMark}`,
        kind: "jobs",
        label: `Your ${ordinal(jobMark)} job`,
        line: `${ordinal(jobMark)} job finished in WorkBench. That's ${doneJobs.toLocaleString("en-US")} done in all.`,
      });
    }
  }

  // ── clients: the 50th / 100th / … client, while it's fresh ──
  if (canSell(actor.role)) {
    const clients = await prisma.contact.count({ where: { companyId, status: "ACTIVE" } });
    const clientMark = CLIENT_THRESHOLDS.filter((t) => clients >= t).pop();
    if (clientMark) {
      const nth = await prisma.contact.findFirst({
        where: { companyId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        skip: clientMark - 1,
        select: { createdAt: true },
      });
      if (nth && now.getTime() - nth.createdAt.getTime() < FRESH) {
        out.push({
          key: `clients:${clientMark}`,
          kind: "clients",
          label: `${clientMark.toLocaleString("en-US")} clients`,
          line: `You now work for ${clients.toLocaleString("en-US")} clients. The ${ordinal(clientMark)} joined this month.`,
        });
      }
    }
  }

  // ── quick wins: a quote approved within the hour (once a month) ──
  if (canSell(actor.role)) {
    const recent = await prisma.quote.findMany({
      where: { companyId, ...viaContactScope(actor), approvedAt: { gte: new Date(now.getTime() - 3 * DAY) }, sentAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 20,
      select: { approvedAt: true, sentAt: true, total: true, contact: { select: { firstName: true, lastName: true } } },
    });
    const fast = recent.find((q) => q.approvedAt!.getTime() - q.sentAt!.getTime() <= 60 * 60 * 1000 && q.approvedAt! >= q.sentAt!);
    if (fast) {
      const mins = Math.max(1, Math.round((fast.approvedAt!.getTime() - fast.sentAt!.getTime()) / 60000));
      const who = fast.contact ? `${fast.contact.firstName} ${fast.contact.lastName}`.trim() : "A client";
      out.push({
        key: `fast-approve:${thisMonth}`,
        kind: "fast",
        label: "Approved within the hour",
        line: `${who} approved a ${money(Number(fast.total))} quote ${mins} ${mins === 1 ? "minute" : "minutes"} after you sent it.`,
      });
    }
  }

  // ── quick wins: an invoice paid the same day it went out (once a month) ──
  if (canSeeMoney(actor)) {
    const paid = await prisma.invoice.findMany({
      where: { companyId, ...viaContactScope(actor), status: "PAID", paidAt: { gte: new Date(now.getTime() - 3 * DAY) }, issuedAt: { not: null } },
      orderBy: { paidAt: "desc" },
      take: 20,
      select: { paidAt: true, issuedAt: true, total: true, contact: { select: { firstName: true, lastName: true } } },
    });
    const sameDay = paid.find((i) => {
      const a = zonedParts(tz, i.issuedAt!);
      const b = zonedParts(tz, i.paidAt!);
      return a.y === b.y && a.m === b.m && a.d === b.d;
    });
    if (sameDay) {
      const who = sameDay.contact ? `${sameDay.contact.firstName} ${sameDay.contact.lastName}`.trim() : "A client";
      out.push({
        key: `same-day:${thisMonth}`,
        kind: "fast",
        label: "Paid the same day",
        line: `${who} paid ${money(Number(sameDay.total))} the day you sent the invoice.`,
      });
    }
  }

  return out;
}
