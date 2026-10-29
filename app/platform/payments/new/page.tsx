import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { invoiceBalance } from "@/lib/payments";
import CollectPaymentForm from "./CollectPaymentForm";

/**
 * ?amount=&paidAt=YYYY-MM-DD&method=&reference=&note= prefill the form —
 * the Payments page's "Record on an invoice" for a sale the seller took in
 * another Square product (POS, Square Online) sends them, so the row the
 * bank already has lands on the right invoice without retyping.
 */
export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{
    invoiceId?: string;
    contactId?: string;
    amount?: string;
    paidAt?: string;
    method?: string;
    reference?: string;
    note?: string;
  }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { invoiceId, contactId, amount, paidAt, method, reference, note } = await searchParams;
  const prefillAmount = amount && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 ? Number(amount).toFixed(2) : undefined;
  const prefill =
    prefillAmount || paidAt || method || reference || note
      ? {
          amount: prefillAmount,
          paidAt: paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : undefined,
          method: method && ["CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER"].includes(method) ? method : undefined,
          referenceNumber: reference?.slice(0, 120) || undefined,
          details: note?.slice(0, 200) || undefined,
        }
      : undefined;

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

  return <CollectPaymentForm invoices={outstanding} preselectedInvoiceId={invoiceId ?? ""} prefill={prefill} />;
}
