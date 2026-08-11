/**
 * Recurring services engine.
 *
 * A recurring price-book service (WorkItem.recurringInterval set) spawns a
 * Subscription the first time it's sold — through the quote→job pipeline, a
 * direct invoice, or a web-form service request. `runDueSubscriptions` then
 * sweeps ACTIVE subscriptions whose nextRunDate is due and generates the next
 * invoice (and optionally a job) for each cycle.
 *
 * A series can bill per completed visit instead (Subscription.billPerVisit):
 * the job status route calls `billCompletedVisit` when a series visit wraps,
 * which mints + sends/charges that visit's invoice on the spot.
 *
 * Billing settles through lib/auto-charge.ts: when a processor is live and
 * the client has a card on file (the series' pinned SavedCard, the default
 * SavedCard, or the legacy Contact.processorCustomerRef mirror), the engine
 * auto-charges and records the payment; declines book a retry schedule +
 * dunning. With no card at all it falls back to emailing a pay-by-link.
 */

import { randomBytes } from "crypto";
import type { Frequency, Prisma, PrismaClient, RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { attemptAutoCharge } from "@/lib/auto-charge";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";
import { localDayParts, wallTimeToUtc } from "@/lib/booking-slots";
import { withDocNumberRetry } from "@/lib/doc-numbers";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Add N calendar months, clamping the day-of-month to the target month's length
 * so month-end anchors don't overflow. Plain `setMonth(+1)` on Jan 31 rolls to
 * "Feb 31" → Mar 3, silently skipping February and drifting the anchor forever;
 * this keeps Jan 31 → Feb 28/29, Mar 31 → Apr 30, etc. Time-of-day is preserved.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const targetDay = d.getDate();
  d.setDate(1); // avoid transient overflow while shifting the month
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return d;
}

/** Add one billing interval to a date. SEMIANNUAL = +6 months ("biannually"). */
export function addInterval(date: Date, interval: RecurringInterval): Date {
  switch (interval) {
    case "MONTHLY":
      return addMonthsClamped(date, 1);
    case "QUARTERLY":
      return addMonthsClamped(date, 3);
    case "SEMIANNUAL":
      return addMonthsClamped(date, 6);
    case "ANNUAL":
      // +12 months (not setFullYear) so Feb 29 clamps to Feb 28 next year
      return addMonthsClamped(date, 12);
  }
}

/**
 * Advance a billing cursor by whole intervals until it's out of the past —
 * used when resuming a paused/cancelled series so the client isn't
 * retro-billed one full cycle per sweep for the time the series sat paused.
 * Keeps the original anchor day (day-of-month) rather than re-anchoring.
 */
export function rollCursorForward(
  cursor: Date,
  interval: RecurringInterval,
  from: Date = new Date()
): Date {
  let next = cursor;
  while (next < from) next = addInterval(next, interval);
  return next;
}

/** Human label for an interval, e.g. for badges and client-facing pages. */
export function intervalLabel(interval: RecurringInterval): string {
  return {
    MONTHLY: "month",
    QUARTERLY: "quarter",
    SEMIANNUAL: "6 months",
    ANNUAL: "year",
  }[interval];
}

/** Add one visit-cadence step. Weekly/biweekly are exact-day; the rest clamp. */
export function addVisitInterval(date: Date, frequency: Frequency): Date {
  switch (frequency) {
    case "WEEKLY":
      return new Date(date.getTime() + 7 * 86400000);
    case "BIWEEKLY":
      return new Date(date.getTime() + 14 * 86400000);
    case "MONTHLY":
      return addMonthsClamped(date, 1);
    case "QUARTERLY":
      return addMonthsClamped(date, 3);
    case "ANNUALLY":
      return addMonthsClamped(date, 12);
  }
}

export const visitFrequencyLabel: Record<Frequency, string> = {
  WEEKLY: "Every week",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Every month",
  QUARTERLY: "Every 3 months",
  ANNUALLY: "Every year",
};

/** noon-anchored "today + interval" so dates never drift across timezones. */
export function firstRunDate(interval: RecurringInterval): Date {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  return addInterval(base, interval);
}

/** Noon-anchored 1st of the next month — the consolidated-billing cursor. */
export function firstOfNextMonth(from: Date = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1, 12, 0, 0, 0);
}

/**
 * Ensure ACTIVE subscriptions exist for the recurring services in `picks`.
 * Idempotent per (contact, workItem): an existing ACTIVE subscription for the
 * same service is left as-is rather than duplicated. Reads the live WorkItem so
 * the company's current recurring config (interval, createsJob, invoiceMode,
 * price) is captured. Call inside the same transaction that creates the work.
 */
