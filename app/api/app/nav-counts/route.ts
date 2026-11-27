import { firstStageIds } from "@/lib/pipeline";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, canSeeMoney, contactScope, viaContactScope, jobScope } from "@/lib/permissions";
import { invoiceBalance } from "@/lib/payments";
import { startOfDayIn, zonedMidnight, zonedParts } from "@/lib/timezone";
import { totalUnread } from "@/lib/chat";
import { pastDueFilter } from "@/lib/due-dates";
import { notesVersion } from "@/lib/sticky-notes";

/**
 * Sidebar badge counts: new requests + past-due invoices, role-scoped the
 * same way the list pages are. Past-due includes overdue AWAITING_PAYMENT
 * invoices that haven't been lazily flipped by the invoices page yet.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = viaContactScope(actor);
  const [requests, pastDue, chat, leads, messages, tasks, notes] = await Promise.all([
    canSell(actor.role)
      ? prisma.request.count({
          where: { companyId: actor.companyId, status: "NEW", ...scope },
        })
      : Promise.resolve(0),
    canSeeMoney(actor)
      ? prisma.invoice.count({
          where: {
            companyId: actor.companyId,
            ...scope,
            OR: [
              { status: "PAST_DUE" },
              { status: "AWAITING_PAYMENT", dueDate: pastDueFilter() },
            ],
          },
        })
      : Promise.resolve(0),
    // Team chat unread across every channel the actor belongs to
    totalUnread(actor),
    // Leads badge: cards sitting in the entry (first) stage of any board.
    // Before the board is first opened (no stages yet), unstaged leads count.
    canSell(actor.role)
      ? firstStageIds(prisma, actor.companyId)
          .then((first) =>
            prisma.contact.count({
              where: {
                companyId: actor.companyId,
                ...contactScope(actor),
                ...(first.length
                  ? { pipelineStageId: { in: first } }
                  : { status: "LEAD", pipelineStageId: null }),
              },
            })
          )
      : Promise.resolve(0),
    // Client messages the team hasn't opened (portal thread inbox)
    canSell(actor.role)
      ? prisma.portalMessage.count({
          where: {
            companyId: actor.companyId,
            direction: "INBOUND",
            readByTeamAt: null,
            ...scope,
          },
        })
      : Promise.resolve(0),
    // Tasks badge: the actor's open tasks that are due (today or earlier).
    // Date-only tasks store local midnight, so `dueAt <= now` reads as
    // "today or overdue" for both kinds.
    prisma.task.count({
      where: { companyId: actor.companyId, assigneeId: actor.id, doneAt: null, dueAt: { lte: new Date() } },
    }),
    // Sticky notes: the newest touch among the notes this viewer can see —
    // Home refetches its board when this moves (team notes, no websockets)
    notesVersion(actor),
  ]);

  // The Live sidebar (2026-11-24): what's waiting beside a page — jobs on
  // today (company calendar, same rule as Home's Today), quotes out with
  // clients, jobs done and waiting on an invoice, and the money owed.
  // Role-scoped like the list pages; money is null for roles without it.
  const tz =
    (await prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }))?.timezone ??
    "America/Chicago";
  const now = new Date();
  const local = zonedParts(tz, now);
  const dayStart = startOfDayIn(tz, now);
  const dayEnd = zonedMidnight(tz, local.y, local.m, local.d + 1);
  const money = canSeeMoney(actor);
  const [jobsToday, quotesWaiting, toInvoice, owedInvoices] = await Promise.all([
    prisma.job.count({
      where: { companyId: actor.companyId, ...jobScope(actor), scheduledAt: { gte: dayStart, lt: dayEnd } },
    }),
    canSell(actor.role)
      ? prisma.quote.count({ where: { companyId: actor.companyId, ...scope, status: "AWAITING_RESPONSE" } })
      : Promise.resolve(0),
    money
      ? prisma.job.count({ where: { companyId: actor.companyId, ...jobScope(actor), status: "REQUIRES_INVOICING" } })
      : Promise.resolve(0),
    money
      ? prisma.invoice.findMany({
          where: { companyId: actor.companyId, ...scope, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
          select: { total: true, payments: { select: { amount: true, surchargeAmount: true } } },
        })
      : Promise.resolve([]),
  ]);
  const owed = money
    ? Math.round(owedInvoices.reduce((s, inv) => s + Math.max(0, invoiceBalance(inv)), 0) * 100) / 100
    : null;

  return NextResponse.json({
    requests,
    pastDue,
    chat,
    leads,
    messages,
    tasks,
    notesVersion: notes,
    jobsToday,
    quotesWaiting,
    toInvoice,
    owed,
  });
}
