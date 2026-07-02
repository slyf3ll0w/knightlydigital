import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope } from "@/lib/permissions";
import ContactForm from "../../ContactForm";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
  });
  if (!contact) notFound();

  return (
    <ContactForm
      mode="edit"
      contactId={contact.id}
      initial={{
        firstName: contact.firstName,
        lastName: contact.lastName,
        companyName: contact.companyName ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        address: contact.address ?? "",
        city: contact.city ?? "",
        state: contact.state ?? "",
        zip: contact.zip ?? "",
        notes: contact.notes ?? "",
        leadSource: contact.leadSource ?? "",
        paymentTermsDays: contact.paymentTermsDays,
        status: contact.status,
        customFields: (contact.customFields as Record<string, string>) ?? {},
      }}
    />
  );
}
