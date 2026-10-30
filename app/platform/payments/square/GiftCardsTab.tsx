import Link from "next/link";
import { ChevronRight, Gift } from "lucide-react";
import { prisma } from "@/lib/db";
import { Chip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import { money, shortDate } from "@/lib/statuses";
import { giftCardsOverview } from "@/lib/gift-cards";
import { formatGan, ganTail, listSquareGiftCardActivities, retrieveSquareGiftCard } from "@/lib/square-products";
import { ReconnectCard, RuledLabel, SquareUnavailable, TabBack } from "./bits";
import { giftCardActivityLabel, giftCardState } from "./labels";
import GiftCardActions from "./GiftCardActions";

/**
 * Gift cards tab (Square, 2026-10-30): every card on the seller's Square
 * account — balance, state, who it is linked to — with the sales WorkBench
 * made (an invoice waiting to be paid loads the card when it is), Sell a
 * gift card, Check a balance, and each card's history when tapped
 * (ListGiftCardActivities). Redeeming happens on an invoice (⋯ → Redeem a
 * gift card) and on the pay page.
 */
export default async function GiftCardsTab({
  companyId,
  tz,
  giftCardId,
  cursor,
  canSell,
  canReconnect,
  missingScope,
}: {
  companyId: string;
  tz: string;
  giftCardId: string | null;
  cursor: string | null;
  canSell: boolean;
  canReconnect: boolean;
  missingScope: boolean;
}) {
  if (missingScope) return <ReconnectCard what="gift cards" canReconnect={canReconnect} />;

  if (giftCardId) {
    const [card, acts, sale] = await Promise.all([
      retrieveSquareGiftCard(companyId, giftCardId),
      listSquareGiftCardActivities(companyId, giftCardId),
      prisma.giftCardSale.findFirst({
        where: { companyId, squareGiftCardId: giftCardId },
        select: { amountCents: true, state: true, recipientName: true, recipientEmail: true, invoice: { select: { id: true, invoiceNumber: true, status: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    if (!card.ok) {
      if (card.missingScopes) return <ReconnectCard what="gift cards" canReconnect={canReconnect} />;
      return (
        <div className="mb-8">
          <TabBack tab="giftcards" label="Gift cards" />
          <SquareUnavailable failure={card} what="this gift card" />
        </div>
      );
    }
    const g = card.data;
    const state = giftCardState(g.state);
    const activities = acts.ok ? acts.data.activities : [];
    return (
      <div className="mb-8">
        <TabBack tab="giftcards" label="Gift cards" />
        <div className="ds-card mb-4 overflow-hidden">
          <div className="p-5 sm:p-6">
            <p className="ds-label">Gift card {ganTail(g.gan)}</p>
            <p className="numeral-ledger mt-1 text-[34px] font-semibold leading-none text-[color:var(--ds-ink)]">{money(g.balanceCents / 100)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <Chip tone={state.tone}>{state.label}</Chip>
              <span>{g.type === "PHYSICAL" ? "Plastic card" : "Digital card"}</span>
              {g.createdAt && <span>· made {shortDate(g.createdAt, tz)}</span>}
            </p>
            {g.gan && (
              <p className="mt-3 text-sm text-gray-700">
                Number <span className="numeral-ledger select-all font-medium tracking-wider text-gray-900">{formatGan(g.gan)}</span>
              </p>
            )}
            {sale && (
              <p className="mt-2 text-sm text-gray-600">
                Sold in WorkBench for {money(sale.amountCents / 100)}
                {sale.contact && (
                  <>
                    {" "}
                    to{" "}
                    <Link prefetch={false} href={`/app/contacts/${sale.contact.id}`} className="ds-link font-medium">
                      {sale.contact.firstName} {sale.contact.lastName}
                    </Link>
                  </>
                )}
                {sale.recipientName && <> for {sale.recipientName}</>}
                {" · "}
                <Link prefetch={false} href={`/app/invoices/${sale.invoice.id}`} className="ds-link font-medium">
                  Invoice #{sale.invoice.invoiceNumber}
                </Link>
                {sale.invoice.status !== "PAID" && <span className="text-[color:var(--ds-warn)]"> (not paid yet — the card loads when it is)</span>}
              </p>
            )}
          </div>
        </div>
        <RuledLabel info="Everything that moved money on or off this card, newest first — loads, uses on an invoice, refunds back onto it.">History</RuledLabel>
        <div className="ds-card mb-8 overflow-hidden">
          {activities.length === 0 ? (
            <EmptyState compact title="Nothing yet" body={acts.ok ? "Loads and uses will list here." : "Square didn't answer with the history just now."} />
          ) : (
            <div className="divide-y divide-gray-100">
              {activities.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-900">{giftCardActivityLabel(a.type)}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {a.createdAt ? shortDate(a.createdAt, tz) : ""}
                      {a.reason ? ` · ${a.reason}` : ""}
                      {a.paymentId && (
                        <>
                          {" · "}
                          <Link prefetch={false} href={`/app/payments?payment=${encodeURIComponent(a.paymentId)}`} className="ds-link">
                            payment
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`numeral-ledger font-semibold ${a.deltaCents < 0 ? "text-gray-900" : "text-[color:var(--ds-good)]"}`}>
                      {a.deltaCents < 0 ? "−" : "+"}
                      {money(Math.abs(a.deltaCents) / 100)}
                    </p>
                    <p className="numeral-ledger text-xs text-gray-500">{money(a.balanceAfterCents / 100)} left</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const [{ read, sales }, contacts] = await Promise.all([
    giftCardsOverview(companyId, { cursor }),
    canSell
      ? prisma.contact.findMany({
          where: { companyId, status: { in: ["LEAD", "ACTIVE"] }, placeholder: false },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 2000,
        })
      : Promise.resolve([]),
  ]);
  if (!read.ok && read.missingScopes) return <ReconnectCard what="gift cards" canReconnect={canReconnect} />;
  const cards = read.ok ? read.data.giftCards : [];
  const next = read.ok ? read.data.cursor : null;
  const saleByCard = new Map(sales.map((s) => [s.squareGiftCardId, s]));
  // Who a card belongs to: the WorkBench sale's client, else the Square customer it is linked to.
  const customerIds = Array.from(new Set(cards.flatMap((c) => c.customerIds)));
  const linked = customerIds.length
    ? await prisma.contact.findMany({ where: { companyId, squareCustomerId: { in: customerIds } }, select: { id: true, firstName: true, lastName: true, squareCustomerId: true } })
    : [];
  const byCustomer = new Map(linked.map((c) => [c.squareCustomerId as string, c]));
  const waiting = sales.filter((s) => s.state !== "ACTIVE" && s.invoice.status !== "ARCHIVED");
  const activeBalance = cards.filter((c) => c.state === "ACTIVE").reduce((s, c) => s + c.balanceCents, 0);
  const sorted = [...cards].sort((a, b) => (a.state === "ACTIVE" ? 0 : 1) - (b.state === "ACTIVE" ? 0 : 1) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <>
      <div className="mb-6">
        <GiftCardActions canSell={canSell} contacts={contacts} />
      </div>

      {waiting.length > 0 && (
        <div className="mb-8">
          <RuledLabel info="Gift cards sold here whose invoice hasn't been paid yet. The card loads itself the moment the invoice is paid — by pay link, card on file, Tap to Pay or a payment you record — and the number is emailed to the recipient.">
            Waiting to be paid
          </RuledLabel>
          <div className="ds-card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {waiting.map((s) => (
                <Link key={s.id} prefetch={false} href={`/app/invoices/${s.invoiceId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                  <Gift size={16} className="shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {money(s.amountCents / 100)} gift card{s.recipientName ? ` for ${s.recipientName}` : ""}
                      {s.contact ? ` · ${s.contact.firstName} ${s.contact.lastName}` : ""}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      Invoice #{s.invoice.invoiceNumber} · {shortDate(s.createdAt, tz)}
                      {s.state === "FAILED" && <span className="text-[color:var(--ds-bad)]"> · Square refused the load: {s.lastError ?? "retrying"}</span>}
                    </p>
                  </div>
                  <Chip tone={s.state === "FAILED" ? "bad" : "warn"}>{s.state === "FAILED" ? "Needs attention" : "Unpaid"}</Chip>
                  <ChevronRight size={14} className="hidden text-gray-400 lg:block" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <RuledLabel info="Every gift card on your Square account — sold here, at the counter in the Square app, or online. Tap one for its history. To take one as payment, open the invoice and choose Redeem a gift card; clients can also enter the number on their pay page.">
          Cards
        </RuledLabel>
        {!read.ok && <SquareUnavailable failure={read} what="gift cards" />}
        <div className="ds-card overflow-hidden">
          {sorted.length === 0 ? (
            <EmptyState
              art="invoices"
              hue="var(--ds-primary)"
              title={read.ok ? "No gift cards yet" : "Couldn't read Square just now"}
              body={read.ok ? "Sell one above — the buyer pays an ordinary invoice and the recipient gets the card number by email." : "Your gift cards will list here once Square answers."}
              showPlusIcon={false}
            />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[150px_1fr_130px_110px_28px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Card</span>
                  <span>Who</span>
                  <span>State</span>
                  <span className="text-right">Balance</span>
                  <span></span>
                </div>
                {sorted.map((c) => {
                  const sale = saleByCard.get(c.id);
                  const who = sale?.contact ?? (c.customerIds.map((id) => byCustomer.get(id)).find(Boolean) ?? null);
                  const st = giftCardState(c.state);
                  return (
                    <Link
                      key={c.id}
                      prefetch={false}
                      href={`/app/payments?tab=giftcards&giftcard=${encodeURIComponent(c.id)}`}
                      className="flex lg:grid lg:grid-cols-[150px_1fr_130px_110px_28px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <span className="numeral-ledger text-sm font-medium text-gray-900 shrink-0">{ganTail(c.gan)}</span>
                      <div className="flex-1 lg:flex-none min-w-0">
                        <p className="text-sm text-gray-900 truncate">{who ? `${who.firstName} ${who.lastName}` : sale?.recipientName ?? sale?.recipientEmail ?? "—"}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {c.createdAt ? shortDate(c.createdAt, tz) : ""}
                          {sale ? " · sold in WorkBench" : ""}
                          <span className="lg:hidden"> · {st.label}</span>
                        </p>
                      </div>
                      <span className="hidden lg:block">
                        <Chip tone={st.tone}>{st.label}</Chip>
                      </span>
                      <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">{money(c.balanceCents / 100)}</span>
                      <ChevronRight size={14} className="hidden text-gray-400 lg:block" />
                    </Link>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[150px_1fr_130px_110px_28px]">
                <span className="text-xs font-medium text-gray-500 lg:col-span-3">
                  {sorted.length} {sorted.length === 1 ? "card" : "cards"} · outstanding balance on active cards
                </span>
                <span className="numeral-ledger text-sm font-bold text-gray-900 text-right">{money(activeBalance / 100)}</span>
                <span className="hidden lg:block" />
              </div>
            </>
          )}
        </div>
        {next && (
          <p className="mt-3 text-right">
            <Link prefetch={false} href={`/app/payments?tab=giftcards&cursor=${encodeURIComponent(next)}`} className="ds-link text-sm font-medium">
              More cards →
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
