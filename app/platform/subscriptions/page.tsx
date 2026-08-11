import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, isManager } from "@/lib/permissions";
import SubscriptionsClient from "./SubscriptionsClient";

export const metadata: Metadata = { title: "Recurring" };

export default async function SubscriptionsPage() {
  const actor = await requirePageActor((a) => canSeeMoney(a));

  const [subs, team, readyJobs] = await Promise.all([
    prisma.subscription.findMany({
      where: { companyId: actor.companyId },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            // For the autopay-card picker in the edit form
            savedCards: {
              select: { id: true, label: true, isDefault: true },
              orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
    }),
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // The Ready-to-bill queue: completed per-visit-series work nothing has
    // invoiced yet (directly or via a consolidated invoice)
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        completedAt: { not: null },
        invoice: { is: null },
        consolidatedInvoiceId: null,
        subscription: { is: { billPerVisit: true, status: { not: "CANCELLED" } } },
      },
      select: {
        id: true,
        title: true,
        completedAt: true,
        scheduledAt: true,
        contact: { select: { id: true, firstName: true, lastName: true } },
        subscription: { select: { id: true, name: true, unitPrice: true, quantity: true } },
      },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  return (
    <SubscriptionsClient
      initialSubs={JSON.parse(JSON.stringify(subs))}
      readyJobs={JSON.parse(JSON.stringify(readyJobs))}
      team={team}
      canManage={isManager(actor.role)}
    />
  );
}