export async function ensureSubscriptionsForContact(
  tx: Tx,
  companyId: string,
  contactId: string,
  picks: { workItemId?: string | null; quantity?: number }[]
): Promise<void> {
  const ids = Array.from(
    new Set(picks.map((p) => p.workItemId).filter((id): id is string => !!id))
  );
  if (ids.length === 0) return;

  const items = await tx.workItem.findMany({
    where: { id: { in: ids }, companyId, recurringInterval: { not: null } },
  });
  if (items.length === 0) return;

  // quantity by workItemId (first occurrence wins; recurring lines are 1 service)
  const qtyById = new Map<string, number>();
  for (const p of picks) {
    if (p.workItemId && !qtyById.has(p.workItemId)) {
      qtyById.set(p.workItemId, Number(p.quantity) || 1);
    }
  }

  for (const item of items) {
    const interval = item.recurringInterval!;
    const existing = await tx.subscription.findFirst({
      where: { companyId, contactId, workItemId: item.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) continue;

    await tx.subscription.create({
      data: {
        companyId,
        contactId,
        workItemId: item.id,
        name: item.name,
        description: item.description,
        unitPrice: item.unitPrice,
        quantity: qtyById.get(item.id) ?? 1,
        interval,
        createsJob: item.recurringCreatesJob,
        invoiceMode: item.recurringInvoiceMode,
        status: "ACTIVE",
        nextRunDate: firstRunDate(interval),
      },
    });
  }
}

type DueSub = Prisma.SubscriptionGetPayload<{ include: { contact: true } }>;

/**
 * Engine-generated invoices charge the company's default sales-tax rate, the
 * same as a hand-made invoice — without this, every recurring/per-visit
 * invoice ships tax-free while one-off invoices tax, and the business quietly
 * under-collects. Rounding matches lib/quote-totals.
 */
async function applyCompanyTax(
  tx: Tx,
  companyId: string,
  subtotal: number
): Promise<{ taxRate: number | null; tax: number | null; total: number }> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { defaultTaxRate: true },
  });
  const rate = company?.defaultTaxRate ? Number(company.defaultTaxRate) : null;
  if (!rate) return { taxRate: null, tax: null, total: subtotal };
  const tax = Math.round(subtotal * rate * 100) / 100;
  return { taxRate: rate, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

/**
 * Post-commit settlement for an engine-generated SEND invoice: auto-charge
 * via lib/auto-charge.ts (pinned/default SavedCard, falling back to the
 * legacy contact mirror), otherwise email a pay-by-link. A declined card
 * never throws — the failure books its own retry schedule and dunning
 * (client "card declined" email, owner push, ActivityLog), so this only
 * sends the plain pay-link email when there was no card to try at all.
 */
async function settleGeneratedInvoice(opts: {
  companyId: string;
  subscriptionId: string;
  contact: { email: string | null };
  serviceName: string;
  invoiceId: string;
  invoiceNumber: number;
  publicToken: string;
  amount: number;
  chargeDescription: string;
  paymentDetails: string;
}): Promise<"charged" | "billed"> {
  const outcome = await attemptAutoCharge({
    companyId: opts.companyId,
    invoiceId: opts.invoiceId,
    subscriptionId: opts.subscriptionId,
    amount: opts.amount,
    chargeDescription: opts.chargeDescription,
    paymentDetails: opts.paymentDetails,
  });
  if (outcome === "charged") return "charged";
  // "failed" already emailed the client its own payment-issue note — don't
  // stack a second, contradictory "here's your invoice" email on top.
  if (outcome === "failed") return "billed";

  if (opts.contact.email) {
    const company = await prisma.company.findUnique({
      where: { id: opts.companyId },
      select: {
        name: true,
        email: true,
        brandColor: true,
        documentColor: true,
        brandColorSecondary: true,
        logoUrl: true,
      },
    });
    if (company) {
      const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
      const { subject, html } = invoiceLinkEmail({
        brand: company,
        companyName: company.name,
        invoiceNumber: opts.invoiceNumber,
        total: opts.amount,
        payUrl: `${baseUrl}/pay/${opts.publicToken}`,
        serviceNames: [opts.serviceName],
      });
      await sendEmail({
        companyId: opts.companyId,
        to: opts.contact.email,
        subject,
        html,
        replyTo: company.email || undefined,
        fromName: company.name,
      });
    }
  }
  return "billed";
}

/**
 * Generate one cycle for a single subscription: optional job, an invoice, and
 * either an auto-charge or a pay-link email. The invoice + nextRunDate advance
 * commit FIRST in one transaction (with an optimistic claim on nextRunDate so
 * overlapping runs can't double-bill); the charge happens post-commit, so a
 * transaction timeout can never roll back an invoice whose card was already
 * charged. If the process dies between commit and charge, the invoice simply
 * sits unpaid and the normal reminder/dunning flow picks it up — never a
 * second charge.
 */
async function generateCycle(sub: DueSub, now: Date): Promise<"billed" | "drafted" | "charged"> {
  // Standalone recurring-job series never reach here (the sweep filters on
  // nextRunDate), but guard anyway — billing math needs a cadence.
  const interval = sub.interval;
  if (!interval) return "drafted";
  const lineTotal = Math.round(Number(sub.unitPrice) * Number(sub.quantity) * 100) / 100;

  // Retried as a whole: the cron can overlap a staff member creating an
  // invoice or job in the same company, and the optimistic claim inside is
  // re-read on each attempt, so a retry can't double-bill a cycle.
  const cycle = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    // Idempotency: bail if another run already advanced this subscription past
    // the due date we picked it up for.
    const fresh = await tx.subscription.findUnique({
      where: { id: sub.id },
      select: { nextRunDate: true, status: true },
    });
    if (!fresh || fresh.status !== "ACTIVE" || !fresh.nextRunDate || fresh.nextRunDate > now) {
      return null; // already handled by a concurrent run (or billing removed)
    }

    // Optimistic claim: advance the schedule keyed on the exact nextRunDate we
    // read. A concurrent run for the same cycle matches zero rows and bails.
    const claimed = await tx.subscription.updateMany({
      where: { id: sub.id, status: "ACTIVE", nextRunDate: fresh.nextRunDate },
      data: {
        nextRunDate: addInterval(fresh.nextRunDate, interval),
        lastGeneratedAt: now,
      },
    });
    if (claimed.count === 0) return null;

    // Optional job for visit-based recurring work. When the subscription has
    // its own visit series (visitFrequency), the visit engine owns job
    // creation — the billing cycle only mints the invoice.
    if (sub.createsJob && !sub.visitFrequency) {
      const lastJob = await tx.job.findFirst({
        where: { companyId: sub.companyId },
        orderBy: { jobNumber: "desc" },
        select: { jobNumber: true },
      });
      await tx.job.create({
        data: {
          companyId: sub.companyId,
          contactId: sub.contactId,
          subscriptionId: sub.id,
          jobNumber: (lastJob?.jobNumber ?? 0) + 1,
          title: sub.name,
          leadSource: sub.contact.leadSource,
          address: sub.contact.address,
          lineItems: {
            create: {
              name: sub.name,
              description: sub.description,
              quantity: sub.quantity,
              unitPrice: sub.unitPrice,
              total: lineTotal,
              recurringInterval: sub.interval,
              sortOrder: 0,
            },
          },
        },
      });
    }

    const send = sub.invoiceMode === "SEND";
    const lastInv = await tx.invoice.findFirst({
      where: { companyId: sub.companyId },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    const money = await applyCompanyTax(tx, sub.companyId, lineTotal);
    const dueDate = new Date(now.getTime() + sub.contact.paymentTermsDays * 86400000);
    const invoice = await tx.invoice.create({
      data: {
        companyId: sub.companyId,
        publicToken: randomBytes(24).toString("hex"),
        contactId: sub.contactId,
        subscriptionId: sub.id,
        invoiceNumber: (lastInv?.invoiceNumber ?? 0) + 1,
        subject: sub.name,
        status: send ? "AWAITING_PAYMENT" : "DRAFT",
        subtotal: lineTotal,
        taxRate: money.taxRate,
        tax: money.tax,
        total: money.total,
        issuedAt: send ? now : null,
        dueDate: send ? dueDate : null,
        lineItems: {
          create: {
            name: sub.name,
            description: sub.description ?? "",
            quantity: sub.quantity,
            unitPrice: sub.unitPrice,
            total: lineTotal,
            recurringInterval: sub.interval,
            sortOrder: 0,
          },
        },
      },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      publicToken: invoice.publicToken,
      total: money.total,
      send,
    };
  }));

  if (!cycle || !cycle.send) return "drafted";

  // Post-commit: the cycle (invoice + schedule advance) is durable before any
  // external call, so a slow or crashed charge leaves an unpaid invoice for
  // dunning instead of rolling back a billed cycle.
  return settleGeneratedInvoice({
    companyId: sub.companyId,
    subscriptionId: sub.id,
    contact: sub.contact,
    serviceName: sub.name,
    invoiceId: cycle.invoiceId,
    invoiceNumber: cycle.invoiceNumber,
    publicToken: cycle.publicToken,
    amount: cycle.total,
    chargeDescription: `${sub.name} — subscription`,
    paymentDetails: "Auto-charged (recurring subscription)",
  });
}

/**
 * Per-visit billing: called when a series visit job is completed. If the job
 * belongs to a billPerVisit subscription and has no invoice yet, mints the
 * visit's invoice (unitPrice × quantity, sent or drafted per invoiceMode),
 * archives the job — the same convention as manually invoicing a completed
 * job — and then auto-charges the card on file / emails the pay link when
 * sending. Idempotent via the one-invoice-per-job unique constraint, so a
 * replayed completion (or an un-complete → re-complete) can't double-bill.
 * Bills regardless of series status: a completed visit is real work even if
 * the series was paused/cancelled after it was scheduled.
 */
export async function billCompletedVisit(
  jobId: string,
  companyId: string
): Promise<"charged" | "billed" | "drafted" | null> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId },
    select: {
      id: true,
      invoice: { select: { id: true } },
      subscription: { include: { contact: true } },
    },
  });
  const sub = job?.subscription;
  if (!job || !sub || !sub.billPerVisit || job.invoice) return null;
  // Monthly-consolidated series don't bill on completion — the visit joins
  // the unbilled pool and runMonthlyConsolidations invoices it on the 1st.
  if (sub.consolidateMonthly) return null;

  const lineTotal = Math.round(Number(sub.unitPrice) * Number(sub.quantity) * 100) / 100;
  const send = sub.invoiceMode === "SEND";
  const now = new Date();

  const minted = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    // The unique Invoice.jobId is the real double-bill guard; re-check inside
    // the transaction so overlapping completions bail cleanly instead of
    // erroring on the constraint.
    const fresh = await tx.job.findUnique({
      where: { id: job.id },
      select: { status: true, invoice: { select: { id: true } } },
    });
    if (!fresh || fresh.invoice) return null;

    const lastInv = await tx.invoice.findFirst({
      where: { companyId },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    const money = await applyCompanyTax(tx, companyId, lineTotal);
    const invoice = await tx.invoice.create({
      data: {
        companyId,
        publicToken: randomBytes(24).toString("hex"),
        contactId: sub.contactId,
        jobId: job.id,
        subscriptionId: sub.id,
        invoiceNumber: (lastInv?.invoiceNumber ?? 0) + 1,
        subject: sub.name,
        status: send ? "AWAITING_PAYMENT" : "DRAFT",
        subtotal: lineTotal,
        taxRate: money.taxRate,
        tax: money.tax,
        total: money.total,
        issuedAt: send ? now : null,
        dueDate: send
          ? new Date(now.getTime() + sub.contact.paymentTermsDays * 86400000)
          : null,
        lineItems: {
          create: {
            name: sub.name,
            description: sub.description ?? "",
            quantity: sub.quantity,
            unitPrice: sub.unitPrice,
            total: lineTotal,
            sortOrder: 0,
          },
        },
      },
    });

    // Invoicing the completed visit resolves its "requires invoicing" state
    if (fresh.status === "REQUIRES_INVOICING") {
      await tx.job.update({
        where: { id: job.id },
        data: { status: "ARCHIVED", closedAt: now },
      });
    }
    await tx.subscription.update({
      where: { id: sub.id },
      data: { lastGeneratedAt: now },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      publicToken: invoice.publicToken,
      total: money.total,
    };
  }));

  if (!minted) return null;
  if (!send) return "drafted";

  return settleGeneratedInvoice({
    companyId,
    subscriptionId: sub.id,
    contact: sub.contact,
    serviceName: sub.name,
    invoiceId: minted.invoiceId,
    invoiceNumber: minted.invoiceNumber,
    publicToken: minted.publicToken,
    amount: minted.total,
    chargeDescription: `${sub.name} — visit`,
    paymentDetails: "Auto-charged (per-visit billing)",
  });
}

