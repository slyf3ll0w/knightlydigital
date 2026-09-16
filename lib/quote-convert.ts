import type { Prisma } from "@prisma/client";
import { ensureSubscriptionsForContact } from "@/lib/subscriptions";
import { recordLeadWin } from "@/lib/pipeline";
import { resolveCrew } from "@/lib/job-crew";

/**
 * Quote → Job, the one conversion path (Jobber's "Convert to Job"). Used by
 * the staff convert route and by online service bookings, which mint an
 * approved quote and convert it in the same transaction. Copies line items
 * (skipping client-removed optional items), carries the request link
 * forward, marks the quote Converted, starts subscriptions for recurring
 * lines, and closes the lead.
 */
export type ConvertibleQuote = {
  id: string;
  companyId: string;
  contactId: string;
  requestId: string | null;
  title: string | null;
  propertyId: string | null;
  contact: { id: string; firstName: string; lastName: string; leadSource: string | null; address: string | null; status: string; pipelineStageId: string | null };
  property: { address: string; city: string | null; state: string | null; zip: string | null } | null;
  lineItems: {
    name: string;
    description: string | null;
    quantity: Prisma.Decimal | number;
    unitCost: Prisma.Decimal | number | null;
    unitPrice: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    workItemId: string | null;
    recurringInterval: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null;
    isOptional?: boolean;
    optedOut?: boolean;
  }[];
};

export type ConvertOptions = {
  /** Schedule the job on creation (online bookings land scheduled + assigned). */
  scheduledAt?: Date | null;
  scheduledEnd?: Date | null;
  assigneeIds?: string[];
  arrivalWindowMinutes?: number | null;
  address?: string | null;
  requestId?: string | null;
  bookingTypeId?: string | null;
  bookedOnlineAt?: Date | null;
  /**
   * Skip the lead-win side effect. Online bookings that still have to charge
   * a card call recordLeadWin themselves once the charge succeeds — a
   * declined card must not leave the lead marked Won.
   */
  deferLeadWin?: boolean;
};

export type ConvertResult = {
  job: Prisma.JobGetPayload<Record<string, never>>;
  /** Subscriptions this conversion started (so a caller that unwinds can remove them). */
  subscriptionIds: string[];
};

/** Thrown (inside the transaction, so nothing is written) when the quote was
 *  already converted by a racing request. */
export class QuoteAlreadyConvertedError extends Error {
  constructor() {
    super("Quote was already converted.");
    this.name = "QuoteAlreadyConvertedError";
  }
}

export async function convertQuoteToJob(tx: Prisma.TransactionClient, quote: ConvertibleQuote, opts: ConvertOptions = {}): Promise<ConvertResult> {
  const companyId = quote.companyId;
  // Claim the conversion FIRST. The route checks `jobId` on a quote it loaded
  // before the transaction, so a double-tap on a phone (or two staff) both
  // passed that check and each minted a Job # — one orphaned on the schedule.
  // The claim only lands while the quote is unconverted; everything below
  // rides the same transaction, so a lost claim writes nothing.
  const claim = await tx.quote.updateMany({
    where: { id: quote.id, jobId: null, status: { not: "CONVERTED" } },
    data: { status: "CONVERTED" },
  });
  if (claim.count === 0) throw new QuoteAlreadyConvertedError();
  // A one-person company's jobs land on that person (calendar sync, tech
  // visibility); bigger teams assign from the job page after conversion
  const crew = await resolveCrew(tx, companyId, opts.assigneeIds ?? []);
  const last = await tx.job.findFirst({ where: { companyId }, orderBy: { jobNumber: "desc" }, select: { jobNumber: true } });
  const active = quote.lineItems.filter((li) => !(li.isOptional && li.optedOut));

  const created = await tx.job.create({
    data: {
      companyId,
      contactId: quote.contactId,
      requestId: opts.requestId ?? quote.requestId,
      jobNumber: (last?.jobNumber ?? 0) + 1,
      title: quote.title || `Job for ${quote.contact.firstName} ${quote.contact.lastName}`,
      leadSource: quote.contact.leadSource,
      // Quotes for a saved service address land the job AT that property —
      // before this, every converted job fell back to the primary address
      address:
        opts.address ??
        (quote.property
          ? [quote.property.address, quote.property.city, quote.property.state, quote.property.zip].filter(Boolean).join(", ")
          : quote.contact.address),
      propertyId: quote.propertyId,
      scheduledAt: opts.scheduledAt ?? null,
      scheduledEnd: opts.scheduledEnd ?? null,
      arrivalWindowMinutes: opts.arrivalWindowMinutes ?? null,
      bookingTypeId: opts.bookingTypeId ?? null,
      bookedOnlineAt: opts.bookedOnlineAt ?? null,
      ...(crew.length ? { assignments: { create: crew.map((userId) => ({ userId })) } } : {}),
      lineItems: {
        create: active.map((li, i) => ({
          name: li.name,
          description: li.description || null,
          quantity: li.quantity,
          unitCost: li.unitCost,
          unitPrice: li.unitPrice,
          total: li.total,
          // Price-book link + recurring snapshot survive conversion, so the
          // job (and its eventual invoice) stay traceable to the service sold
          workItemId: li.workItemId,
          recurringInterval: li.recurringInterval,
          sortOrder: i,
        })),
      },
    },
  });

  await tx.quote.update({ where: { id: quote.id }, data: { jobId: created.id, status: "CONVERTED" } });

  // Recurring services on the quote become live subscriptions on the client.
  const subscriptionIds = await ensureSubscriptionsForContact(
    tx,
    companyId,
    quote.contactId,
    active.filter((li) => li.recurringInterval != null).map((li) => ({ workItemId: li.workItemId, quantity: Number(li.quantity) }))
  );

  // First real work closes the lead: active client, off the pipeline board
  if (!opts.deferLeadWin) await recordLeadWin(tx, companyId, quote.contact);

  return { job: created, subscriptionIds };
}
