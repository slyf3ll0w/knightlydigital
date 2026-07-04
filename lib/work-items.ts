/**
 * Shared validation/normalization for the recurring + agreement settings on a
 * price-book WorkItem. Used by both the create and update routes so the rules
 * (valid interval, template must belong to the company, attaching a template
 * turns on the conversion gate) live in one place.
 */

import { prisma } from "@/lib/db";
import type {
  RecurringInterval,
  RecurringInvoiceMode,
  AgreementTiming,
  PriceDisplay,
} from "@prisma/client";

const INTERVALS: RecurringInterval[] = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];
const PRICE_DISPLAYS: PriceDisplay[] = ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"];

/** How the price reads to homeowners; anything unrecognized falls back to a flat rate. */
export function sanitizePriceDisplay(v: unknown): PriceDisplay {
  return PRICE_DISPLAYS.includes(v as PriceDisplay) ? (v as PriceDisplay) : "FIXED";
}

/** On-site duration for online booking: 15 min – 8 h, else "not bookable" (null). */
export function sanitizeDuration(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 15 && n <= 480 ? n : null;
}

export interface RecurringAgreementData {
  recurringInterval: RecurringInterval | null;
  recurringCreatesJob: boolean;
  recurringInvoiceMode: RecurringInvoiceMode;
  agreementTemplateId: string | null;
  agreementTiming: AgreementTiming;
  requiresAgreement: boolean;
}

/**
 * Backfill unitCost on quote line items whose name exactly matches a
 * price-book item (case-insensitive). Users often type a service name instead
 * of clicking the autocomplete suggestion — without this, the line carries no
 * cost and the job's profit margin overstates. Only the cost is inherited:
 * linking workItemId (and its recurring/agreement side effects) stays an
 * explicit picker action.
 */
export async function backfillLineItemCosts<
  T extends { name?: string; workItemId?: string | null; unitCost?: number | null }
>(companyId: string, lineItems: T[]): Promise<T[]> {
  const unmatched = lineItems.filter(
    (li) => !li.workItemId && (li.unitCost === null || li.unitCost === undefined) && li.name?.trim()
  );
  if (unmatched.length === 0) return lineItems;

  const items = await prisma.workItem.findMany({
    where: { companyId, isActive: true, unitCost: { not: null } },
    select: { name: true, unitCost: true },
  });
  const costByName = new Map(items.map((i) => [i.name.trim().toLowerCase(), Number(i.unitCost)]));

  return lineItems.map((li) => {
    if (li.workItemId || li.unitCost !== null && li.unitCost !== undefined) return li;
    const cost = costByName.get(li.name?.trim().toLowerCase() ?? "");
    return cost !== undefined ? { ...li, unitCost: cost } : li;
  });
}

export async function sanitizeRecurringAndAgreement(
  body: Record<string, unknown>,
  companyId: string
): Promise<{ data: RecurringAgreementData } | { error: string }> {
  const recurringInterval =
    typeof body.recurringInterval === "string" && INTERVALS.includes(body.recurringInterval as RecurringInterval)
      ? (body.recurringInterval as RecurringInterval)
      : null;

  const recurringInvoiceMode: RecurringInvoiceMode = body.recurringInvoiceMode === "DRAFT" ? "DRAFT" : "SEND";
  const recurringCreatesJob = Boolean(body.recurringCreatesJob) && recurringInterval !== null;

  let agreementTemplateId: string | null =
    typeof body.agreementTemplateId === "string" && body.agreementTemplateId.trim()
      ? body.agreementTemplateId.trim()
      : null;

  if (agreementTemplateId) {
    const template = await prisma.contractTemplate.findFirst({
      where: { id: agreementTemplateId, companyId, isActive: true },
      select: { id: true },
    });
    if (!template) return { error: "Selected agreement template not found." };
  }

  const agreementTiming: AgreementTiming = body.agreementTiming === "WITH_QUOTE" ? "WITH_QUOTE" : "ON_APPROVAL";

  return {
    data: {
      recurringInterval,
      recurringCreatesJob,
      recurringInvoiceMode,
      agreementTemplateId,
      agreementTiming,
      // Attaching a template implies the conversion gate; an explicit
      // requiresAgreement flag still works for the template-less case.
      requiresAgreement: agreementTemplateId !== null || Boolean(body.requiresAgreement),
    },
  };
}