// ─── Monthly consolidation (per-visit pricing, one invoice a month) ──────────

/** Sentinel: a concurrent run claimed the whole pool while we were minting. */
const POOL_ALREADY_CLAIMED = new Error("pool-already-claimed");

/**
 * Bill a per-visit series' unbilled pool: every completed, never-invoiced
 * visit becomes a dated line on ONE invoice ("the cleaning-service invoice" —
 * April, 4 visits, $340). Shared by the monthly cron cursor, the "Bill now"
 * button, and the Ready-to-bill batch — none of them can double-bill: the
 * invoice claims its visits via Job.consolidatedInvoiceId inside the
 * transaction, so a visit only ever lands on one invoice. The charge happens
 * post-commit. "empty" = nothing completed and unbilled.
 */
async function billSeriesPool(
  sub: DueSub,
  now: Date
): Promise<"charged" | "billed" | "drafted" | "empty"> {
  if (!sub.billPerVisit) return "empty";
  const perVisit = Math.round(Number(sub.unitPrice) * Number(sub.quantity) * 100) / 100;
  const send = sub.invoiceMode === "SEND";

  let minted: {
    invoiceId: string;
    invoiceNumber: number;
    publicToken: string;
    total: number;
    visitCount: number;
  } | null = null;
  try {
    minted = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
      // The unbilled pool: completed visits with no invoice of their own and
      // no consolidated invoice yet. A visit staff invoiced manually left
      // the pool the moment its direct invoice existed.
      const visits = await tx.job.findMany({
        where: {
          subscriptionId: sub.id,
          companyId: sub.companyId,
          completedAt: { not: null, lte: now },
          invoice: { is: null },
          consolidatedInvoiceId: null,
        },
        select: { id: true },
      });
      if (visits.length === 0) return null;

      const lastInv = await tx.invoice.findFirst({
        where: { companyId: sub.companyId },
        orderBy: { invoiceNumber: "desc" },
        select: { invoiceNumber: true },
      });
      // Minted empty first: the invoice's id is the claim token for its
      // visits, and only claimed visits become lines.
      const invoice = await tx.invoice.create({
        data: {
          companyId: sub.companyId,
          publicToken: randomBytes(24).toString("hex"),
          contactId: sub.contactId,
          subscriptionId: sub.id,
          invoiceNumber: (lastInv?.invoiceNumber ?? 0) + 1,
          subject: sub.name,
          status: send ? "AWAITING_PAYMENT" : "DRAFT",
          subtotal: 0,
          total: 0,
          issuedAt: send ? now : null,
          dueDate: send
            ? new Date(now.getTime() + sub.contact.paymentTermsDays * 86400000)
            : null,
        },
      });
      await tx.job.updateMany({
        where: {
          id: { in: visits.map((v) => v.id) },
          invoice: { is: null },
          consolidatedInvoiceId: null,
        },
        data: { consolidatedInvoiceId: invoice.id },
      });
      const mine = await tx.job.findMany({
        where: { consolidatedInvoiceId: invoice.id },
        select: { id: true, status: true, scheduledAt: true, completedAt: true },
        orderBy: [{ scheduledAt: "asc" }, { completedAt: "asc" }],
      });
      if (mine.length === 0) throw POOL_ALREADY_CLAIMED; // rolls the invoice back

      const total = Math.round(perVisit * mine.length * 100) / 100;
      await tx.invoiceLineItem.createMany({
        data: mine.map((v, i) => ({
          invoiceId: invoice.id,
          name: sub.name,
          description: sub.description ?? "",
          quantity: sub.quantity,
          unitPrice: sub.unitPrice,
          total: perVisit,
          serviceDate: v.scheduledAt ?? v.completedAt,
          sortOrder: i,
        })),
      });
      const money = await applyCompanyTax(tx, sub.companyId, total);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { subtotal: total, taxRate: money.taxRate, tax: money.tax, total: money.total },
      });

      // Visits still sitting in "requires invoicing" are now invoiced —
      // close them out (the same convention as invoicing a job directly).
      const openIds = mine.filter((v) => v.status === "REQUIRES_INVOICING").map((v) => v.id);
      if (openIds.length > 0) {
        await tx.job.updateMany({
          where: { id: { in: openIds } },
          data: { status: "ARCHIVED", closedAt: now },
        });
      }
      await tx.subscription.update({
        where: { id: sub.id },
        data: { lastGeneratedAt: now },
      });

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        publicToken: invoice.publicToken,
        total: money.total,
        visitCount: mine.length,
      };
    }));
  } catch (err) {
    if (err === POOL_ALREADY_CLAIMED) return "empty";
    throw err;
  }

  if (!minted) return "empty";
  if (!send) return "drafted";

  return settleGeneratedInvoice({
    companyId: sub.companyId,
    subscriptionId: sub.id,
    contact: sub.contact,
    serviceName: sub.name,
    invoiceId: minted.invoiceId,
    invoiceNumber: minted.invoiceNumber,
    publicToken: minted.publicToken,
    amount: minted.total,
    chargeDescription: `${sub.name} — ${minted.visitCount} visit${minted.visitCount === 1 ? "" : "s"}`,
    paymentDetails: "Auto-charged (visit billing)",
  });
}

