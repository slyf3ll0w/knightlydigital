import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, isManager } from "@/lib/permissions";
import SubscriptionsClient from "./SubscriptionsClient";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const actor = await requirePageActor((a) => canSeeMoney(a));

  const [subs, team] = await Promise.all([
    prisma.subscription.findMany({
      where: { companyId: actor.companyId },
      include: { contact: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
    }),
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <SubscriptionsClient
      initialSubs={JSON.parse(JSON.stringify(subs))}
      team={team}
      canManage={isManager(actor.role)}
    />
  );
}
