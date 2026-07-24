import { prisma } from "@/lib/db";
import { paymentsGateStatus } from "@/lib/payments-gate";

/**
 * Preview mode — the account state between "we invited them in" and "Finix
 * approved them". Companies get the run of everything that costs us nothing
 * (customization, price book, team, agreements, exploring every screen) while
 * the things that cost money or move real data stay shut:
 *
 *  - business records (clients/leads, jobs, quotes, invoices, requests,
 *    appointments) save, but capped at PREVIEW_CAP each — enough to try the
 *    workflows, not enough to onboard a whole business pre-approval
 *  - CSV import, Atlas (AI), client-facing email, and texting are blocked
 *  - web forms: one form to build, but no public link/embed and no public
 *    submissions, so nothing can arrive from the outside world
 *
 * Team invite emails and auth emails are deliberately NOT gated.
 */

export const PREVIEW_CAP = 10;
export const PREVIEW_FORM_CAP = 1;

export const PREVIEW_APPROVAL_MSG =
  "unlocks once your account is approved — usually within a business day of finishing payment verification.";

/** True while the company is pre-approval (verification not done or under review). */
export async function inPreview(companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { paymentsWaived: true, finixOnboardingState: true },
  });
  if (!company) return false;
  const gate = paymentsGateStatus(company);
  return gate === "activate" || gate === "pending";
}

/** 403 body for a feature that's fully shut in preview (Atlas, email, CSV…). */
export function previewBlockedError(feature: string): { error: string; preview: true } {
  return { error: `${feature} ${PREVIEW_APPROVAL_MSG}`, preview: true };
}

/** 403 body for a record cap ("clients", "jobs"…). */
export function previewCapError(noun: string, cap: number = PREVIEW_CAP): {
  error: string;
  preview: true;
} {
  return {
    error: `Preview accounts can add up to ${cap} ${noun} — unlimited ${noun} unlock once your account is approved.`,
    preview: true,
  };
}