/**
 * One monthly-cursor cycle for a consolidated series: claim/advance
 * nextRunDate, then bill the pool. The cursor claim is its own atomic step —
 * if billing crashes after the claim, the pool is untouched and simply bills
 * on the next pass (or the Bill-now button). "empty" also covers a cycle
 * that came due with no completed visits: the cursor still advances and the
 * series just waits for next month.
 */
async function consolidateCycle(
  sub: DueSub,
  now: Date
): Promise<"charged" | "billed" | "drafted" | "empty"> {
  if (!sub.billPerVisit || !sub.consolidateMonthly) return "empty";
  const fresh = await prisma.subscription.findUnique({
    where: { id: sub.id },
    select: { nextRunDate: true, status: true },
  });
  if (!fresh || fresh.status !== "ACTIVE" || !fresh.nextRunDate || fresh.nextRunDate > now) {
    return "empty"; // already handled by a concurrent run
  }
  const claimed = await prisma.subscription.updateMany({
    where: { id: sub.id, status: "ACTIVE", nextRunDate: fresh.nextRunDate },
    data: { nextRunDate: firstOfNextMonth(now) },
  });
  if (claimed.count === 0) return "empty";
  return billSeriesPool(sub, now);
}

export interface ReadyWorkSummary {
  series: number;
  invoices: number;
  charged: number;
  billed: number;
  drafted: number;
  errors: number;
}

