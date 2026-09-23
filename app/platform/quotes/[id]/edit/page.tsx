import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope, viaContactScope } from "@/lib/permissions";
import QuoteEditor from "../QuoteEditor";
import { ESTIMATOR_SELECT, runnerEstimators } from "@/lib/estimator-server";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;
  const [quote, contacts, workItems, estimatorRows, company] = await Promise.all([
    prisma.quote.findFirst({
      where: { id, companyId, ...viaContactScope(actor) },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { addresses: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.estimator.findMany({ where: { companyId, isActive: true }, select: ESTIMATOR_SELECT, orderBy: { name: "asc" } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }),
  ]);
  if (!quote) notFound();
  const tz = company?.timezone ?? "America/Chicago";

  // Editable until the client signs off — approved/converted/archived
  // quotes are locked (change requests are exactly when edits happen)
  if (!["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(quote.status)) {
    redirect(`/app/quotes/${quote.id}`);
  }

  return (
    <QuoteEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      estimators={runnerEstimators(estimatorRows)}
      existingQuote={{
        id: quote.id,
        contactId: quote.contactId,
        propertyId: quote.propertyId ?? "",
        title: quote.title ?? "",
        taxRate: quote.taxRate ? Number(quote.taxRate) : null,
        discountType: quote.discountType as "NONE" | "PERCENT" | "FIXED",
        discountValue: quote.discountValue ? Number(quote.discountValue) : null,
        depositType: quote.depositType as "NONE" | "PERCENT" | "FIXED",
        depositValue: quote.depositValue ? Number(quote.depositValue) : null,
        clientMessage: quote.clientMessage ?? "",
        disclaimer: quote.disclaimer ?? "",
        notes: quote.notes ?? "",
        // The date input's value: the company's calendar day, not the UTC one
        validUntil: quote.validUntil
          ? quote.validUntil.toLocaleDateString("en-CA", { timeZone: tz })
          : null,
        lineItems: quote.lineItems.map((li) => ({
          name: li.name,
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          unitCost: li.unitCost != null ? Number(li.unitCost) : null,
          isOptional: li.isOptional,
          requiresAgreement: li.requiresAgreement,
          workItemId: li.workItemId,
          recurringInterval: li.recurringInterval,
        })),
      }}
    />
  );
}
