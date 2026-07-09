import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { unreadByThread } from "@/lib/chat";

/**
 * Sidebar badge counts: new requests + past-due invoices, role-scoped the
 * same way the list pages are. Past-due includes overdue AWAITING_PAYMENT
 * invoices that haven't been lazily flipped by the invoices page yet.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = viaContactScope(actor);
  const [requests, pastDue, chat] = await Promise.all([
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
    // Team chat unread: channel + DMs, each against its own read marker
    unreadByThread(actor).then(
      (u) => u.company + Object.values(u.dms).reduce((s, n) => s + n, 0)
    ),
  ]);

  return NextResponse.json({ requests, pastDue, chat });
}
