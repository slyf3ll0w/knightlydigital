import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Receipt, ChevronRight } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";

export default async function HubInvoicesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      invoices: {
        where: { status: { in: ["AWAITING_PAYMENT", "PAST_DUE", "PAID"] } },
        include: { payments: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!contact) notFound();

  const open = contact.invoices.filter((i) => i.status !== "PAID");
  const paid = contact.invoices.filter((i) => i.status === "PAID");

  const section = (title: string, list: typeof contact.invoices) =>
    list.length > 0 && (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {title}
        </h3>
        <div className="space-y-3">
          {list.map((inv) => {
            const paidAmt = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
            const balance = Math.max(0, Number(inv.total) - paidAmt);
            return (
              <Link
                key={inv.id}
                href={`/pay/${inv.publicToken}`}
                className="flex items-center gap-4 card-ledger p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {inv.subject || `Invoice #${inv.invoiceNumber}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    #{inv.invoiceNumber}
                    {inv.issuedAt && ` · Sent ${shortDate(inv.issuedAt)}`}
                    {inv.dueDate && ` · Due ${shortDate(inv.dueDate)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{money(inv.total)}</p>
                  {balance > 0 && balance < Number(inv.total) && (
                    <p className="text-xs text-amber-600">Balance {money(balance)}</p>
                  )}
                </div>
                <ChevronRight size={15} className="text-gray-300" />
              </Link>
            );
          })}
        </div>
      </div>
    );

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Your invoices</h2>
      {contact.invoices.length === 0 ? (
        <div className="card-ledger py-14 text-center">
          <Receipt size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No invoices yet.</p>
        </div>
      ) : (
        <>
          {section("Outstanding", open)}
          {section("Paid", paid)}
        </>
      )}
    </div>
  );
}
