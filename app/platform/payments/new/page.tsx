import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { invoiceBalance } from "@/lib/payments";
import CollectPaymentForm from "./CollectPaymentForm";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string; contactId?: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { invoiceId, contactId } = await searchParams;

  // Outstanding invoices: anything not fully paid
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      ...viaContactScope(actor),
      status: { in: ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE"] },
      ...(contactId ? { contactId } : {}),
    },
    include: { contact: true, payments: true },
    orderBy: { dueDate: "asc" },
  });

  const outstanding = invoices.map((inv) => {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      subject: inv.subject,
      status: inv.status,
      dueDate: inv.dueDate?.toISOString() ?? null,
      contactName: inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : "—",
      total: Number(inv.total),
      balance: invoiceBalance(inv),
    };
  });

  return <CollectPaymentForm invoices={outstanding} preselectedInvoiceId={invoiceId ?? ""} />;
}
