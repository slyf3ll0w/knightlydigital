import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager, contactScope } from "@/lib/permissions";
import NewSeriesForm from "./NewSeriesForm";

export const metadata: Metadata = { title: "New recurring plan" };

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const { contactId } = await searchParams;

  const [contacts, team, services] = await Promise.all([
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
    // Price book → tap-to-pick chips (name, visit length, price in one tap)
    prisma.workItem.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true, description: true, unitPrice: true, durationMinutes: true, recurringInterval: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <NewSeriesForm
      contacts={contacts}
      team={team}
      services={services.map((s) => ({ ...s, unitPrice: Number(s.unitPrice) }))}
      prefilledContactId={contactId ?? ""}
    />
  );
}