/**
 * The "Bill ready work" button: bill every ACTIVE per-visit series that has
 * completed, unbilled visits — one invoice per series, dated line per visit,
 * settled through the auto-charge path. The owner's clicking cadence IS the
 * billing cadence: daily gives per-visit billing, monthly gives the
 * consolidated invoice.
 */
export async function billAllReadyWork(
  companyId: string,
  now: Date = new Date()
): Promise<ReadyWorkSummary> {
  const subs = await prisma.subscription.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      billPerVisit: true,
      jobs: {
        some: {
          completedAt: { not: null, lte: now },
          invoice: { is: null },
          consolidatedInvoiceId: null,
        },
      },
    },
    include: { contact: true },
  });

  const summary: ReadyWorkSummary = {
    series: 0, invoices: 0, charged: 0, billed: 0, drafted: 0, errors: 0,
  };
  for (const sub of subs) {
    try {
      const outcome = await billSeriesPool(sub, now);
      summary.series++;
      if (outcome !== "empty") {
        summary.invoices++;
        summary[outcome]++;
      }
    } catch (err) {
      summary.errors++;
      console.error("[subscriptions] ready-work billing failed for", sub.id, err);
    }
  }
  return summary;
}

export interface ConsolidationRunSummary {
  processed: number;
  charged: number;
  billed: number;
  drafted: number;
  empty: number;
  errors: number;
}

