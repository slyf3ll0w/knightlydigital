import { prisma } from "@/lib/db";

/**
 * Permanent company deletion — the single cascade used by both the owner-side
 * Danger Zone (/api/app/company/delete) and the superadmin console. Children
 * before parents (FK order); *LineItem / notes / photos / reminders cascade
 * from their parent deletes. CompanyUsageDaily is deliberately NOT deleted —
 * cost history has no FK and survives so platform economics stay auditable.
 */

/** The public demo/showcase company must never be deletable from any UI. */
export const PROTECTED_EMAILS = ["demo@streamflaremedia.com"];

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
      await tx.payment.deleteMany({ where });
      await tx.invoice.deleteMany({ where }); // cascades line items + reminders
      await tx.contract.deleteMany({ where });
      await tx.reviewRequest.deleteMany({ where });
      await tx.quote.deleteMany({ where }); // references jobs — before jobs
      await tx.locationPing.deleteMany({ where }); // references time entries
      await tx.timeEntry.deleteMany({ where }); // references jobs + users
      await tx.job.deleteMany({ where }); // cascades items/assignments/notes/photos
      await tx.appointment.deleteMany({ where });
      await tx.timeBlock.deleteMany({ where });
      await tx.bookingRequest.deleteMany({ where });
      await tx.request.deleteMany({ where });
      await tx.subscription.deleteMany({ where }); // references work items — before them
      await tx.contact.deleteMany({ where }); // cascades contact notes
      await tx.pipelineStage.deleteMany({ where }); // referenced by contacts — after them
      await tx.contactFieldDef.deleteMany({ where });
      await tx.workItem.deleteMany({ where }); // references contract templates — before them
      await tx.contractTemplate.deleteMany({ where });
      await tx.webForm.deleteMany({ where });
      await tx.expense.deleteMany({ where });
      await tx.user.deleteMany({ where });
      await tx.company.delete({ where: { id: companyId } });
    },
    { timeout: 60_000 }
  );
}
