import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, isManager } from "@/lib/permissions";
import SubscriptionsClient from "./SubscriptionsClient";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const actor = await requirePageActor((a) => canSeeMoney(a));

  const subs = await prisma.subscription.findMany({
    where: { companyId: actor.companyId },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
  });

  return (
    <SubscriptionsClient
      initialSubs={JSON.parse(JSON.stringify(subs))}
      canManage={isManager(actor.role)}
    />
  );
}