/**
 * Sweep every due monthly-consolidated series and bill its completed visits.
 * Runs off the hourly cron next to runDueSubscriptions; nextRunDate (the 1st,
 * advancing monthly) is the shared cursor, claimed atomically per series.
 */
export async function runMonthlyConsolidations(
  now: Date = new Date(),
  companyId?: string
): Promise<ConsolidationRunSummary> {
  const due = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      billPerVisit: true,
      consolidateMonthly: true,
      nextRunDate: { not: null, lte: now },
      company: { is: { suspendedAt: null } },
      ...(companyId ? { companyId } : {}),
    },
    include: { contact: true },
    orderBy: { nextRunDate: "asc" },
    take: 500,
  });

  const summary: ConsolidationRunSummary = {
    processed: 0, charged: 0, billed: 0, drafted: 0, empty: 0, errors: 0,
  };
  for (const sub of due) {
    try {
      const outcome = await consolidateCycle(sub, now);
      summary.processed++;
      summary[outcome]++;
    } catch (err) {
      summary.errors++;
      console.error("[subscriptions] consolidation failed for", sub.id, err);
    }
  }
  return summary;
}

/**
 * Force one subscription to bill immediately (the "Bill now" button), ignoring
 * its schedule. Advances nextRunDate by one interval from today so the regular
 * cadence resumes. Used for manual catch-up and testing.
 */
