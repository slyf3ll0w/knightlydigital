import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, isManager } from "@/lib/permissions";
import SubscriptionsClient from "./SubscriptionsClient";

export const metadata: Metadata = { title: "Recurring" };

export default async function SubscriptionsPage() {
  const actor = await requirePageActor((a) => canSeeMoney(a));

  const [subs, team, readyJobs, company] = await Promise.all([
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
    // invoiced yet (directly or via a consolidated invoice). Any series
    // status — a visit finished before the series was paused or cancelled
    // is still owed, and billAllReadyWork bills it.
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        completedAt: { not: null },
        invoice: { is: null },
        consolidatedInvoiceId: null,
        subscription: { is: { billPerVisit: true } },
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
    // Service fee switch: autopay charges carry the card surcharge, and the
    // page says so next to every "charged to the card on file".
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { surchargeEnabled: true, surchargeRate: true } }),
  ]);
  const surchargePct =
    company?.surchargeEnabled && company.surchargeRate != null && Number(company.surchargeRate) > 0
      ? Math.round(Number(company.surchargeRate) * 1000) / 10
      : null;

  return (
    <SubscriptionsClient
      initialSubs={JSON.parse(JSON.stringify(subs))}
      readyJobs={JSON.parse(JSON.stringify(readyJobs))}
      team={team}
      canManage={isManager(actor.role)}
      surchargePct={surchargePct}
    />
  );
}
