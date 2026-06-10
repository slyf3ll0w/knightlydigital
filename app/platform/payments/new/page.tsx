import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import CollectPaymentForm from "./CollectPaymentForm";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string; contactId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");
  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { invoiceId, contactId } = await searchParams;

  // Outstanding invoices: anything not fully paid
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: { in: ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE"] },
      ...(contactId ? { contactId } : {}),
    },
    include: { contact: true, payments: true },
    orderBy: { dueDate: "asc" },
  });

  const outstanding = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      subject: inv.subject,
      status: inv.status,
      dueDate: inv.dueDate?.toISOString() ?? null,
      contactName: inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : "—",
      total: Number(inv.total),
      balance: Math.round((Number(inv.total) - paid) * 100) / 100,
    };
  });

  return <CollectPaymentForm invoices={outstanding} preselectedInvoiceId={invoiceId ?? ""} />;
}
