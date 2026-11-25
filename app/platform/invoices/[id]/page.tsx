import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope, isManager } from "@/lib/permissions";
import Link from "next/link";
import { ArrowRight, Check, Mail, Pencil, Phone } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import ScheduledSendLine from "@/components/ScheduledSendLine";
import { channelsFromJson, scheduledLine, SEND_DEFAULTS } from "@/lib/send-document";
import { BandBody, Chip, DsPage, OpenSection } from "@/components/ds";
import TitleSentinel from "@/components/TitleSentinel";
import ViewedFact from "@/components/ViewedFact";
import InvoiceActions from "./InvoiceActions";
import { canText } from "@/lib/sms-consent";
import { companyCanSendSms } from "@/lib/sms";
import { fmtPhone } from "@/lib/format";
import RunAutomationMenu from "@/components/RunAutomationMenu";
import { getProcessor, invoiceBalance } from "@/lib/payments";
import { canChargeOnline } from "@/lib/payments-gate";
import { clientPayConfig, PAY_CONFIG_SELECT } from "@/lib/pay-client-config";
import { tapToPayOffer } from "@/lib/tap-to-pay";
import type { ClientPayConfig } from "@/lib/pay-config";
import { activityFor } from "@/lib/activity";
import ActivityTrail from "@/components/ActivityTrail";
import PaymentRow from "./PaymentRow";
import Celebration from "@/components/Celebration";
import InvoiceLiveStatus from "@/components/InvoiceLiveStatus";
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

  // One-shot confetti (per user) on the first open after a processor-verified
  // (card/ACH) payment marked it PAID — manual cash/check entries don't celebrate.
  const hasOnlinePayment = invoice.payments.some(
    (p) => p.processorRef && (p.method === "CARD" || p.method === "ACH")
  );
  const celebratePaid =
    invoice.status === "PAID" &&
    hasOnlinePayment &&
    (await shouldCelebrate(actor.id, "INVOICE_PAID", invoice.id, invoice.paidAt));

  const activity = await activityFor(companyId, "invoice", invoice.id);
  const chipStatus = invoice.status === "DRAFT" && invoice.scheduledSendAt ? "SCHEDULED" : invoice.status;
  const titleText = invoice.subject || `Invoice #${invoice.invoiceNumber}`;
  const clientName = invoice.contact
    ? `${invoice.contact.firstName} ${invoice.contact.lastName}`.trim()
    : "";

  // ── Desktop (branded header, open page) ──────────────────────────────────
  // The Made → Sent → Viewed → Paid track, from the invoice's own timestamps.
  // Only steps the data supports: a draft shows Made → Sent → Paid; Viewed
  // joins once it has gone out. The first step not done is "now".
  // An archived invoice that never went out (no issue date) was never sent.
  const sent = invoice.status !== "DRAFT" && !(invoice.status === "ARCHIVED" && !invoice.issuedAt);
  const isPaid = invoice.status === "PAID";
  const pastDue = invoice.status === "PAST_DUE";
  const steps: { key: string; label: string; done: boolean; sub: string; bad?: boolean }[] = [
    { key: "made", label: "Made", done: true, sub: shortDate(invoice.createdAt, tz) },
    {
      key: "sent",
      label: invoice.status === "DRAFT" && invoice.scheduledSendAt ? "Sends" : "Sent",
      done: sent,
      sub: sent
        ? shortDate(invoice.issuedAt ?? invoice.createdAt, tz)
        : invoice.scheduledSendAt
          ? (scheduledLine(tz, invoice.scheduledSendAt) ?? "Scheduled")
          : "Not sent yet",
    },
    ...(sent
      ? [
          {
            key: "viewed",
            label: "Viewed",
            done: Boolean(invoice.firstViewedAt) || isPaid,
            sub: invoice.firstViewedAt
              ? `${shortDate(invoice.firstViewedAt, tz)}${invoice.viewCount > 1 ? ` · ${invoice.viewCount}×` : ""}`
              : isPaid
                ? "—"
                : "Not opened yet",
          },
        ]
      : []),
    {
      key: "paid",
      label: "Paid",
      done: isPaid,
      sub: isPaid
        ? shortDate(invoice.paidAt ?? invoice.updatedAt, tz)
        : pastDue
          ? `Past due since ${shortDate(invoice.dueDate, tz)}`
          : totalPaid > 0
            ? `${money(totalPaid)} of ${money(invoice.total)} in`
            : `${money(balance)} to go`,
      bad: pastDue,
    },
  ];
  const nowIdx = steps.findIndex((s) => !s.done);

  const paymentRows = invoice.payments.map((p) => {
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
  });

  const scheduledLineEl = invoice.status === "DRAFT" && invoice.scheduledSendAt && (
    <ScheduledSendLine
      kind="invoice"
      id={invoice.id}
      label={scheduledLine(tz, invoice.scheduledSendAt) ?? ""}
      channels={channelsFromJson(invoice.scheduledSendChannels, SEND_DEFAULTS.invoice)}
      email={invoice.contact?.email ?? null}
      phone={invoice.contact?.phone ? fmtPhone(invoice.contact.phone) : null}
    />
  );

  const closeJobNudgeEl = showCloseJobNudge && (
    <Link
      prefetch={false} href={`/app/jobs/${invoice.job!.id}`}
      className="mb-6 flex items-center justify-between rounded-[var(--ds-r)] bg-[color:var(--ds-primary-soft)] px-4 py-3 transition-[filter] hover:brightness-95"
    >
      <p className="text-sm font-medium text-[color:var(--ds-ink)]">
        You may want to close this job: Job #{invoice.job!.jobNumber} — {invoice.job!.title}
      </p>
      <ArrowRight size={14} className="text-[color:var(--ds-primary)]" />
    </Link>
  );

  return (
    <DsPage className="ios-grouped"
      open
      header={
        <>
          {/* One header at every width (phones too since 2026-11-25): crumbs,
              the client as the title, the status chip, then the actions. */}
          <div className="ds-pagehead inv-head flex flex-wrap items-start justify-between gap-4 mb-6 lg:mb-0">
            <div className="min-w-0">
              {/* the collapsed-header title, once for both widths */}
              <TitleSentinel title={titleText} />
              <div>
                <p className="ds-eyebrow ds-eyebrow-plain bb-crumbs flex items-center gap-2">
                  <Link prefetch={false} href="/app/invoices">Invoices</Link>
                  <span aria-hidden>/</span>
                  <span>#{invoice.invoiceNumber}</span>
                  {invoice.subject && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{invoice.subject}</span>
                    </>
                  )}
                </p>
                <h1 className="ds-title mt-1 flex items-center gap-3">
                  <span className="ds-wipe min-w-0">
                    <span className="ds-wipe-text">
                      {invoice.contact ? (
                        <Link prefetch={false} href={`/app/contacts/${invoice.contact.id}`} className="inv-head-client">
                          {clientName || `Invoice #${invoice.invoiceNumber}`}
                        </Link>
                      ) : (
                        titleText
                      )}
                    </span>
                    <span className="ds-wipe-bar" aria-hidden />
                  </span>
                  <StatusChip kind="invoice" status={chipStatus} />
                </h1>
              </div>
            </div>
            <div className="inv-head-acts flex flex-wrap items-center gap-2">
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
        </>
      }
    >
      {/* Refreshes the page when a payment lands, wherever it came from */}
      <InvoiceLiveStatus
        invoiceId={invoice.id}
        status={invoice.status}
        paid={Math.round(invoice.payments.reduce((t, p) => t + Number(p.amount), 0) * 100) / 100}
      />
      <Celebration
        endpoint={`/api/app/invoices/${invoice.id}/celebrated`}
        celebrate={celebratePaid}
      />

      {/* ─────────────── The open page (every width) ─────────────── */}
      <BandBody>
        {(scheduledLineEl || closeJobNudgeEl) && (
          <div className="-mb-6">
            {scheduledLineEl}
            {closeJobNudgeEl}
          </div>
        )}

        {/* Summary: what's owed, the facts, the track */}
        <section className={`inv-sum ${isPaid ? "is-paid" : ""}`}>
          <div className="inv-facts">
            <div className="inv-due">
              <span className="bb-label">{isPaid ? "Paid in full" : balance > 0 ? "Amount due" : "Balance"}</span>
              <span className={`bb-big inv-due-n ${pastDue ? "is-bad" : ""}`}>
                {money(isPaid ? invoice.total : balance)}
              </span>
              {!isPaid && totalPaid > 0 && (
                <span className="bb-row-sub">of {money(invoice.total)} · {money(totalPaid)} paid</span>
              )}
            </div>
            <div className="inv-fact">
              <span className="bb-label">Invoice</span>
              <span className="bb-strong">#{invoice.invoiceNumber}</span>
            </div>
            <div className="inv-fact">
              <span className="bb-label">Issued</span>
              <span className="bb-strong">{shortDate(invoice.issuedAt ?? invoice.createdAt, tz)}</span>
            </div>
            <div className="inv-fact">
              <span className="bb-label">Due</span>
              <span className={`bb-strong ${pastDue ? "inv-bad" : ""}`}>{shortDate(invoice.dueDate, tz)}</span>
            </div>
            {invoice.job && (
              <div className="inv-fact">
                <span className="bb-label">Invoice for</span>
                <Link prefetch={false} href={`/app/jobs/${invoice.job.id}`} className="ds-link font-semibold">
                  Job #{invoice.job.jobNumber}
                </Link>
              </div>
            )}
            {sourceQuote && (
              <div className="inv-fact">
                <span className="bb-label">From quote</span>
                <Link prefetch={false} href={`/app/quotes/${sourceQuote.id}`} className="ds-link font-semibold">
                  Quote #{sourceQuote.quoteNumber}
                </Link>
              </div>
            )}
            <div className="inv-fact inv-fact-viewed">
              <ViewedFact
                firstViewedAt={invoice.firstViewedAt}
                lastViewedAt={invoice.lastViewedAt}
                viewCount={invoice.viewCount}
                sent={invoice.status !== "DRAFT"}
                tz={tz}
              />
            </div>
            {invoice.paidAt && (
              <div className="inv-fact">
                <span className="bb-label">Paid</span>
                <span className="bb-strong">{shortDate(invoice.paidAt, tz)}</span>
              </div>
            )}
            {isPaid && (
              <div className="inv-stamp-slot" aria-hidden>
                <span className="inv-stamp">Paid</span>
              </div>
            )}
          </div>

          <ol className="inv-track" aria-label="Where this invoice stands">
            {steps.map((s, i) => (
              <li
                key={s.key}
                className={`inv-step ${s.done ? "is-done" : ""} ${i === nowIdx ? "is-now" : ""} ${s.bad && i === nowIdx ? "is-bad" : ""}`}
                aria-current={i === nowIdx ? "step" : undefined}
              >
                <span className="inv-pin">{s.done && <Check size={10} strokeWidth={3.5} />}</span>
                <span className="inv-step-label">{s.label}</span>
                <span className="bb-row-sub">{s.sub}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="bb-split">
          {/* Items + totals */}
          <div className="flex min-w-0 flex-col gap-10">
            <OpenSection
              title="Items"
              count={invoice.lineItems.length}
              aside={
                invoice.status !== "PAID" ? (
                  <Link prefetch={false} href={`/app/invoices/${invoice.id}/edit`} className="ds-btn ds-btn-outline ds-btn-sm">
                    <Pencil size={14} />
                    Edit
                  </Link>
                ) : undefined
              }
            >
              <table className="bb-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="r inv-desk">Qty</th>
                    <th className="r inv-desk">Unit price</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="wrap inv-item">
                        <span className="bb-row-title inv-item-name">
                          {item.name || item.description}
                          {item.recurringInterval && (
                            <>
                              {" "}
                              <Chip tone="primary">Recurring</Chip>
                            </>
                          )}
                        </span>
                        {item.name && item.description && <span className="bb-row-sub inv-wrap">{item.description}</span>}
                        {item.serviceDate && (
                          <span className="bb-row-sub">Service date: {shortDate(item.serviceDate, tz)}</span>
                        )}
                        {/* Phone: qty × price under the name (those columns fold away) */}
                        <span className="bb-row-sub inv-ph">{Number(item.quantity)} × {money(item.unitPrice)}</span>
                      </td>
                      <td className="r ds-num inv-desk">{Number(item.quantity)}</td>
                      <td className="r ds-num inv-desk">{money(item.unitPrice)}</td>
                      <td className="r ds-num bb-strong">{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals ledger */}
              <dl className="inv-ledger">
                <div>
                  <dt>Subtotal</dt>
                  <dd className="ds-num">{money(invoice.subtotal)}</dd>
                </div>
                {invoice.discount && Number(invoice.discount) > 0 && (
                  <div className="is-good">
                    <dt>
                      Discount
                      {invoice.discountType === "PERCENT" && invoice.discountValue
                        ? ` (${Number(invoice.discountValue)}%)`
                        : ""}
                    </dt>
                    <dd className="ds-num">−{money(invoice.discount)}</dd>
                  </div>
                )}
                {invoice.tax && (
                  <div>
                    <dt>Tax ({parseFloat((Number(invoice.taxRate) * 100).toFixed(3))}%)</dt>
                    <dd className="ds-num">{money(invoice.tax)}</dd>
                  </div>
                )}
                {invoice.depositApplied && Number(invoice.depositApplied) > 0 && (
                  <div className="is-good">
                    <dt>Deposit applied</dt>
                    <dd className="ds-num">−{money(invoice.depositApplied)}</dd>
                  </div>
                )}
                <div className="is-total">
                  <dt>Total</dt>
                  <dd className="ds-num">{money(invoice.total)}</dd>
                </div>
                {feesPaid > 0 && (
                  <div>
                    <dt>Service fee</dt>
                    <dd className="ds-num">{money(feesPaid)}</dd>
                  </div>
                )}
                {totalPaid > 0 && (
                  <div className="is-good">
                    <dt>Payments</dt>
                    <dd className="ds-num">−{money(totalPaid)}</dd>
                  </div>
                )}
                <div className={`is-balance ${balance > 0 ? "" : "is-good"}`}>
                  <dt>Invoice balance</dt>
                  <dd className="ds-num">{money(balance)}</dd>
                </div>
              </dl>
            </OpenSection>

            {invoice.notes && (
              <OpenSection title="Notes">
                <p className="inv-notes">{invoice.notes}</p>
              </OpenSection>
            )}
          </div>

          {/* Inspector */}
          <div className="flex min-w-0 flex-col gap-10">
            {invoice.contact && (
              <OpenSection
                title="Client"
                aside={
                  <Link prefetch={false} href={`/app/contacts/${invoice.contact.id}`} className="bb-go">
                    Open
                  </Link>
                }
              >
                <div className="inv-client">
                  <Link prefetch={false} href={`/app/contacts/${invoice.contact.id}`} className="bb-row-title inv-client-name">
                    {clientName || "Client"}
                  </Link>
                  {invoice.contact.phone && (
                    <a href={`tel:${invoice.contact.phone}`} className="inv-client-line">
                      <Phone size={14} />
                      {fmtPhone(invoice.contact.phone)}
                    </a>
                  )}
                  {invoice.contact.email && (
                    <a href={`mailto:${invoice.contact.email}`} className="inv-client-line">
                      <Mail size={14} />
                      <span className="truncate">{invoice.contact.email}</span>
                    </a>
                  )}
                </div>
              </OpenSection>
            )}

            <OpenSection
              title="Payments"
              count={invoice.payments.length || undefined}
              aside={
                balance > 0 ? (
                  <Link prefetch={false} href={`/app/payments/new?invoiceId=${invoice.id}`} className="bb-go">
                    + Collect payment
                  </Link>
                ) : undefined
              }
            >
              {invoice.payments.length === 0 ? (
                <p className="bb-row-sub inv-empty">No payments recorded yet.</p>
              ) : (
                <div className="inv-pays">{paymentRows}</div>
              )}
            </OpenSection>
          </div>
        </div>

        <div className="inv-activity">
          <ActivityTrail rows={activity} />
        </div>
      </BandBody>
    </DsPage>
  );
}
