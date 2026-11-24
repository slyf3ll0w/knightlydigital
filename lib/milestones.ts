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
const KEY_RE = /^[a-z-]+:[A-Za-z0-9_-]{1,64}$/;

export const isMilestoneKey = (k: unknown): k is string => typeof k === "string" && KEY_RE.test(k);


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

  // Money totals and job/client counts were removed (David 2026-11-24): a
  // company's history before WorkBench isn't here, so "your first $10k month"
  // or "your 100th job" can be false. Only moments that truly happened in
  // WorkBench remain.

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
