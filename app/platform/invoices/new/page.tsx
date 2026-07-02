import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, contactScope, viaContactScope } from "@/lib/permissions";
import InvoiceEditor from "./InvoiceEditor";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; contactId?: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { jobId, contactId } = await searchParams;

  const [contacts, workItems, job] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    jobId
      ? prisma.job.findFirst({
          where: { id: jobId, companyId, ...viaContactScope(actor) },
          include: {
            contact: true,
            lineItems: { orderBy: { sortOrder: "asc" } },
            quote: { include: { lineItems: true } },
          },
        })
      : null,
  ]);

  return (
    <InvoiceEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefillJob={job ? JSON.parse(JSON.stringify(job)) : null}
      prefilledContactId={contactId ?? ""}
    />
  );
}
