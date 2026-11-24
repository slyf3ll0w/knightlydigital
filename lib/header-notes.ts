/**
 * Header notes (David 2026-11-24: "make the software a little less
 * repetitive"). Under each page's title, one short line that changes from
 * visit to visit — a true, useful fact drawn from the company's own numbers
 * ("Clients usually approve in about 2 days", "Thursday is your busiest day
 * this week"). Every candidate is computed from real data and only offered
 * when there's enough data behind it; one is dealt at random per page load.
 * No AI, nothing invented: when nothing qualifies, the page shows no note.
 *
 * Each builder runs a handful of small, role-scoped aggregate queries (the
 * same scope helpers as the list pages), so a note never leaks what the
 * viewer can't see.
 */
import { prisma } from "@/lib/db";
import { money } from "@/lib/statuses";
import { invoiceBalance } from "@/lib/payments";
import { canSeeMoney, contactScope, jobScope, viaContactScope, type Actor } from "@/lib/permissions";
import { startOfMonthIn, zonedMidnight, zonedParts } from "@/lib/timezone";

export type NoteKind = "quotes" | "invoices" | "jobs" | "clients" | "requests" | "payments";

const DAY = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const round = (n: number) => Math.round(n * 10) / 10;
const days = (n: number) => {
  const r = n < 1.5 ? 1 : Math.round(n);
  return r === 1 ? "about a day" : `about ${r} days`;
};
const name = (c: { firstName: string; lastName: string } | null | undefined) =>
  c ? `${c.firstName} ${c.lastName}`.trim() || "a client" : "a client";

async function companyTz(companyId: string) {
  return (
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))?.timezone ??
    "America/Chicago"
  );
}

/** Deal one note. Never throws: a note is a nicety, never a reason a page fails. */
export async function headerNote(kind: NoteKind, actor: Actor): Promise<string | null> {
  try {
    const notes = (await builders[kind](actor)).filter((n): n is string => !!n);
    return notes.length ? notes[Math.floor(Math.random() * notes.length)] : null;
  } catch {
    return null;
  }
}

