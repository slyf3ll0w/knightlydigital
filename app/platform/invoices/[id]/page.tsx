import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope, isManager } from "@/lib/permissions";
import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { money, shortDate, statusLabels } from "@/lib/statuses";
import ScheduledSendLine from "@/components/ScheduledSendLine";
import { channelsFromJson, scheduledLine, SEND_DEFAULTS } from "@/lib/send-document";
import { Chip, DsPage } from "@/components/ds";
import CountUp from "@/components/CountUp";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import InvoiceActions from "./InvoiceActions";
import { canText } from "@/lib/sms-consent";
import { companyCanSendSms } from "@/lib/sms";
import { fmtPhone } from "@/lib/format";
import RunAutomationMenu from "@/components/RunAutomationMenu";
import { getProcessor, invoiceBalance } from "@/lib/payments";
import { canChargeOnline } from "@/lib/payments-gate";
import { clientPayConfig, PAY_CONFIG_SELECT } from "@/lib/pay-client-config";
import { giftCardsOpenFor } from "@/lib/gift-cards-preview";
import { tapToPayOffer } from "@/lib/tap-to-pay";
import type { ClientPayConfig } from "@/lib/pay-config";
import { activityFor } from "@/lib/activity";
import ActivityTrail from "@/components/ActivityTrail";
import PaymentRow from "./PaymentRow";
import Celebration from "@/components/Celebration";
import { shouldCelebrate } from "@/lib/celebrations";
import { isOnlinePayment } from "@/lib/payment-ref";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
      job: { include: { quote: { select: { id: true, quoteNumber: true } } } },
      // Deposit invoices link straight to the quote they collect against
      quote: { select: { id: true, quoteNumber: true } },
    },
  });

  if (!invoice) notFound();

  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  // Originating quote: direct link (deposit invoices) or via the converted job
  const sourceQuote = invoice.quote ?? invoice.job?.quote ?? null;

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const publicUrl = `${baseUrl}/pay/${invoice.publicToken}`;
  const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  // Service fees the client paid ride on top of the total (lib/payments invoiceBalance).
  const feesPaid = invoice.payments.reduce((s, p) => s + Number(p.surchargeAmount ?? 0), 0);
  const balance = Math.max(0, invoiceBalance(invoice));
  // Send to Client can text the pay link from the business line
  const canTextClient =
    Boolean(invoice.contact?.phone) && canText(invoice.contact!) && (await companyCanSendSms(companyId));

  // "Include the work report" on Send (Gallery plan): the finished job this
  // invoice bills, with how many photos the client would see.
  let reportJob: { shown: number; sent: boolean } | null = null;
  if (invoice.job && invoice.job.status !== "ACTIVE") {
    const { galleryStateFor } = await import("@/lib/gallery-preview");
    if ((await galleryStateFor(companyId)).open) {
      const shown = await prisma.jobPhoto.count({ where: { jobId: invoice.job.id, clientVisible: true } });
      reportJob = { shown, sent: Boolean(invoice.job.reportSentAt) };
    }
  }

  // Jobber-style nudge: invoice paid but the linked job is still open
  const showCloseJobNudge =
    invoice.status === "PAID" && invoice.job && invoice.job.status !== "ARCHIVED";

  // "Charge card on file" — managers only, when the client has cards saved
  // and this company's merchant can actually move money. The full card list
  // goes down so the action can offer a pick when there's more than one.
  let chargeStoredLabel: string | null = null;
  let savedCards: { id: string; label: string; isDefault: boolean }[] = [];
  let payCfg: ClientPayConfig = null;
  if (
    isManager(actor.role) &&
    balance > 0 &&
    invoice.status !== "PAID" &&
    invoice.contact &&
    getProcessor().live
  ) {
    const gate = await prisma.company.findUnique({
      where: { id: companyId },
      select: PAY_CONFIG_SELECT,
    });
    if (gate && canChargeOnline(gate)) {
      // Staff can also tokenize a NEW card right in the charge dialog
      payCfg = clientPayConfig(gate);
      savedCards = await prisma.savedCard.findMany({
        where: { contactId: invoice.contact.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, label: true, isDefault: true },
      });
      if (savedCards.length > 0) {
        chargeStoredLabel = savedCards[0].label;
      } else if (invoice.contact.processorCustomerRef) {
        // Pre-backfill legacy single card
        chargeStoredLabel = invoice.contact.savedCardLabel ?? "saved card";
      }
    }
  }

  // Tap to Pay in the phone app: offered to anyone who can take money on
  // this invoice while there is a balance (lib/tap-to-pay.ts decides).
  const tapToPay = balance > 0 && invoice.status !== "PAID" ? await tapToPayOffer(actor) : null;

  // Square products (docs/plans/square-products-2026-10-30.md): a gift card
  // can pay any open balance once this company runs on Square.
  const onSquare = payCfg?.processor === "square";
  const giftCards =
    onSquare && balance > 0 && invoice.status !== "PAID" && invoice.status !== "ARCHIVED" && (await giftCardsOpenFor(actor.companyId));

  // One-shot confetti (per user) on the first open after a processor-verified
  // (card/ACH) payment marked it PAID — manual cash/check entries don't celebrate.
  const hasOnlinePayment = invoice.payments.some(
    (p) => p.processorRef && (p.method === "CARD" || p.method === "ACH")
  );
  const celebratePaid =
    invoice.status === "PAID" &&
    hasOnlinePayment &&
    (await shouldCelebrate(actor.id, "INVOICE_PAID", invoice.id, invoice.paidAt));

  // ── The band (the one saturated surface on the page) ──────────────────────
  // What the invoice means right now, in one big number: what's still owed,
  // or the total once it's paid / while it's a draft. The bar under it is
  // how much has come in — it grows in on arrival, the page's only motion
  // besides the title.
  const shownStatus = invoice.status === "DRAFT" && invoice.scheduledSendAt ? "SCHEDULED" : invoice.status;
  const owed = balance > 0 && invoice.status !== "DRAFT" && invoice.status !== "ARCHIVED" && invoice.status !== "PAID";
  const bandLabel =
    invoice.status === "PAID"
      ? "Paid in full"
      : invoice.status === "DRAFT"
        ? "Invoice total"
        : invoice.status === "ARCHIVED"
          ? "Archived"
          : "Balance due";
  const bandNumber = owed ? balance : Number(invoice.total);
  const bandSub =
    invoice.status === "PAID"
      ? invoice.paidAt
        ? `Paid ${shortDate(invoice.paidAt, tz)}`
        : null
      : invoice.status === "DRAFT"
        ? invoice.scheduledSendAt
          ? "Scheduled to send"
          : "Not sent yet"
        : owed
          ? `of ${money(invoice.total)} · ${invoice.status === "PAST_DUE" ? "was due" : "due"} ${shortDate(invoice.dueDate, tz)}`
          : null;
  const totalNum = Number(invoice.total);
  const paidPct = totalNum > 0 ? Math.min(100, Math.round((totalPaid / totalNum) * 100)) : 0;
  const showBar = invoice.status !== "DRAFT" && totalNum > 0 && totalPaid > 0;
  const pillTone =
    invoice.status === "PAID" ? "good" : invoice.status === "PAST_DUE" ? "bad" : invoice.status === "DRAFT" || invoice.status === "ARCHIVED" ? "quiet" : "secondary";
  const bandFacts: { label: string; value: React.ReactNode }[] = [
    { label: "Invoice", value: `#${invoice.invoiceNumber}` },
    { label: "Issued", value: shortDate(invoice.issuedAt ?? invoice.createdAt, tz) },
    { label: "Due", value: shortDate(invoice.dueDate, tz) },
  ];
  if (invoice.status !== "DRAFT") {
    bandFacts.push({
      label: "Viewed",
      value: invoice.firstViewedAt ? (
        <span
          className="inline-flex items-center gap-1"
          title={
            invoice.viewCount > 1 && invoice.lastViewedAt
              ? `Opened ${invoice.viewCount} times — last on ${shortDate(invoice.lastViewedAt, tz)}`
              : undefined
          }
        >
          <Eye size={13} strokeWidth={2.4} />
          {shortDate(invoice.firstViewedAt, tz)}
          {invoice.viewCount > 1 ? ` · ${invoice.viewCount}×` : ""}
        </span>
      ) : (
        <span className="opacity-70">Not yet</span>
      ),
    });
  }
  if (invoice.job) {
    bandFacts.push({
      label: "For",
      value: (
        <Link prefetch={false} href={`/app/jobs/${invoice.job.id}`} className="ds-band-link">
          Job #{invoice.job.jobNumber}
        </Link>
      ),
    });
  }
  if (sourceQuote) {
    bandFacts.push({
      label: "From",
      value: (
        <Link prefetch={false} href={`/app/quotes/${sourceQuote.id}`} className="ds-band-link">
          Quote #{sourceQuote.quoteNumber}
        </Link>
      ),
    });
  }
  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  return (
    <DsPage>
      <Celebration
        endpoint={`/api/app/invoices/${invoice.id}/celebrated`}
        celebrate={celebratePaid}
      />
      <div className="mb-3">
        <BackLink href="/app/invoices" />
      </div>

      <div className="ds-rise mb-5 flex flex-wrap items-end justify-between gap-4 lg:mb-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
            {invoice.contact && (
              <Link
                prefetch={false} href={`/app/contacts/${invoice.contact.id}`}
                className="ds-link font-semibold hover:underline"
              >
                {invoice.contact.firstName} {invoice.contact.lastName}
              </Link>
            )}
          </div>
          <PageTitle heavy>{invoice.subject || `Invoice #${invoice.invoiceNumber}`}</PageTitle>
        </div>
        <div className="flex items-center gap-2">
        <RunAutomationMenu entity="invoice" entityId={invoice.id} manager={isManager(actor.role)} />
        <InvoiceActions
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          status={invoice.status}
          publicUrl={publicUrl}
          tapToPay={tapToPay}
          canDelete={isManager(actor.role)}
          paymentCount={invoice.payments.length}
          paymentTotal={totalPaid}
          contactEmail={invoice.contact?.email ?? ""}
          contactPhone={invoice.contact?.phone ? fmtPhone(invoice.contact.phone) : ""}
          canTextClient={canTextClient}
          chargeStoredLabel={chargeStoredLabel}
          savedCards={savedCards}
          contactId={invoice.contact?.id ?? ""}
          pay={payCfg}
          balance={balance}
          scheduled={Boolean(invoice.scheduledSendAt)}
          tz={tz}
          giftCards={giftCards}
          reportJob={reportJob}
          reopenStatus={
            totalPaid > 0 && totalPaid >= Number(invoice.total) - 0.005
              ? "PAID"
              : invoice.issuedAt
                ? "AWAITING_PAYMENT"
                : "DRAFT"
          }
        />
        </div>
      </div>

      {invoice.status === "DRAFT" && invoice.scheduledSendAt && (
        <ScheduledSendLine
          kind="invoice"
          id={invoice.id}
          label={scheduledLine(tz, invoice.scheduledSendAt) ?? ""}
          channels={channelsFromJson(invoice.scheduledSendChannels, SEND_DEFAULTS.invoice)}
          email={invoice.contact?.email ?? null}
          phone={invoice.contact?.phone ? fmtPhone(invoice.contact.phone) : null}
        />
      )}

      {/* The band */}
      <section className="ds-hero ds-rise mb-6 p-5 lg:mb-8 lg:p-7" style={rise(1)}>
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <span className={`ds-band-pill is-${pillTone}`}>{statusLabels.invoice[shownStatus] ?? shownStatus}</span>
              <p className="mt-4 text-[14px] font-semibold opacity-85">{bandLabel}</p>
              <p className="ds-band-number mt-1">
                <CountUp value={money(bandNumber)} />
              </p>
              {bandSub && <p className="mt-2 text-[14.5px] font-medium opacity-85">{bandSub}</p>}
            </div>
            <dl className="ds-band-facts">
              {bandFacts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {showBar && (
            <div className="mt-6">
              <div className="ds-band-track" aria-hidden>
                <div className="ds-band-fill" style={{ width: `${paidPct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[13px] font-semibold">
                <span className="opacity-90">{money(totalPaid)} paid</span>
                <span className="opacity-75">{paidPct}%</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Close-job nudge */}
      {showCloseJobNudge && (
        <Link
          prefetch={false} href={`/app/jobs/${invoice.job!.id}`}
          className="ds-card ds-card-raised mb-6 flex items-center justify-between gap-3 px-5 py-4 transition-shadow hover:shadow-lg"
        >
          <p className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
            You may want to close this job: Job #{invoice.job!.jobNumber} — {invoice.job!.title}
          </p>
          <ArrowRight size={16} className="shrink-0 text-[color:var(--ds-primary)]" />
        </Link>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Invoice body */}
      <div className="ds-card ds-card-raised ds-rise overflow-hidden" style={rise(2)}>
        <h2 className="ds-heavy-h2 px-4 pt-5 lg:px-6">Line items</h2>
        {/* Line items — stacked rows on phones */}
        <div className="lg:hidden divide-y divide-gray-100">
          {invoice.lineItems.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold text-gray-900">
                  {item.name || item.description}
                  {item.recurringInterval && " "}
                  {item.recurringInterval && (
                    <Chip tone="primary">Recurring</Chip>
                  )}
                </p>
                {item.name && item.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                )}
                {item.serviceDate && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Service date: {shortDate(item.serviceDate, tz)}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-0.5">
                  {Number(item.quantity)} × {money(item.unitPrice)}
                </p>
              </div>
              <p className="ds-num shrink-0 text-sm font-semibold text-gray-900">
                {money(item.total)}
              </p>
            </div>
          ))}
        </div>

        {/* Line items — desktop table */}
        <div className="hidden lg:block px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs text-gray-500 font-semibold">
                  Line item
                </th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold w-16">
                  Qty
                </th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold w-24">
                  Unit price
                </th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold w-24">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.lineItems.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-3.5">
                    <p className="text-[15px] font-semibold text-[color:var(--ds-ink)]">
                      {item.name || item.description}
                      {item.recurringInterval && " "}
                      {item.recurringInterval && (
                        <Chip tone="primary">Recurring</Chip>
                      )}
                    </p>
                    {item.name && item.description && (
                      <p className="text-gray-500 text-xs mt-0.5">{item.description}</p>
                    )}
                    {item.serviceDate && (
                      <p className="text-gray-500 text-xs mt-0.5">
                        Service date: {shortDate(item.serviceDate, tz)}
                      </p>
                    )}
                  </td>
                  <td className="ds-num py-3 text-right text-gray-600">{Number(item.quantity)}</td>
                  <td className="ds-num py-3 text-right text-gray-600">{money(item.unitPrice)}</td>
                  <td className="ds-num py-3 text-right font-semibold text-[color:var(--ds-ink)]">{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals — full-width rows on phones, right-hand column at a desk */}
        <div className="px-4 lg:px-6 py-4 border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface-2)]">
          <div className="ml-auto w-full lg:w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="ds-num text-gray-800">{money(invoice.subtotal)}</span>
            </div>
            {invoice.discount && Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-[color:var(--ds-good)]">
                <span>
                  Discount
                  {invoice.discountType === "PERCENT" && invoice.discountValue
                    ? ` (${Number(invoice.discountValue)}%)`
                    : ""}
                </span>
                <span className="ds-num">−{money(invoice.discount)}</span>
              </div>
            )}
            {invoice.tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Tax ({parseFloat((Number(invoice.taxRate) * 100).toFixed(3))}%)
                </span>
                <span className="ds-num text-gray-800">{money(invoice.tax)}</span>
              </div>
            )}
            {invoice.depositApplied && Number(invoice.depositApplied) > 0 && (
              <div className="flex justify-between text-[color:var(--ds-good)]">
                <span>Deposit applied</span>
                <span className="ds-num">−{money(invoice.depositApplied)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-2 border-t border-[color:var(--ds-line-strong)]">
              <span className="text-[16px] font-bold text-[color:var(--ds-ink)]">Total</span>
              <span className="ds-num text-[18px] font-bold text-[color:var(--ds-ink)]">{money(invoice.total)}</span>
            </div>
            {feesPaid > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Service fee</span>
                <span className="ds-num text-gray-800">{money(feesPaid)}</span>
              </div>
            )}
            {totalPaid > 0 && (
              <div className="flex justify-between text-[color:var(--ds-good)]">
                <span>Payments</span>
                <span className="ds-num">−{money(totalPaid)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-gray-900">Invoice balance</span>
              <span className={`ds-num ${balance > 0 ? "text-gray-900" : "text-[color:var(--ds-good)]"}`}>
                {money(balance)}
              </span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="ds-card ds-card-raised ds-rise overflow-hidden" style={rise(3)}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="ds-heavy-h2">Payments</h2>
          {balance > 0 && (
            <Link
              href={`/app/payments/new?invoiceId=${invoice.id}`}
              className="ds-link text-[13.5px] font-semibold hover:underline"
            >
              + Collect payment
            </Link>
          )}
        </div>
        {invoice.payments.length === 0 ? (
          <EmptyState compact title="No payments recorded yet." />
        ) : (
          <div className="divide-y divide-gray-50">
            {invoice.payments.map((p) => {
              // Money sitting on a processor charge is refunded, not deleted —
              // the API refuses that delete, so refund takes its place here.
              // Once it's been refunded to zero the row is just bookkeeping
              // again and a manager can clear it.
              const online = isOnlinePayment(p.processorRef);
              const holdsMoney = online && Number(p.amount) > 0.005;
              return (
                <PaymentRow
                  key={p.id}
                  payment={{
                    id: p.id,
                    amount: Number(p.amount),
                    method: p.method,
                    // The edit form's <input type="date"> value — the company's
                    // calendar day, not the UTC one
                    paidAtDate: p.paidAt.toLocaleDateString("en-CA", { timeZone: tz }),
                    paidAtLabel: shortDate(p.paidAt, tz),
                    referenceNumber: p.referenceNumber ?? "",
                    details: p.details ?? "",
                    returnedAmount: p.returnedAt ? Number(p.returnedAmount ?? 0) : null,
                  }}
                  canDelete={isManager(actor.role) && !holdsMoney}
                  canRefund={isManager(actor.role) && online && !p.returnedAt}
                  isOnline={online}
                />
              );
            })}
          </div>
        )}
      </div>
      </div>

      <div className="mt-8">
        <ActivityTrail rows={await activityFor(companyId, "invoice", invoice.id)} />
      </div>
    </DsPage>
  );
}
