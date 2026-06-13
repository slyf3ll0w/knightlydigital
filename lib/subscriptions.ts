/**
 * Recurring services engine.
 *
 * A recurring price-book service (WorkItem.recurringInterval set) spawns a
 * Subscription the first time it's sold — through the quote→job pipeline, a
 * direct invoice, or a web-form service request. `runDueSubscriptions` then
 * sweeps ACTIVE subscriptions whose nextRunDate is due and generates the next
 * invoice (and optionally a job) for each cycle.
 *
 * Billing is built against the lib/payments.ts PaymentProcessor seam: when a
 * processor is live AND the client has a card on file (Contact.processorCustomerRef),
 * the engine auto-charges via chargeStored() and records the payment. Until then
 * it falls back to emailing a pay-by-link. No call site changes when payments
 * go live — only a new processor implementation.
 */

import type { Prisma, PrismaClient, RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getProcessor, recordPayment } from "@/lib/payments";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Add one billing interval to a date. SEMIANNUAL = +6 months ("biannually"). */
export function addInterval(date: Date, interval: RecurringInterval): Date {
  const d = new Date(date);
  switch (interval) {
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1);
      break;
    case "QUARTERLY":
      d.setMonth(d.getMonth() + 3);
      break;
    case "SEMIANNUAL":
      d.setMonth(d.getMonth() + 6);
      break;
    case "ANNUAL":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
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

/** noon-anchored "today + interval" so dates never drift across timezones. */
function firstRunDate(interval: RecurringInterval): Date {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  return addInterval(base, interval);
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
 * Generate one cycle for a single subscription: optional job, an invoice, and
 * either an auto-charge or a pay-link email. Advances nextRunDate. Runs in its
 * own transaction; the `lastGeneratedAt` guard makes a re-run within the same
 * cycle a no-op, so overlapping cron fires can't double-bill.
 */
async function generateCycle(sub: DueSub, now: Date): Promise<"billed" | "drafted" | "charged"> {
  const lineTotal = Number(sub.unitPrice) * Number(sub.quantity);

  return prisma.$transaction(async (tx) => {
    // Idempotency: bail if another run already advanced this subscription past
    // the due date we picked it up for.
    const fresh = await tx.subscription.findUnique({
      where: { id: sub.id },
      select: { nextRunDate: true, status: true },
    });
    if (!fresh || fresh.status !== "ACTIVE" || fresh.nextRunDate > now) {
      return "drafted"; // already handled by a concurrent run
    }

    // Optional job for visit-based recurring work
    if (sub.createsJob) {
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
    const dueDate = new Date(now.getTime() + sub.contact.paymentTermsDays * 86400000);
    const invoice = await tx.invoice.create({
      data: {
        companyId: sub.companyId,
        contactId: sub.contactId,
        subscriptionId: sub.id,
        invoiceNumber: (lastInv?.invoiceNumber ?? 0) + 1,
        subject: sub.name,
        status: send ? "AWAITING_PAYMENT" : "DRAFT",
        subtotal: lineTotal,
        total: lineTotal,
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

    // Advance the schedule and stamp the run (idempotency anchor)
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        nextRunDate: addInterval(fresh.nextRunDate, sub.interval),
        lastGeneratedAt: now,
      },
    });

    // Billing branch — the auto-charge seam
    const processor = getProcessor();
    if (send && processor.live && sub.contact.processorCustomerRef) {
      const result = await processor.chargeStored({
        customerRef: sub.contact.processorCustomerRef,
        amount: lineTotal,
        description: `${sub.name} — subscription`,
        metadata: { invoiceId: invoice.id, subscriptionId: sub.id },
      });
      if (result.success) {
        // recordPayment opens its own transaction; safe to defer to after-commit
        // by returning a marker. We record outside this tx below.
        return "charged";
      }
    }
    return send ? "billed" : "drafted";
  }).then(async (outcome) => {
    // Post-commit side effects (payment recording + email) — kept out of the
    // invoice-creating transaction so a slow processor/email can't hold a db tx.
    if (outcome === "charged") {
      const inv = await prisma.invoice.findFirst({
        where: { subscriptionId: sub.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (inv) {
        await recordPayment({
          companyId: sub.companyId,
          invoiceId: inv.id,
          amount: lineTotal,
          method: "CARD",
          details: "Auto-charged (recurring subscription)",
        });
      }
      return "charged";
    }
    if (outcome === "billed" && sub.contact.email) {
      const inv = await prisma.invoice.findFirst({
        where: { subscriptionId: sub.id },
        orderBy: { createdAt: "desc" },
        select: { invoiceNumber: true, publicToken: true },
      });
      const company = await prisma.company.findUnique({
        where: { id: sub.companyId },
        select: { name: true, email: true },
      });
      if (inv && company) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
        const { subject, html } = invoiceLinkEmail({
          companyName: company.name,
          invoiceNumber: inv.invoiceNumber,
          total: lineTotal,
          payUrl: `${baseUrl}/pay/${inv.publicToken}`,
          serviceNames: [sub.name],
        });
        await sendEmail({ to: sub.contact.email, subject, html, replyTo: company.email || undefined });
      }
    }
    return outcome;
  });
}

/**
 * Force one subscription to bill immediately (the "Bill now" button), ignoring
 * its schedule. Advances nextRunDate by one interval from today so the regular
 * cadence resumes. Used for manual catch-up and testing.
 */
export async function billSubscriptionNow(
  id: string,
  companyId: string
): Promise<"billed" | "drafted" | "charged" | null> {
  const sub = await prisma.subscription.findFirst({
    where: { id, companyId, status: "ACTIVE" },
    include: { contact: true },
  });
  if (!sub) return null;
  const now = new Date();
  // Make it due so the shared cycle path (with its idempotency guard) runs it
  if (sub.nextRunDate > now) {
    await prisma.subscription.update({ where: { id }, data: { nextRunDate: now } });
    sub.nextRunDate = now;
  }
  return generateCycle({ ...sub }, now);
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
      nextRunDate: { lte: now },
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
