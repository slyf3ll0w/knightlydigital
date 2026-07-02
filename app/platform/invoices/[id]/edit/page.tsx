import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import InvoiceEditor from "../../new/InvoiceEditor";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { id } = await params;
  const [invoice, workItems] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, companyId, ...viaContactScope(actor) },
      include: { contact: true, lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!invoice) notFound();

  // Paid invoices are locked — the detail page offers Re-open
  if (invoice.status === "PAID") redirect(`/app/invoices/${invoice.id}`);

  return (
    <InvoiceEditor
      contacts={[]}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefillJob={null}
      editInvoice={{
        id: invoice.id,
        subject: invoice.subject ?? "",
        notes: invoice.notes ?? "",
        taxRatePercent: invoice.taxRate ? String(Number(invoice.taxRate) * 100) : "",
        discountType:
          invoice.discountType === "PERCENT" || invoice.discountType === "FIXED"
            ? invoice.discountType
            : "NONE",
        discountValue: invoice.discountValue ? String(Number(invoice.discountValue)) : "",
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
        depositApplied: Number(invoice.depositApplied ?? 0),
        contactName: invoice.contact
          ? `${invoice.contact.firstName} ${invoice.contact.lastName}`.trim()
          : "",
        lineItems: invoice.lineItems.map((li) => ({
          name: li.name,
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          workItemId: li.workItemId,
          recurringInterval: li.recurringInterval,
          serviceDate: li.serviceDate ? li.serviceDate.toISOString() : null,
        })),
      }}
    />
  );
}
