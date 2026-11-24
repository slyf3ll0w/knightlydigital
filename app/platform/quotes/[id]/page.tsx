import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, canSeeMoney, viaContactScope, isManager } from "@/lib/permissions";
import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import { money, shortDate, quoteDepositAmount } from "@/lib/statuses";
import { quoteExpired } from "@/lib/quote-expiry";
import StatusChip from "@/components/StatusChip";
import ScheduledSendLine from "@/components/ScheduledSendLine";
import { channelsFromJson, scheduledLine, SEND_DEFAULTS } from "@/lib/send-document";
import { BandBody, Chip, DsPage, OpenSection } from "@/components/ds";
import TitleSentinel from "@/components/TitleSentinel";
import { Check, Mail, Pencil, Phone } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import ViewedFact from "@/components/ViewedFact";
import QuoteActions from "./QuoteActions";
import RunAutomationMenu from "@/components/RunAutomationMenu";
import CollectDepositNudge from "./CollectDepositNudge";
import Celebration from "@/components/Celebration";
import { shouldCelebrate } from "@/lib/celebrations";
import { activityFor } from "@/lib/activity";
import ActivityTrail from "@/components/ActivityTrail";
import { canText, companyCanSendSms } from "@/lib/sms";
import { fmtPhone } from "@/lib/format";
import Fold from "@/components/Fold";
import PhotoGrid from "@/components/PhotoGrid";
import { PHOTO_VIEW_SELECT, toPhotoView } from "@/lib/photos";
import { featureAllowedFor } from "@/lib/plan-gate";
import { galleryPreviewFor } from "@/lib/gallery-preview";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      job: true,
      request: true,
      contracts: { orderBy: { createdAt: "desc" }, select: { status: true, signedAt: true } },
      invoices: {
        where: { kind: "DEPOSIT" },
        select: { id: true, invoiceNumber: true, status: true, total: true },
      },
      revisions: { orderBy: { revision: "desc" } },
      photos: { orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }], select: PHOTO_VIEW_SELECT },
    },
  });

  if (!quote) notFound();
  // Estimate photos are a Gallery-plan feature (lib/plans.ts "gallery");
  // the fold shows the plan card instead once the gate is live.
  // Preview: the fold exists only for test accounts until David opens it
  // (lib/gallery-preview.ts); inside the preview the plan gate still applies.
  const galleryPreview = await galleryPreviewFor(companyId);
  const galleryOpen = galleryPreview && (await featureAllowedFor(companyId, "gallery"));

  // Valid through the END of the valid-until day in the company's timezone
  const companyTz = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  const tz = companyTz?.timezone ?? "America/Chicago";
  const expired = quoteExpired(quote.validUntil, tz);
  // The deposit invoice is a money surface: SALES with payments hidden can
  // sell the quote but neither see nor issue the invoice that collects on it
  const seeMoney = canSeeMoney(actor);

  // Agreement gate: any price-book item flagged "requires agreement" (that
  // the client didn't opt out of) means conversion waits on a signature
  const needsAgreement = quote.lineItems.some(
    (li) => li.requiresAgreement && !(li.isOptional && li.optedOut)
  );
  const agreementSigned = quote.contracts.some((c) => c.status === "SIGNED");
  const agreementSent = quote.contracts.some((c) => c.status === "SENT");
  const contractTemplates = needsAgreement
    ? await prisma.contractTemplate.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const publicUrl = `${baseUrl}/quote/${quote.publicToken}`;
  // Send to Client can text the link from the business line
  const canTextClient = Boolean(quote.contact.phone) && canText(quote.contact) && (await companyCanSendSms(quote.companyId));
  const contactPhone = quote.contact.phone ? fmtPhone(quote.contact.phone) : "";
  const deposit = quoteDepositAmount(quote);
  const depositInvoice = quote.invoices[0] ?? null;

  // One-shot confetti (per user) the first time each teammate opens an
  // approved quote — client-approved online or hand-marked after a verbal
  // yes; either way the sale is won.
  const celebrateApproved =
    (quote.status === "APPROVED" || quote.status === "CONVERTED") &&
    (await shouldCelebrate(actor.id, "QUOTE_APPROVED", quote.id, quote.approvedAt));

  // ── Shared pieces (rendered once per width) ──────────────────────────────
  const chipStatus = quote.status === "DRAFT" && quote.scheduledSendAt ? "SCHEDULED" : quote.status;
  const clientName = `${quote.contact.firstName} ${quote.contact.lastName}`.trim();
  const titleText = quote.title || `Quote #${quote.quoteNumber}`;
  const activity = await activityFor(companyId, "quote", quote.id);
  const scheduledLineEl = quote.status === "DRAFT" && quote.scheduledSendAt && (
        <ScheduledSendLine
          kind="quote"
          id={quote.id}
          label={scheduledLine(tz, quote.scheduledSendAt) ?? ""}
          channels={channelsFromJson(quote.scheduledSendChannels, SEND_DEFAULTS.quote)}
          email={quote.contact.email}
          phone={contactPhone || null}
        />
      );
  const depositNudgeEl = deposit > 0 &&
        seeMoney &&
        !depositInvoice &&
        (quote.status === "APPROVED" || quote.status === "CONVERTED") && (
          <CollectDepositNudge
            quoteId={quote.id}
            amount={deposit}
            contactEmail={quote.contact.email ?? ""}
            contactPhone={contactPhone}
            canTextClient={canTextClient}
          />
        );
  const photosEl = galleryPreview && (
        <div className="mt-6">
          <Fold title="Photos" meta={quote.photos.length > 0 ? String(quote.photos.length) : "Add"}>
            <PhotoGrid
              target={{ kind: "quote", id: quote.id }}
              canSite={isManager(actor.role)}
              photos={quote.photos.map(toPhotoView)}
              locked={!galleryOpen}
            />
          </Fold>
        </div>
      );
  const revisionsEl = quote.revisions.length > 0 && (
        <div className="mt-6 ds-card p-5">
          <SectionHeader
            title="Revision history"
            hint="Captured each time a sent quote was edited — the amounts the client saw before the change."
            className="mb-3"
          />
          <ul className="space-y-2">
            {quote.revisions.map((rev) => {
              const snap = rev.snapshot as {
                sentAt?: string | null;
                lineItems?: { name: string; quantity: unknown; unitPrice: unknown }[];
              };
              const items = snap.lineItems ?? [];
              return (
                <li key={rev.id} className="flex items-baseline gap-3 text-sm">
                  <span className="shrink-0 text-xs font-semibold text-gray-500">
                    Rev {rev.revision}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                    {items.length} item{items.length === 1 ? "" : "s"}
                    {snap.sentAt &&
                      ` · sent ${new Date(snap.sentAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: tz,
                      })}`}
                    {" · replaced "}
                    {shortDate(rev.createdAt, tz)}
                  </span>
                  <span className="ds-num shrink-0 font-medium text-gray-700">
                    {money(rev.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );

  // ── Desktop: the open page (2026-11-24), mirroring the invoice ──────────
  // Made → Sent → Viewed → Approved (or Changes requested) → Job, from the
  // quote's own timestamps. Viewed joins once it has gone out; the first step
  // not done is "now".
  const sent = Boolean(quote.sentAt);
  const won = quote.status === "APPROVED" || quote.status === "CONVERTED" || Boolean(quote.approvedAt);
  const changes = quote.status === "CHANGES_REQUESTED";
  const openStatus = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(quote.status);
  const lapsed = expired && openStatus;
  const converted = quote.status === "CONVERTED" || Boolean(quote.job);
  const steps: { key: string; label: string; done: boolean; sub: string; tone?: "warn" | "bad" }[] = [
    { key: "made", label: "Made", done: true, sub: shortDate(quote.createdAt, tz) },
    {
      key: "sent",
      label: quote.status === "DRAFT" && quote.scheduledSendAt ? "Sends" : "Sent",
      done: sent,
      sub: sent
        ? shortDate(quote.sentAt!, tz)
        : quote.scheduledSendAt
          ? (scheduledLine(tz, quote.scheduledSendAt) ?? "Scheduled")
          : "Not sent yet",
    },
    ...(sent
      ? [
          {
            key: "viewed",
            label: "Viewed",
            done: Boolean(quote.firstViewedAt) || won,
            sub: quote.firstViewedAt
              ? `${shortDate(quote.firstViewedAt, tz)}${quote.viewCount > 1 ? ` · ${quote.viewCount}×` : ""}`
              : won
                ? "—"
                : "Not opened yet",
          },
        ]
      : []),
    {
      key: "decision",
      label: changes ? "Changes requested" : "Approved",
      done: won,
      sub: won
        ? `${quote.approvedAt ? shortDate(quote.approvedAt, tz) : "Yes"}${quote.signatureName ? ` · ${quote.signatureName}` : ""}`
        : changes
          ? "Waiting on your update"
          : lapsed && quote.validUntil
            ? `Expired ${shortDate(quote.validUntil, tz)}`
            : quote.validUntil
              ? `Good until ${shortDate(quote.validUntil, tz)}`
              : "Waiting on the client",
      tone: changes ? "warn" : lapsed ? "bad" : undefined,
    },
    {
      key: "job",
      label: "Job",
      done: converted,
      sub: quote.job ? `Job #${quote.job.jobNumber}` : won ? "Ready to schedule" : "After approval",
    },
  ];
  const nowIdx = steps.findIndex((st) => !st.done);
  const canEdit = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(quote.status);

  return (
    <DsPage
      open
      header={
        <>
          {/* Phone: back + status row (unchanged) */}
          <div className="flex items-center gap-3 mb-4 lg:hidden">
            <BackLink href="/app/quotes" />
            <StatusChip kind="quote" status={chipStatus} />
          </div>

          {/* One header for both widths, so QuoteActions (and its dialogs)
              mounts once. Phone: the title + client link as before. Desktop:
              crumbs, the client as the title, the status chip. */}
          <div className="ds-pagehead qt-head flex flex-wrap items-start justify-between gap-4 mb-6 lg:mb-0">
            <div className="min-w-0">
              <TitleSentinel title={titleText} />
              <div className="lg:hidden">
                <PageTitle
                  sub={
                    <Link prefetch={false} href={`/app/contacts/${quote.contactId}`} className="ds-link hover:underline">
                      {quote.contact.firstName} {quote.contact.lastName}
                    </Link>
                  }
                >
                  <>{titleText}</>
                </PageTitle>
              </div>
              <div className="hidden lg:block">
                <p className="ds-eyebrow ds-eyebrow-plain bb-crumbs flex items-center gap-2">
                  <Link prefetch={false} href="/app/quotes">Quotes</Link>
                  <span aria-hidden>/</span>
                  <span>#{quote.quoteNumber}</span>
                  {quote.title && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{quote.title}</span>
                    </>
                  )}
                </p>
                <h1 className="ds-title mt-1 flex items-center gap-3">
                  <span className="ds-wipe min-w-0">
                    <span className="ds-wipe-text">
                      <Link prefetch={false} href={`/app/contacts/${quote.contactId}`} className="qt-head-client">
                        {clientName || titleText}
                      </Link>
                    </span>
                    <span className="ds-wipe-bar" aria-hidden />
                  </span>
                  <StatusChip kind="quote" status={chipStatus} />
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RunAutomationMenu entity="quote" entityId={quote.id} manager={isManager(actor.role)} />
              <QuoteActions
                quoteId={quote.id}
                status={quote.status}
                publicUrl={publicUrl}
                hasJob={!!quote.jobId}
                wasSent={!!quote.sentAt}
                contactId={quote.contactId}
                contactEmail={quote.contact.email ?? ""}
                contactPhone={contactPhone}
                canTextClient={canTextClient}
                agreement={
                  needsAgreement
                    ? { signed: agreementSigned, sent: agreementSent, templates: contractTemplates }
                    : null
                }
                hasDeposit={deposit > 0}
                depositInvoiced={!!depositInvoice}
                canDelete={isManager(actor.role)}
                scheduled={Boolean(quote.scheduledSendAt)}
                tz={tz}
              />
            </div>
          </div>
        </>
      }
    >
      <Celebration
        endpoint={`/api/app/quotes/${quote.id}/celebrated`}
        celebrate={celebrateApproved}
      />

      {/* ─────────────── Phone (unchanged) ─────────────── */}
      <div className="lg:hidden">
      {scheduledLineEl}

      {/* Approved with an uncollected deposit → make collecting it the obvious next step */}
      {depositNudgeEl}

      {/* Header facts (Jobber-style definition list with backlinks) —
          2-col grid on phones, flowing definition list at a desk */}
      <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-wrap lg:gap-x-8 lg:gap-y-2 px-5 py-4 ds-card mb-6 text-sm">
        <div>
          <span className="text-xs font-medium text-gray-500 block">Quote #</span>
          <span className="text-gray-800">{quote.quoteNumber}</span>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 block">Created</span>
          <span className="text-gray-800">{shortDate(quote.createdAt, tz)}</span>
        </div>
        <ViewedFact
          firstViewedAt={quote.firstViewedAt}
          lastViewedAt={quote.lastViewedAt}
          viewCount={quote.viewCount}
          sent={!!quote.sentAt}
          tz={tz}
        />
        {quote.validUntil && (
          <div>
            <span className="text-xs font-medium text-gray-500 block">Valid until</span>
            <span
              className={
                expired &&
                ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(quote.status)
                  ? "font-medium text-[color:var(--ds-bad)]"
                  : "text-gray-800"
              }
            >
              {shortDate(quote.validUntil, tz)}
              {expired && ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(quote.status)
                ? " · Expired"
                : ""}
            </span>
          </div>
        )}
        {/* The required amount is quote pricing (any seller); the invoice it
            became is money (canSeeMoney) */}
        {deposit > 0 && (!depositInvoice || seeMoney) && (
          <div>
            <span className="text-xs font-medium text-gray-500 block">
              {depositInvoice ? "Deposit" : "Required deposit"}
            </span>
            {depositInvoice ? (
              <Link
                prefetch={false} href={`/app/invoices/${depositInvoice.id}`}
                className={`font-medium hover:underline ${
                  depositInvoice.status === "PAID" ? "text-[color:var(--ds-good)]" : "text-[color:var(--ds-warn)]"
                }`}
              >
                {money(depositInvoice.total)} ·{" "}
                {depositInvoice.status === "PAID" ? "Paid" : "Invoiced"} (#
                {depositInvoice.invoiceNumber})
              </Link>
            ) : (
              <span className="text-gray-800 font-semibold">{money(deposit)}</span>
            )}
          </div>
        )}
        {needsAgreement && (
          <div>
            <span className="text-xs font-medium text-gray-500 block">Agreement</span>
            <span
              className={`font-medium ${
                agreementSigned ? "text-[color:var(--ds-good)]" : agreementSent ? "text-[color:var(--ds-warn)]" : "text-[color:var(--ds-bad)]"
              }`}
            >
              {agreementSigned
                ? "Signed"
                : agreementSent
                  ? "Awaiting signature"
                  : "Required — not sent"}
            </span>
          </div>
        )}
        {quote.request && (
          <div>
            <span className="text-xs font-medium text-gray-500 block">From request</span>
            <Link
              prefetch={false} href={`/app/requests/${quote.requestId}`}
              className="ds-link hover:underline"
            >
              {quote.request.title}
            </Link>
          </div>
        )}
        {quote.job && (
          <div>
            <span className="text-xs font-medium text-gray-500 block">Used for</span>
            <Link prefetch={false} href={`/app/jobs/${quote.jobId}`} className="ds-link hover:underline">
              Job #{quote.job.jobNumber}
            </Link>
          </div>
        )}
        {quote.approvedAt && (
          <div>
            <span className="text-xs font-medium text-gray-500 block">Approved</span>
            <span className="text-gray-800">
              {shortDate(quote.approvedAt, tz)}
              {quote.signatureName ? ` by ${quote.signatureName}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Changes requested note */}
      {quote.status === "CHANGES_REQUESTED" && quote.changeRequest && (
        <div className="mb-6 rounded-[var(--ds-r)] bg-[color:var(--ds-warn-soft)] px-4 py-3 text-sm text-[color:var(--ds-ink)]">
          <span className="font-semibold">Client requested changes:</span> {quote.changeRequest}
          <span className="block mt-1 text-[color:var(--ds-warn)]">
            <Link prefetch={false} href={`/app/quotes/${quote.id}/edit`} className="font-semibold underline">
              Edit the quote
            </Link>{" "}
            and email it to them again — it goes back to Awaiting Response.
          </span>
        </div>
      )}

      {/* Quote body */}
      <div className="ds-card overflow-hidden">
        {quote.clientMessage && (
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.clientMessage}</p>
          </div>
        )}

        {/* Line items — stacked rows on phones */}
        <div className="lg:hidden divide-y divide-gray-100">
          {quote.lineItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-3 px-4 py-3 ${
                item.isOptional && item.optedOut ? "opacity-40" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold text-gray-900">
                  {item.name || item.description}
                  {/* explicit spaces — JSX drops line-break whitespace, and
                      without them screen readers hear "ReplacementOptional" */}
                  {item.isOptional && " "}
                  {item.isOptional && (
                    <Chip>Optional{item.optedOut ? " — removed by client" : ""}</Chip>
                  )}
                  {item.recurringInterval && " "}
                  {item.recurringInterval && (
                    <Chip tone="primary">Recurring</Chip>
                  )}
                </p>
                {item.name && item.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
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
                  Product / Service
                </th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold w-16">
                  Qty
                </th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold w-24">
                  Unit Price
                </th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold w-24">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quote.lineItems.map((item) => (
                <tr key={item.id} className={item.isOptional && item.optedOut ? "opacity-40" : ""}>
                  <td className="py-3">
                    <p className="text-gray-900 font-medium">
                      {item.name || item.description}
                      {/* explicit spaces — JSX drops line-break whitespace, and
                          without them screen readers hear "ReplacementOptional" */}
                      {item.isOptional && " "}
                      {item.isOptional && (
                        <Chip>Optional{item.optedOut ? " — removed by client" : ""}</Chip>
                      )}
                      {item.recurringInterval && " "}
                      {item.recurringInterval && (
                        <Chip tone="primary">Recurring</Chip>
                      )}
                    </p>
                    {item.name && item.description && (
                      <p className="text-gray-500 text-xs mt-0.5">{item.description}</p>
                    )}
                  </td>
                  <td className="ds-num py-3 text-right text-gray-600">{Number(item.quantity)}</td>
                  <td className="ds-num py-3 text-right text-gray-600">{money(item.unitPrice)}</td>
                  <td className="ds-num py-3 text-right font-medium text-gray-900">{money(item.total)}</td>
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
              <span className="ds-num text-gray-800">{money(quote.subtotal)}</span>
            </div>
            {quote.discount && Number(quote.discount) > 0 && (
              <div className="flex justify-between text-[color:var(--ds-good)]">
                <span>
                  Discount
                  {quote.discountType === "PERCENT" && quote.discountValue
                    ? ` (${Number(quote.discountValue)}%)`
                    : ""}
                </span>
                <span className="ds-num">−{money(quote.discount)}</span>
              </div>
            )}
            {quote.tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Tax ({parseFloat((Number(quote.taxRate) * 100).toFixed(3))}%)
                </span>
                <span className="ds-num text-gray-800">{money(quote.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-gray-200">
              <span className="text-gray-900">Total</span>
              <span className="ds-num text-gray-900">{money(quote.total)}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-[color:var(--ds-primary)]">
                <span>
                  Required deposit
                  {quote.depositType === "PERCENT" ? ` (${Number(quote.depositValue)}%)` : ""}
                </span>
                <span className="ds-num font-semibold">{money(deposit)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        {quote.disclaimer && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">
              Contract / Disclaimer
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.disclaimer}</p>
          </div>
        )}

        {/* Internal notes */}
        {quote.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">Internal notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>

      {/* Site-visit photos: what was looked at before the price. They ride
          onto the job when the quote converts (lib/quote-convert.ts).
          Test accounts only until the Gallery work is opened. */}
      {photosEl}

      {revisionsEl}

      <div className="mt-6">
        <ActivityTrail rows={activity} />
      </div>
      </div>

      {/* ─────────────── Desktop: the open page ─────────────── */}
      <BandBody className="hidden lg:flex">
        {(scheduledLineEl || depositNudgeEl) && (
          <div className="-mb-6">
            {scheduledLineEl}
            {depositNudgeEl}
          </div>
        )}

        {/* Summary: the total, the facts, the track */}
        <section className={`inv-sum qt-sum ${won ? "is-won" : ""}`}>
          <div className="inv-facts">
            <div className="inv-due">
              <span className="bb-label">Quote total</span>
              <span className="bb-big inv-due-n">{money(quote.total)}</span>
              {deposit > 0 && (!depositInvoice || seeMoney) && (
                <span className="bb-row-sub">
                  {depositInvoice ? "Deposit " : "Deposit required · "}
                  {depositInvoice ? (
                    <Link
                      prefetch={false}
                      href={`/app/invoices/${depositInvoice.id}`}
                      className={depositInvoice.status === "PAID" ? "qt-good" : "qt-warn"}
                    >
                      {money(depositInvoice.total)} · {depositInvoice.status === "PAID" ? "Paid" : "Invoiced"} (#{depositInvoice.invoiceNumber})
                    </Link>
                  ) : (
                    money(deposit)
                  )}
                </span>
              )}
            </div>
            <div className="inv-fact">
              <span className="bb-label">Quote</span>
              <span className="bb-strong">#{quote.quoteNumber}</span>
            </div>
            <div className="inv-fact">
              <span className="bb-label">Created</span>
              <span className="bb-strong">{shortDate(quote.createdAt, tz)}</span>
            </div>
            {quote.validUntil && (
              <div className="inv-fact">
                <span className="bb-label">Good until</span>
                <span className={`bb-strong ${lapsed ? "inv-bad" : ""}`}>
                  {shortDate(quote.validUntil, tz)}
                  {lapsed ? " · Expired" : ""}
                </span>
              </div>
            )}
            <div className="inv-fact inv-fact-viewed">
              <ViewedFact
                firstViewedAt={quote.firstViewedAt}
                lastViewedAt={quote.lastViewedAt}
                viewCount={quote.viewCount}
                sent={!!quote.sentAt}
                tz={tz}
              />
            </div>
            {needsAgreement && (
              <div className="inv-fact">
                <span className="bb-label">Agreement</span>
                <span className={`bb-strong ${agreementSigned ? "qt-good" : agreementSent ? "qt-warn" : "inv-bad"}`}>
                  {agreementSigned ? "Signed" : agreementSent ? "Awaiting signature" : "Required — not sent"}
                </span>
              </div>
            )}
            {quote.request && (
              <div className="inv-fact">
                <span className="bb-label">From request</span>
                <Link prefetch={false} href={`/app/requests/${quote.requestId}`} className="ds-link font-semibold qt-fact-link">
                  {quote.request.title}
                </Link>
              </div>
            )}
            {quote.job && (
              <div className="inv-fact">
                <span className="bb-label">Used for</span>
                <Link prefetch={false} href={`/app/jobs/${quote.jobId}`} className="ds-link font-semibold">
                  Job #{quote.job.jobNumber}
                </Link>
              </div>
            )}
            {won && (
              <div className="inv-stamp-slot" aria-hidden>
                <span className="inv-stamp">Approved</span>
              </div>
            )}
          </div>

          <ol className="inv-track" aria-label="Where this quote stands">
            {steps.map((st, i) => (
              <li
                key={st.key}
                className={`inv-step ${st.done ? "is-done" : ""} ${i === nowIdx ? "is-now" : ""} ${i === nowIdx && st.tone === "bad" ? "is-bad" : ""} ${i === nowIdx && st.tone === "warn" ? "qt-step-warn" : ""}`}
                aria-current={i === nowIdx ? "step" : undefined}
              >
                <span className="inv-pin">{st.done && <Check size={10} strokeWidth={3.5} />}</span>
                <span className="inv-step-label">{st.label}</span>
                <span className="bb-row-sub">{st.sub}</span>
              </li>
            ))}
          </ol>
        </section>

        {changes && quote.changeRequest && (
          <OpenSection
            title="The client asked for changes"
            className="qt-ask"
            aside={
              <Link prefetch={false} href={`/app/quotes/${quote.id}/edit`} className="bb-go">
                Edit the quote
              </Link>
            }
          >
            <blockquote className="qt-ask-msg">“{quote.changeRequest}”</blockquote>
            <p className="bb-row-sub">Edit it and send it again — it goes back to Awaiting response.</p>
          </OpenSection>
        )}

        <div className="bb-split">
          {/* Items + totals, then what the client reads */}
          <div className="flex min-w-0 flex-col gap-10">
            <OpenSection
              title="Items"
              count={quote.lineItems.length}
              aside={
                canEdit ? (
                  <Link prefetch={false} href={`/app/quotes/${quote.id}/edit`} className="ds-btn ds-btn-outline ds-btn-sm">
                    <Pencil size={14} />
                    Edit
                  </Link>
                ) : undefined
              }
            >
              <table className="bb-table">
                <thead>
                  <tr>
                    <th>Product / service</th>
                    <th className="r">Qty</th>
                    <th className="r">Unit price</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((item) => (
                    <tr key={item.id} className={item.isOptional && item.optedOut ? "qt-out" : ""}>
                      <td className="wrap inv-item">
                        <span className="bb-row-title inv-item-name">
                          {item.name || item.description}
                          {item.isOptional && " "}
                          {item.isOptional && <Chip>Optional{item.optedOut ? " — removed by client" : ""}</Chip>}
                          {item.recurringInterval && " "}
                          {item.recurringInterval && <Chip tone="primary">Recurring</Chip>}
                        </span>
                        {item.name && item.description && <span className="bb-row-sub inv-wrap">{item.description}</span>}
                      </td>
                      <td className="r ds-num">{Number(item.quantity)}</td>
                      <td className="r ds-num">{money(item.unitPrice)}</td>
                      <td className="r ds-num bb-strong">{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="inv-ledger">
                <div>
                  <dt>Subtotal</dt>
                  <dd className="ds-num">{money(quote.subtotal)}</dd>
                </div>
                {quote.discount && Number(quote.discount) > 0 && (
                  <div className="is-good">
                    <dt>
                      Discount
                      {quote.discountType === "PERCENT" && quote.discountValue ? ` (${Number(quote.discountValue)}%)` : ""}
                    </dt>
                    <dd className="ds-num">−{money(quote.discount)}</dd>
                  </div>
                )}
                {quote.tax && (
                  <div>
                    <dt>Tax ({parseFloat((Number(quote.taxRate) * 100).toFixed(3))}%)</dt>
                    <dd className="ds-num">{money(quote.tax)}</dd>
                  </div>
                )}
                <div className="is-total">
                  <dt>Total</dt>
                  <dd className="ds-num">{money(quote.total)}</dd>
                </div>
                {deposit > 0 && (
                  <div className="qt-deposit">
                    <dt>
                      Required deposit
                      {quote.depositType === "PERCENT" ? ` (${Number(quote.depositValue)}%)` : ""}
                    </dt>
                    <dd className="ds-num">{money(deposit)}</dd>
                  </div>
                )}
              </dl>
            </OpenSection>

            {quote.clientMessage && (
              <OpenSection title="Message to the client">
                <p className="inv-notes">{quote.clientMessage}</p>
              </OpenSection>
            )}
            {quote.disclaimer && (
              <OpenSection title="Contract / disclaimer">
                <p className="inv-notes">{quote.disclaimer}</p>
              </OpenSection>
            )}
            {quote.notes && (
              <OpenSection title="Internal notes">
                <p className="inv-notes">{quote.notes}</p>
              </OpenSection>
            )}
          </div>

          {/* Inspector */}
          <div className="flex min-w-0 flex-col gap-10">
            <OpenSection
              title="Client"
              aside={
                <Link prefetch={false} href={`/app/contacts/${quote.contactId}`} className="bb-go">
                  Open
                </Link>
              }
            >
              <div className="inv-client">
                <Link prefetch={false} href={`/app/contacts/${quote.contactId}`} className="bb-row-title inv-client-name">
                  {clientName || "Client"}
                </Link>
                {quote.contact.phone && (
                  <a href={`tel:${quote.contact.phone}`} className="inv-client-line">
                    <Phone size={14} />
                    {contactPhone}
                  </a>
                )}
                {quote.contact.email && (
                  <a href={`mailto:${quote.contact.email}`} className="inv-client-line">
                    <Mail size={14} />
                    <span className="truncate">{quote.contact.email}</span>
                  </a>
                )}
              </div>
            </OpenSection>

            {quote.revisions.length > 0 && (
              <OpenSection
                title="Revisions"
                count={quote.revisions.length}
                info="Captured each time a sent quote was edited — the amounts the client saw before the change."
              >
                <div className="bb-rows">
                  {quote.revisions.map((rev) => {
                    const snap = rev.snapshot as { sentAt?: string | null; lineItems?: unknown[] };
                    const n = snap.lineItems?.length ?? 0;
                    return (
                      <div key={rev.id} className="bb-row">
                        <span className="bb-row-main">
                          <span className="bb-row-title">Revision {rev.revision}</span>
                          <span className="bb-row-sub">
                            {n} item{n === 1 ? "" : "s"}
                            {snap.sentAt &&
                              ` · sent ${new Date(snap.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })}`}
                            {" · replaced "}
                            {shortDate(rev.createdAt, tz)}
                          </span>
                        </span>
                        <span className="ds-num bb-strong">{money(rev.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </OpenSection>
            )}
          </div>
        </div>

        {photosEl}

        <div className="qt-activity">
          <ActivityTrail rows={activity} />
        </div>
      </BandBody>
    </DsPage>
  );
}
