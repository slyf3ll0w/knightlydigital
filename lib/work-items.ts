/**
 * Shared validation/normalization for the recurring + agreement settings on a
 * price-book WorkItem. Used by both the create and update routes so the rules
 * (valid interval, template must belong to the company, attaching a template
 * turns on the conversion gate) live in one place.
 */

import { prisma } from "@/lib/db";
import type { RecurringInterval, RecurringInvoiceMode, AgreementTiming } from "@prisma/client";

const INTERVALS: RecurringInterval[] = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];

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
