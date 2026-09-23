import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, contactScope } from "@/lib/permissions";
import NewContractForm from "./NewContractForm";

export const metadata: Metadata = { title: "New Agreement" };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const { contactId } = await searchParams;

  const [contacts, templates] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId: actor.companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.contractTemplate.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true, body: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <NewContractForm
      contacts={contacts}
      templates={templates}
      prefilledContactId={contactId ?? ""}
      // Opened from a client page → back to that client; otherwise the list
      backHref={contactId ? `/app/contacts/${contactId}` : "/app/contracts"}
      canManageTemplates={isManager(actor.role)}
    />
  );
}
