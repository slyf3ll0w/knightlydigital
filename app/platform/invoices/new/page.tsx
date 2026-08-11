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

  const [contacts, workItems, company, job] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultTaxRate: true },
    }),
    jobId
      ? prisma.job.findFirst({
          where: { id: jobId, companyId, ...viaContactScope(actor) },
          include: {
            contact: true,
            lineItems: { orderBy: { sortOrder: "asc" } },
            quote: {
              include: {
                // Services the client opted out of on the quote must not
                // reappear on the bill when the quote is the prefill source
                lineItems: {
                  where: { OR: [{ isOptional: false }, { optedOut: false }] },
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
        })
      : null,
  ]);

  const defaultTaxRatePercent = company?.defaultTaxRate
    ? String(Math.round(Number(company.defaultTaxRate) * 100000) / 1000)
    : "";

  return (
    <InvoiceEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefillJob={job ? JSON.parse(JSON.stringify(job)) : null}
      prefilledContactId={contactId ?? ""}
      defaultTaxRatePercent={defaultTaxRatePercent}
    />
  );
}