const builders: Record<NoteKind, (actor: Actor) => Promise<(string | null)[]>> = {
  async quotes(actor) {
    const companyId = actor.companyId;
    const scope = viaContactScope(actor);
    const since = new Date(Date.now() - 120 * DAY);
    const tz = await companyTz(companyId);
    const monthStart = startOfMonthIn(tz, new Date());
    const [decided, approvedTimes, biggest, oldest, monthQuoted] = await Promise.all([
      prisma.quote.groupBy({
        by: ["status"],
        where: { companyId, ...scope, sentAt: { gte: since }, status: { in: ["APPROVED", "CONVERTED", "ARCHIVED", "CHANGES_REQUESTED", "AWAITING_RESPONSE"] } },
        _count: true,
      }),
      prisma.quote.findMany({
        where: { companyId, ...scope, approvedAt: { gte: since }, sentAt: { not: null } },
        select: { sentAt: true, approvedAt: true },
        take: 200,
      }),
      prisma.quote.findFirst({
        where: { companyId, ...scope, status: "AWAITING_RESPONSE" },
        orderBy: { total: "desc" },
        select: { total: true, contact: { select: { firstName: true, lastName: true } } },
      }),
      prisma.quote.findFirst({
        where: { companyId, ...scope, status: "AWAITING_RESPONSE", sentAt: { not: null } },
        orderBy: { sentAt: "asc" },
        select: { sentAt: true, contact: { select: { firstName: true, lastName: true } } },
      }),
      prisma.quote.aggregate({ where: { companyId, ...scope, sentAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    ]);
    const n = (s: string) => decided.find((d) => d.status === s)?._count ?? 0;
    const won = n("APPROVED") + n("CONVERTED");
    const sent = won + n("ARCHIVED") + n("CHANGES_REQUESTED") + n("AWAITING_RESPONSE");
    const waits = approvedTimes
      .map((q) => (q.approvedAt!.getTime() - q.sentAt!.getTime()) / DAY)
      .filter((d) => d >= 0 && d < 90);
    const avgWait = waits.length >= 3 ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
    const oldestDays = oldest?.sentAt ? Math.floor((Date.now() - oldest.sentAt.getTime()) / DAY) : 0;
    const quotedThisMonth = Number(monthQuoted._sum.total ?? 0);
    return [
      sent >= 4 ? `You've won ${won} of your last ${sent} quotes.` : null,
      avgWait !== null ? `Clients usually approve in ${days(avgWait)}.` : null,
      biggest && Number(biggest.total) > 0 ? `Biggest one out: ${money(Number(biggest.total))} for ${name(biggest.contact)}.` : null,
      oldest && oldestDays >= 5 ? `${name(oldest.contact)}'s quote has waited ${oldestDays} days. A nudge might help.` : null,
      monthQuoted._count >= 2 && quotedThisMonth > 0 ? `${money(quotedThisMonth)} quoted so far this month.` : null,
    ];
  },

  async invoices(actor) {
    if (!canSeeMoney(actor)) return [];
    const companyId = actor.companyId;
    const scope = viaContactScope(actor);
    const tz = await companyTz(companyId);
    const monthStart = startOfMonthIn(tz, new Date());
    const [paidRecent, paidMonth, owing] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId, ...scope, status: "PAID", paidAt: { gte: new Date(Date.now() - 120 * DAY) }, issuedAt: { not: null } },
        select: { issuedAt: true, paidAt: true },
        take: 300,
      }),
      prisma.invoice.aggregate({ where: { companyId, ...scope, status: "PAID", paidAt: { gte: monthStart } }, _count: true, _sum: { total: true } }),
      prisma.invoice.findMany({
        where: { companyId, ...scope, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
        select: { total: true, payments: { select: { amount: true, surchargeAmount: true } }, contact: { select: { firstName: true, lastName: true } } },
        take: 300,
      }),
    ]);
    const waits = paidRecent
      .map((i) => (i.paidAt!.getTime() - i.issuedAt!.getTime()) / DAY)
      .filter((d) => d >= 0 && d < 120);
    const avg = waits.length >= 3 ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
    const top = owing.map((i) => ({ bal: invoiceBalance(i), c: i.contact })).sort((a, b) => b.bal - a.bal)[0];
    const sameDay = waits.filter((d) => d < 1).length;
    return [
      avg !== null ? `Clients pay you in ${days(avg)} on average.` : null,
      paidMonth._count >= 2 ? `${plural(paidMonth._count, "invoice", "invoices")} paid this month, ${money(Number(paidMonth._sum.total ?? 0))}.` : null,
      top && top.bal > 0 ? `Largest still owed: ${money(top.bal)} from ${name(top.c)}.` : null,
      waits.length >= 5 && sameDay >= 2 ? `${sameDay} of your last ${waits.length} invoices were paid the same day.` : null,
    ];
  },

  async jobs(actor) {
    const companyId = actor.companyId;
    const scope = jobScope(actor);
    const tz = await companyTz(companyId);
    const now = new Date();
    const local = zonedParts(tz, now);
    const monthStart = startOfMonthIn(tz, now);
    const lastMonthStart = zonedMidnight(tz, local.y, local.m - 1, 1);
    const lastMonthSamePoint = zonedMidnight(tz, local.y, local.m - 1, local.d + 1);
    const weekStart = zonedMidnight(tz, local.y, local.m, local.d - local.weekday);
    const weekEnd = zonedMidnight(tz, local.y, local.m, local.d - local.weekday + 7);
    const [doneThis, doneLast, week, byTech] = await Promise.all([
      prisma.job.count({ where: { companyId, ...scope, completedAt: { gte: monthStart } } }),
      prisma.job.count({ where: { companyId, ...scope, completedAt: { gte: lastMonthStart, lt: lastMonthSamePoint } } }),
      prisma.job.findMany({ where: { companyId, ...scope, scheduledAt: { gte: weekStart, lt: weekEnd } }, select: { scheduledAt: true }, take: 500 }),
      prisma.jobAssignment.groupBy({
        by: ["userId"],
        where: { job: { companyId, ...scope, completedAt: { gte: monthStart } } },
        _count: true,
        orderBy: { _count: { userId: "desc" } },
        take: 2,
      }),
    ]);
    const perDay = Array.from({ length: 7 }, () => 0);
    for (const j of week) if (j.scheduledAt) perDay[zonedParts(tz, j.scheduledAt).weekday] += 1;
    const busiest = perDay.indexOf(Math.max(...perDay));
    const topTech =
      byTech.length >= 2 && byTech[0]._count >= 3
        ? await prisma.user.findUnique({ where: { id: byTech[0].userId }, select: { name: true } })
        : null;
    const diff = doneThis - doneLast;
    return [
      doneThis >= 2
        ? diff > 0 && doneLast > 0
          ? `${plural(doneThis, "job", "jobs")} done this month, ${diff} more than this point last month.`
          : `${plural(doneThis, "job", "jobs")} done so far this month.`
        : null,
      week.length >= 4 && perDay[busiest] >= 2 ? `${WEEKDAYS[busiest]} is your busiest day this week (${perDay[busiest]} jobs).` : null,
      topTech?.name ? `${topTech.name.split(" ")[0]} has finished ${byTech[0]._count} jobs this month.` : null,
    ];
  },

  async clients(actor) {
    const companyId = actor.companyId;
    const scope = contactScope(actor);
    const tz = await companyTz(companyId);
    const monthStart = startOfMonthIn(tz, new Date());
    const [newThis, repeat, leadsWon] = await Promise.all([
      prisma.contact.count({ where: { companyId, ...scope, createdAt: { gte: monthStart }, status: "ACTIVE" } }),
      prisma.job.groupBy({ by: ["contactId"], where: { companyId, ...jobScope(actor) }, _count: true, having: { contactId: { _count: { gt: 1 } } } }),
      prisma.contact.count({ where: { companyId, ...scope, status: "ACTIVE", createdAt: { gte: new Date(Date.now() - 90 * DAY) } } }),
    ]);
    return [
      newThis >= 1 ? `${plural(newThis, "new client", "new clients")} so far this month.` : null,
      repeat.length >= 2 ? `${repeat.length} clients have booked you more than once.` : null,
      leadsWon >= 3 ? `${leadsWon} people became clients in the last 90 days.` : null,
    ];
  },

  async requests(actor) {
    const companyId = actor.companyId;
    const scope = viaContactScope(actor);
    const now = Date.now();
    const [thisWeek, lastWeek, sources] = await Promise.all([
      prisma.request.count({ where: { companyId, ...scope, createdAt: { gte: new Date(now - 7 * DAY) } } }),
      prisma.request.count({ where: { companyId, ...scope, createdAt: { gte: new Date(now - 14 * DAY), lt: new Date(now - 7 * DAY) } } }),
      prisma.request.groupBy({
        by: ["source"],
        where: { companyId, ...scope, createdAt: { gte: new Date(now - 30 * DAY) } },
        _count: true,
        orderBy: { _count: { source: "desc" } },
        take: 1,
      }),
    ]);
    const label: Record<string, string> = {
      booking_form: "your booking page",
      estimate_form: "your website estimate form",
      client_hub: "your client portal",
      webhook: "your connected lead sources",
      internal: "you adding them by hand",
    };
    const top = sources[0];
    return [
      thisWeek >= 2 && lastWeek > 0 && thisWeek !== lastWeek
        ? `${plural(thisWeek, "request", "requests")} this week, ${thisWeek > lastWeek ? "up" : "down"} from ${lastWeek} the week before.`
        : thisWeek >= 2
          ? `${plural(thisWeek, "request", "requests")} came in this week.`
          : null,
      top && top._count >= 3 && top.source !== "internal" ? `Most requests this month came from ${label[top.source] ?? top.source} (${top._count}).` : null,
    ];
  },

  async payments(actor) {
    if (!canSeeMoney(actor)) return [];
    const companyId = actor.companyId;
    const tz = await companyTz(companyId);
    const monthStart = startOfMonthIn(tz, new Date());
    const pays = await prisma.payment.findMany({
      where: { companyId, paidAt: { gte: monthStart }, amount: { gt: 0 } },
      select: { amount: true, paidAt: true },
      take: 1000,
    });
    if (pays.length < 2) return [];
    const byDay = new Map<string, number>();
    for (const p of pays) {
      const d = zonedParts(tz, p.paidAt);
      const k = `${d.m}/${d.d}`;
      byDay.set(k, (byDay.get(k) ?? 0) + Number(p.amount));
    }
    const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = pays.reduce((s, p) => s + Number(p.amount), 0);
    const monthName = new Date().toLocaleDateString("en-US", { month: "long", timeZone: tz });
    const [bm, bd] = best[0].split("/").map(Number);
    const bestLabel = new Date(Date.UTC(2000, bm - 1, bd)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return [
      byDay.size >= 3 ? `Your best day this month was ${bestLabel} (${money(round(best[1]))}).` : null,
      `Average payment in ${monthName}: ${money(round(total / pays.length))}.`,
    ];
  },
};
