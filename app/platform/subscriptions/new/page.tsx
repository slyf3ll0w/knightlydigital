import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager, contactScope } from "@/lib/permissions";
import NewSeriesForm from "./NewSeriesForm";

export const metadata: Metadata = { title: "New Recurring Series" };

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const { contactId } = await searchParams;

  const [contacts, team] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId: actor.companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        addresses: {
          orderBy: { createdAt: "asc" },
          select: { id: true, label: true, address: true, city: true, state: true, zip: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <NewSeriesForm contacts={contacts} team={team} prefilledContactId={contactId ?? ""} />;
}
