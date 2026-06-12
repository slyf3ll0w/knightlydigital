import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope, viaContactScope } from "@/lib/permissions";
import QuoteEditor from "../QuoteEditor";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;
  const [quote, contacts, workItems] = await Promise.all([
    prisma.quote.findFirst({
      where: { id, companyId, ...viaContactScope(actor) },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!quote) notFound();

  // Editable only before the client responds; locked once they request
  // changes, approve, or it converts
  if (quote.status !== "DRAFT" && quote.status !== "AWAITING_RESPONSE") {
    redirect(`/app/quotes/${quote.id}`);
  }

  return (
    <QuoteEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      existingQuote={{
        id: quote.id,
        contactId: quote.contactId,
        title: quote.title ?? "",
        taxRate: quote.taxRate ? Number(quote.taxRate) : null,
        discountType: quote.discountType as "NONE" | "PERCENT" | "FIXED",
        discountValue: quote.discountValue ? Number(quote.discountValue) : null,
        depositType: quote.depositType as "NONE" | "PERCENT" | "FIXED",
        depositValue: quote.depositValue ? Number(quote.depositValue) : null,
        clientMessage: quote.clientMessage ?? "",
        disclaimer: quote.disclaimer ?? "",
        lineItems: quote.lineItems.map((li) => ({
          name: li.name,
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          unitCost: li.unitCost != null ? Number(li.unitCost) : null,
          isOptional: li.isOptional,
          requiresAgreement: li.requiresAgreement,
        })),
      }}
    />
  );
}
