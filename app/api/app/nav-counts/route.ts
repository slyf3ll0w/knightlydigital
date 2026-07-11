import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, canSeeMoney, contactScope, viaContactScope } from "@/lib/permissions";
import { totalUnread } from "@/lib/chat";

/**
 * Sidebar badge counts: new requests + past-due invoices, role-scoped the
 * same way the list pages are. Past-due includes overdue AWAITING_PAYMENT
 * invoices that haven't been lazily flipped by the invoices page yet.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = viaContactScope(actor);
  const [requests, pastDue, chat, leads] = await Promise.all([
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
              { status: "AWAITING_PAYMENT", dueDate: { lt: new Date() } },
            ],
          },
        })
      : Promise.resolve(0),
    // Team chat unread across every channel the actor belongs to
    totalUnread(actor),
    // Leads badge: cards sitting in the board's entry (first) stage. Before
    // the board is first opened (no stages yet), unstaged leads count.
    canSell(actor.role)
      ? prisma.pipelineStage
          .findFirst({
            where: { companyId: actor.companyId, isConverted: false },
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          })
          .then((first) =>
            prisma.contact.count({
              where: {
                companyId: actor.companyId,
                ...contactScope(actor),
                ...(first
                  ? { pipelineStageId: first.id }
                  : { status: "LEAD", pipelineStageId: null }),
              },
            })
          )
      : Promise.resolve(0),
  ]);

  return NextResponse.json({ requests, pastDue, chat, leads });
}
