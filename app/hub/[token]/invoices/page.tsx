import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CreditCard } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import { invoiceBalance } from "@/lib/payments";
import { canChargeOnline } from "@/lib/payments-gate";
import { HubEmpty, HubGroup, HubPageHead, HubRow, type HubTone } from "../HubKit";

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
      company: { select: { finixMerchantId: true, finixOnboardingState: true, squareMerchantId: true, squareConnectedAt: true } },
    },
  });
  if (!contact) notFound();

  // A card on file only means something when the business can charge it —
  // no online payments (yet), no "save a card" invitation.
  const online = canChargeOnline(contact.company);
  const open = contact.invoices.filter((i) => i.status !== "PAID");
  const paid = contact.invoices.filter((i) => i.status === "PAID");
  const owed = open.reduce((n, i) => n + Math.max(0, invoiceBalance(i)), 0);

  // Client-facing statuses — friendlier words than the internal ones, as a dot + word
  const clientInvoiceStatus: Record<string, { label: string; tone: HubTone }> = {
    AWAITING_PAYMENT: { label: "Due", tone: "warn" },
    PAST_DUE: { label: "Past due", tone: "bad" },
    PAID: { label: "Paid", tone: "good" },
  };

  const group = (title: string, list: typeof contact.invoices) =>
    list.length > 0 && (
      <HubGroup title={title} count={list.length} flush>
        {list.map((inv) => {
          const balance = Math.max(0, invoiceBalance(inv));
          const partial = balance > 0 && balance < Number(inv.total);
          return (
            <HubRow
              key={inv.id}
              href={`/pay/${inv.publicToken}`}
              title={inv.subject || `Invoice #${inv.invoiceNumber}`}
              sub={[
                `#${inv.invoiceNumber}`,
                inv.dueDate && inv.status !== "PAID" ? `Due ${shortDate(inv.dueDate)}` : inv.issuedAt ? `Sent ${shortDate(inv.issuedAt)}` : null,
                partial ? `${money(balance)} left` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={money(inv.total)}
              status={clientInvoiceStatus[inv.status] ?? null}
            />
          );
        })}
      </HubGroup>
    );

  return (
    <div>
      <HubPageHead
        title="Invoices"
        note={
          contact.invoices.length === 0
            ? "Invoices we send you show up here."
            : owed > 0
              ? `${money(owed)} to pay · ${paid.length} paid`
              : `All paid · ${paid.length} ${paid.length === 1 ? "invoice" : "invoices"}`
        }
      />
      {contact.invoices.length === 0 ? (
        <HubEmpty
          title="No invoices yet"
          body={online ? "Invoices we send you appear here — pay online in a couple of taps." : "Invoices we send you appear here."}
        />
      ) : (
        <div className="hk-page">
          {group("To pay", open)}
          {group("Paid", paid)}
        </div>
      )}
      {online && (
        <div className="mt-6">
          <HubGroup flush>
            <HubRow
              href={`/hub/${token}/payment-method`}
              lead={
                <span className="hk-ic">
                  <CreditCard size={17} strokeWidth={2.2} />
                </span>
              }
              title={contact.savedCardLabel ? "Card on file" : "Save a card for faster payments"}
              sub={contact.savedCardLabel ?? "Add a payment method once — pay invoices in a tap."}
            />
          </HubGroup>
        </div>
      )}
    </div>
  );
}