export async function billSubscriptionNow(
  id: string,
  companyId: string
): Promise<"billed" | "drafted" | "charged" | "empty" | null> {
  const sub = await prisma.subscription.findFirst({
    where: { id, companyId, status: "ACTIVE" },
    include: { contact: true },
  });
  if (!sub) return null;
  const now = new Date();
  // Per-visit series (instant, queued, or monthly-consolidated): bill the
  // accumulated completed visits right now — the monthly cursor, if any, is
  // left alone ("empty" = nothing completed since the last invoice).
  if (sub.billPerVisit) {
    return billSeriesPool({ ...sub }, now);
  }
  // A standalone recurring-job series has no cycle to force
  if (!sub.interval) return null;
  // Make it due so the shared cycle path (with its idempotency guard) runs it
  const originalNext = sub.nextRunDate;
  if (!sub.nextRunDate || sub.nextRunDate > now) {
    await prisma.subscription.update({ where: { id }, data: { nextRunDate: now } });
    sub.nextRunDate = now;
  }
  const outcome = await generateCycle({ ...sub }, now);
  // Billing now bills the UPCOMING cycle early — it must not re-anchor every
  // future cycle to today. The cycle advanced the cursor from "now"; move it
  // to one interval past the original date instead, keeping the anchor day.
  // Guarded on the exact advanced value so a concurrent edit isn't clobbered.
  if (originalNext && originalNext > now) {
    await prisma.subscription.updateMany({
      where: { id, nextRunDate: addInterval(now, sub.interval) },
      data: { nextRunDate: addInterval(originalNext, sub.interval) },
    });
  }
  return outcome;
}

// ─── Visit series (visit cadence decoupled from billing) ─────────────────────

/** How far ahead visit jobs are materialized onto the calendar. */
const VISIT_HORIZON_DAYS = 28;
/** Safety cap per subscription per sweep (a daily WEEKLY sub needs ~5). */
const MAX_VISITS_PER_SWEEP = 30;

export interface VisitRunSummary {
  subscriptions: number;
  visitsCreated: number;
  errors: number;
}

/**
 * Materialize upcoming visits for every ACTIVE subscription with a visit
 * series. Each visit becomes an ordinary Job (subscriptionId set, default
 * assignees copied), scheduled from nextVisitDate + the series' time window,
 * so dispatchers see the next ~4 weeks on the calendar and can drag/reschedule
 * or delete individual visits without touching the series.
 *
 * Idempotent: nextVisitDate only ever moves forward inside a transaction that
 * re-reads it, and a same-day duplicate check makes overlapping runs safe.
 * Visit jobs intentionally carry NO price line items — money lives on the
 * subscription's invoices, so per-visit line items would double-count revenue.
 */
