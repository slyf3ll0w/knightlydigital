import Link from "next/link";
import { ArrowUpRight, Receipt } from "lucide-react";
import { prisma } from "@/lib/db";
import { Chip } from "@/components/ds";
import { money, shortDate } from "@/lib/statuses";
import { retrieveSquareTransaction } from "@/lib/square-products";
import { ReconnectCard, RuledLabel, SquareUnavailable, TabBack } from "./bits";
import { cardBrandLabel, entryMethodLabel, squarePaymentStatus, squareProductLabel } from "./labels";

/**
 * One Square payment, the way Square's own transaction screen shows it
 * (2026-10-30): amount, status, how it was paid, Square's fee and the net,
 * refunds, the receipt Square hosts, and — when the sale carried an order
 * (POS, Square Online, Invoices) — every item on it with modifiers, discounts
 * and taxes (RetrieveOrder, ORDERS_READ). WorkBench's own charges carry no
 * Square order; their itemization is the invoice, linked at the top.
 */
export default async function TransactionDetail({ companyId, tz, paymentId, canReconnect }: { companyId: string; tz: string; paymentId: string; canReconnect: boolean }) {
  const [read, ours] = await Promise.all([
    retrieveSquareTransaction(companyId, paymentId),
    prisma.payment.findFirst({
      where: { companyId, processorRef: paymentId },
      select: { id: true, method: true, amount: true, surchargeAmount: true, invoice: { select: { id: true, invoiceNumber: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  if (!read.ok) {
    if (read.missingScopes) return <ReconnectCard what="this payment" canReconnect={canReconnect} />;
    return (
      <div className="mb-8">
        <TabBack tab="payments" label="Payments" />
        <SquareUnavailable failure={read} what="this payment" />
      </div>
    );
  }
  const { payment: p, refunds, order, orderError } = read.data;
  const state = squarePaymentStatus(p.status);
  const net = p.totalCents - p.feeCents - p.refundedCents;
  const how =
    p.sourceType === "CARD"
      ? [cardBrandLabel(p.cardBrand), p.last4 ? `•••• ${p.last4}` : "", p.cardType && p.cardType !== "UNKNOWN" ? p.cardType.toLowerCase() : "", entryMethodLabel(p.entryMethod)].filter(Boolean).join(" · ")
      : p.sourceType === "BANK_ACCOUNT"
        ? ["Bank transfer", p.bankName ?? "", p.last4 ? `•••• ${p.last4}` : ""].filter(Boolean).join(" · ")
        : p.sourceType === "CASH"
          ? "Cash"
          : p.sourceType === "WALLET"
            ? "Wallet (Cash App Pay / Apple Pay / Google Pay)"
            : p.sourceType === "SQUARE_ACCOUNT" || p.sourceType === "GIFT_CARD"
              ? "Gift card"
              : (p.sourceType ?? "—").toLowerCase().replace(/_/g, " ");
  const takenWith = ours ? "WorkBench" : squareProductLabel(p.squareProduct);

  const Row = ({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) => (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`numeral-ledger text-right ${strong ? "font-semibold text-gray-900" : "text-gray-800"}`}>{value}</span>
    </div>
  );

  return (
    <div className="mb-8">
      <TabBack tab="payments" label="Payments" />
      <div className="ds-card mb-4 overflow-hidden">
        <div className="p-5 sm:p-6">
          <p className="ds-label">
            Payment · {p.createdAt ? shortDate(p.createdAt, tz) : ""}
            {p.createdAt ? ` · ${new Date(p.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}` : ""}
          </p>
          <p className="numeral-ledger mt-1 text-[34px] font-semibold leading-none text-[color:var(--ds-ink)]">{money(p.totalCents / 100)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <Chip tone={state.tone}>{state.label}</Chip>
            <span>{how}</span>
            <span>· taken with {takenWith}</span>
            {p.refundedCents > 0 && <span className="text-[color:var(--ds-warn)]">· {money(p.refundedCents / 100)} refunded</span>}
          </p>
          {(ours?.invoice || ours?.contact) && (
            <p className="mt-3 text-sm">
              {ours.contact && (
                <Link prefetch={false} href={`/app/contacts/${ours.contact.id}`} className="ds-link font-medium">
                  {ours.contact.firstName} {ours.contact.lastName}
                </Link>
              )}
              {ours.contact && ours.invoice && " · "}
              {ours.invoice && (
                <Link prefetch={false} href={`/app/invoices/${ours.invoice.id}`} className="ds-link font-medium">
                  Invoice #{ours.invoice.invoiceNumber}
                </Link>
              )}
              {ours.method === "GIFT_CARD" && <span className="text-gray-500"> · paid with a gift card</span>}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {p.receiptUrl && (
              <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn-outline ds-btn-sm">
                <Receipt size={13} /> Receipt {p.receiptNumber ? `#${p.receiptNumber}` : ""} <ArrowUpRight size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      <RuledLabel info="What the client paid, Square's processing fee on it (posted within a day), refunds, and what reached your balance.">The money</RuledLabel>
      <div className="ds-card mb-6 divide-y divide-gray-100 overflow-hidden">
        <Row label="Charged" value={money(p.amountCents / 100)} />
        {p.tipCents > 0 && <Row label="Tip" value={money(p.tipCents / 100)} />}
        {ours?.surchargeAmount != null && Number(ours.surchargeAmount) > 0 && <Row label="Includes card surcharge" value={money(Number(ours.surchargeAmount))} />}
        <Row label="Square's fee" value={p.feeCents > 0 ? `−${money(p.feeCents / 100)}` : "not posted yet"} />
        {p.refundedCents > 0 && <Row label="Refunded" value={`−${money(p.refundedCents / 100)}`} />}
        <Row label="Net to you" value={money(Math.max(0, net) / 100)} strong />
        {p.referenceId && <Row label="Reference" value={<span className="font-normal text-gray-500">{p.referenceId}</span>} />}
        {p.note && <Row label="Note" value={<span className="font-normal text-gray-700">{p.note}</span>} />}
        <Row label="Square id" value={<span className="select-all text-xs text-gray-400">{p.id}</span>} />
      </div>

      {refunds.length > 0 && (
        <>
          <RuledLabel>Refunds</RuledLabel>
          <div className="ds-card mb-6 divide-y divide-gray-100 overflow-hidden">
            {refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-900">{r.createdAt ? shortDate(r.createdAt, tz) : "Refund"}</p>
                  <p className="text-xs text-gray-500 truncate">{r.reason ?? r.status.toLowerCase()}</p>
                </div>
                <span className="numeral-ledger font-semibold text-gray-900">−{money(r.amountCents / 100)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <RuledLabel info="The itemized sale behind the payment, as Square recorded it — the POS cart, the online order, the Square invoice. A WorkBench charge has no Square order: its items are on the invoice above.">
        What was sold
      </RuledLabel>
      <div className="ds-card mb-8 overflow-hidden">
        {order ? (
          <>
            <div className="divide-y divide-gray-100">
              {order.lines.map((l, i) => (
                <div key={l.uid ?? i} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 text-gray-900">
                      {l.quantity !== 1 && <span className="numeral-ledger text-gray-500">{l.quantity} × </span>}
                      {l.name}
                      {l.variation && <span className="text-gray-500"> · {l.variation}</span>}
                    </span>
                    <span className="numeral-ledger shrink-0 font-medium text-gray-900">{money((l.totalCents + l.discountCents) / 100)}</span>
                  </div>
                  {l.modifiers.map((m, j) => (
                    <div key={j} className="flex items-baseline justify-between gap-4 pl-4 text-xs text-gray-500">
                      <span>{m.name}</span>
                      {m.cents !== 0 && <span className="numeral-ledger">{money(m.cents / 100)}</span>}
                    </div>
                  ))}
                  {l.discountCents > 0 && (
                    <div className="flex items-baseline justify-between gap-4 pl-4 text-xs text-[color:var(--ds-good)]">
                      <span>Discount</span>
                      <span className="numeral-ledger">−{money(l.discountCents / 100)}</span>
                    </div>
                  )}
                  {l.note && <p className="pl-4 text-xs text-gray-500">{l.note}</p>}
                </div>
              ))}
              {order.lines.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No items on this order.</p>}
            </div>
            <div className="divide-y divide-gray-100 border-t-2 border-double border-gray-300 bg-gray-50/60">
              <Row label="Subtotal" value={money(order.subtotalCents / 100)} />
              {order.discounts.map((d, i) => (
                <Row key={i} label={d.name} value={`−${money(d.cents / 100)}`} />
              ))}
              {order.serviceCharges.map((c, i) => (
                <Row key={i} label={c.name} value={money(c.cents / 100)} />
              ))}
              {order.taxes.length > 0
                ? order.taxes.map((t, i) => <Row key={i} label={t.name} value={money(t.cents / 100)} />)
                : order.taxCents > 0 && <Row label="Tax" value={money(order.taxCents / 100)} />}
              {order.tipCents > 0 && <Row label="Tip" value={money(order.tipCents / 100)} />}
              <Row label="Total" value={money(order.totalCents / 100)} strong />
              {order.source && <Row label="Rung up in" value={<span className="font-normal text-gray-500">{order.source}</span>} />}
            </div>
          </>
        ) : (
          <p className="px-4 py-3 text-sm text-gray-500">
            {ours
              ? "This charge came through WorkBench — the items are on the invoice."
              : orderError === "missing_scope"
                ? "Reconnect Square (Settings → Payments & accounting) to see the items behind this sale."
                : orderError
                  ? "Square didn't answer with the order just now."
                  : "Square kept no itemized order for this payment."}
          </p>
        )}
      </div>
    </div>
  );
}
