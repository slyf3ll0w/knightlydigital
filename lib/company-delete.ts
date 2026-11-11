import { prisma } from "@/lib/db";

/**
 * Permanent company deletion — the single cascade used by both the owner-side
 * Danger Zone (/api/app/company/delete) and the superadmin console. Children
 * before parents (FK order); *LineItem / notes / photos / reminders cascade
 * from their parent deletes. CompanyUsageDaily, ActivityLog, ConsoleAudit,
 * PresenceSample, AssistantTurn and SmsSend are deliberately NOT deleted —
 * they have no FK to the company and survive so platform economics and the
 * audit trail stay readable.
 *
 * Readiness review 2026-11-02 (S1): 34 of the company relations carry no
 * onDelete rule (Prisma = Restrict), so a company with a booking type, an
 * automation, an estimator or a client message used to fail its own delete
 * with a foreign-key error — the transaction rolled back and the customer
 * got a 500. Every company-owned model is now either on Prisma's own
 * cascade or in COMPANY_DELETE_ORDER below; scripts/test-company-delete.ts
 * reads the schema and fails the build when a new model is neither.
 */

/** The public demo/showcase company must never be deletable from any UI. */
export const PROTECTED_EMAILS = ["demo@streamflaremedia.com"];

/** Prisma delegate names, children before parents. */
export const COMPANY_DELETE_ORDER = [
  "task", // references contacts/jobs/quotes/invoices/calls/users/places
  "stickyNote", // cascades placements
  "feedbackTicket",
  "giftCardSale",
  "refund", // references payments
  "payment",
  "invoice", // cascades line items + reminders
  "contract", // references quotes + templates
  "reviewRequest",
  "quote", // references jobs + requests + estimators
  "locationPing", // references time entries
  "timeEntry", // references jobs + users
  "jobPhoto",
  "job", // cascades items/assignments/notes/photos; references requests + subscriptions
  "appointment", // references requests
  "timeBlock",
  "timeBlockSeries",
  "bookingRequest",
  "request", // references booking types + estimators
  "clientMessage", // references contacts + users
  "portalMessage",
  "call",
  "subscription", // references work items + cards — before them
  "savedCard",
  "contact", // cascades contact notes; references pipeline stages
  "pipelineStage",
  "contactFieldDef",
  "workItem", // references contract templates — before them
  "contractTemplate",
  "webForm",
  "expense",
  "recurringExpense",
  "automationJob",
  "automationRun",
  "automationNotice",
  "automation",
  "estimatorListingLike",
  "estimatorListing",
  "estimator", // cascades builds/images/versions
  "bookingType",
  "place",
  "website", // cascades photos
  "chatChannel", // cascades team messages
  "messagingRegistration",
  "quickBooksConnection", // cascades sync records
  "squareConnection",
  "googleCalendarConnection",
  "user",
] as const;

/** Models with a companyId that are kept on purpose (no FK to Company), or that cascade from their parent row's delete. */
export const COMPANY_DELETE_KEEPS = [
  "CompanyUsageDaily",
  "ActivityLog",
  "ConsoleAudit",
  "PresenceSample",
  "AssistantTurn",
  "SmsSend",
  "AccessApplication", // SetNull
  "CompanyRequest", // SetNull — the request stays as the record of who asked
  // cascade from their parent (message / estimator / connection)
  "PortalMessageMedia",
  "EstimatorBuild",
  "EstimatorImage",
  "EstimatorVersion",
  "QuickBooksSyncRecord",
] as const;

export async function companyHasProtectedUser(companyId: string): Promise<boolean> {
  const hit = await prisma.user.findFirst({
    where: { companyId, email: { in: PROTECTED_EMAILS, mode: "insensitive" } },
    select: { id: true },
  });
  return Boolean(hit);
}

export async function deleteCompanyCascade(companyId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const where = { companyId };
      // Another company may bill through a contact of this one (WorkBench's
      // own plans): the relation is SetNull, so nothing to do. A contact of
      // THIS company used as someone's billing contact is detached first.
      await tx.company.updateMany({ where: { billingContact: { companyId } }, data: { billingContactId: null } });
      for (const model of COMPANY_DELETE_ORDER) {
        await (tx as unknown as Record<string, { deleteMany: (args: { where: { companyId: string } }) => Promise<unknown> }>)[model].deleteMany({ where });
      }
      await tx.company.delete({ where: { id: companyId } });
    },
    { timeout: 120_000 }
  );
}