export async function generateDueVisits(
  now: Date = new Date(),
  companyId?: string
): Promise<VisitRunSummary> {
  const horizon = new Date(now.getTime() + VISIT_HORIZON_DAYS * 86400000);
  const due = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      visitFrequency: { not: null },
      nextVisitDate: { not: null, lte: horizon },
      company: { is: { suspendedAt: null } },
      ...(companyId ? { companyId } : {}),
    },
    include: { contact: true, property: true, company: { select: { timezone: true } } },
    orderBy: { nextVisitDate: "asc" },
    take: 500,
  });

  const summary: VisitRunSummary = { subscriptions: 0, visitsCreated: 0, errors: 0 };
  for (const sub of due) {
    try {
      const created = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
        // Re-read inside the transaction so overlapping sweeps can't both
        // materialize the same dates.
        const fresh = await tx.subscription.findUnique({
          where: { id: sub.id },
          select: { status: true, visitFrequency: true, nextVisitDate: true },
        });
        if (
          !fresh ||
          fresh.status !== "ACTIVE" ||
          !fresh.visitFrequency ||
          !fresh.nextVisitDate ||
          fresh.nextVisitDate > horizon
        ) {
          return 0;
        }

        // Optimistic claim keyed on the cursor we read — a concurrent sweep
        // for the same series matches zero rows and bails.
        const claimed = await tx.subscription.updateMany({
          where: { id: sub.id, nextVisitDate: fresh.nextVisitDate },
          data: { lastVisitGeneratedAt: now },
        });
        if (claimed.count === 0) return 0;

        // Default assignees, filtered to live team members
        const assigneeIds =
          sub.visitAssigneeIds.length > 0
            ? (
                await tx.user.findMany({
                  where: { id: { in: sub.visitAssigneeIds }, companyId: sub.companyId, isActive: true },
                  select: { id: true },
                })
              ).map((u) => u.id)
            : [];

        const tz = sub.company.timezone;
        let cursor = fresh.nextVisitDate;
        let count = 0;
        while (cursor <= horizon && count < MAX_VISITS_PER_SWEEP) {
          // Fast-forward cycles a long cron outage left in the past (1-day
          // grace) instead of materializing back-dated phantom visits.
          if (cursor.getTime() < now.getTime() - 86400000) {
            cursor = addVisitInterval(cursor, fresh.visitFrequency);
            continue;
          }
          // Build the visit's schedule from the date + series time window,
          // in the company's timezone (DST-safe)
          const { y, m, d } = localDayParts(tz, cursor);
          const dayStart = wallTimeToUtc(tz, y, m, d, 0);
          const anytime = sub.visitStartMinutes == null;
          const scheduledAt = wallTimeToUtc(
            tz,
            y,
            m,
            d,
            anytime ? 12 * 60 : sub.visitStartMinutes! // noon anchor = "Anytime" row
          );
          const scheduledEnd = anytime
            ? null
            : new Date(scheduledAt.getTime() + (sub.visitDurationMinutes ?? 60) * 60000);

          // Same-day duplicate guard (idempotency across overlapping runs)
          const dayEnd = wallTimeToUtc(tz, y, m, d, 24 * 60);
          const dupe = await tx.job.findFirst({
            where: { subscriptionId: sub.id, scheduledAt: { gte: dayStart, lt: dayEnd } },
            select: { id: true },
          });
          if (!dupe) {
            const lastJob = await tx.job.findFirst({
              where: { companyId: sub.companyId },
              orderBy: { jobNumber: "desc" },
              select: { jobNumber: true },
            });
            await tx.job.create({
              data: {
                companyId: sub.companyId,
                contactId: sub.contactId,
                subscriptionId: sub.id,
                jobNumber: (lastJob?.jobNumber ?? 0) + 1,
                title: sub.name,
                description: sub.description,
                leadSource: sub.contact.leadSource,
                // Series pinned to a saved service address put visits THERE
                address: sub.property
                  ? [sub.property.address, sub.property.city, sub.property.state, sub.property.zip]
                      .filter(Boolean)
                      .join(", ")
                  : sub.contact.address,
                propertyId: sub.propertyId,
                scheduledAt,
                scheduledEnd,
                scheduledAnytime: anytime,
                assignments: { create: assigneeIds.map((userId) => ({ userId })) },
              },
            });
            count++;
          }
          cursor = addVisitInterval(cursor, fresh.visitFrequency);
        }

        await tx.subscription.update({
          where: { id: sub.id },
          data: { nextVisitDate: cursor, lastVisitGeneratedAt: now },
        });
        return count;
      }));
      summary.subscriptions++;
      summary.visitsCreated += created;
    } catch (err) {
      summary.errors++;
      console.error("[subscriptions] visit generation failed for", sub.id, err);
    }
  }
  return summary;
}

/**
 * Stop a series' future visits: deletes this subscription's not-yet-worked
 * jobs from `from` onward (no time entries, notes, photos, or invoice — a job
 * someone touched is real work and stays). Used on pause/cancel and when the
 * visit schedule is removed.
 */
export async function deleteFutureVisits(
  subscriptionId: string,
  companyId: string,
  from: Date = new Date()
): Promise<number> {
  const candidates = await prisma.job.findMany({
    where: {
      subscriptionId,
      companyId,
      status: "ACTIVE",
      scheduledAt: { gte: from },
      invoice: null,
      timeEntries: { none: {} },
      notes: { none: {} },
      photos: { none: {} },
    },
    select: { id: true },
  });
  if (candidates.length === 0) return 0;
  const ids = candidates.map((j) => j.id);
  await prisma.job.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

export interface RunSummary {
  processed: number;
  charged: number;
  billed: number;
  drafted: number;
  errors: number;
}

/**
 * Sweep every company's due subscriptions and generate their next cycle.
 * Multi-tenant-safe. Called by the cron endpoint and the manual "Run now".
 * `companyId` scopes it to one tenant (used by Run now).
 */
export async function runDueSubscriptions(
  now: Date = new Date(),
  companyId?: string
): Promise<RunSummary> {
  const due = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      // Flat scheduled billing only: visits-only series have no nextRunDate,
      // and monthly-consolidated series use nextRunDate for their OWN sweep
      // (runMonthlyConsolidations) — this one must not claim their cursor.
      interval: { not: null },
      nextRunDate: { not: null, lte: now },
      company: { is: { suspendedAt: null } },
      ...(companyId ? { companyId } : {}),
    },
    include: { contact: true },
    orderBy: { nextRunDate: "asc" },
    take: 500,
  });

  const summary: RunSummary = { processed: 0, charged: 0, billed: 0, drafted: 0, errors: 0 };
  for (const sub of due) {
    try {
      const outcome = await generateCycle(sub, now);
      summary.processed++;
      summary[outcome]++;
    } catch (err) {
      summary.errors++;
      console.error("[subscriptions] cycle failed for", sub.id, err);
    }
  }
  return summary;
}
