/**
 * RETIRED (2026-09-01). "Preview mode" was the limited account state between
 * "we invited them in" and "Finix approved them" — record caps, no
 * email/AI/CSV/public forms. The self-serve onboarding redesign replaced it:
 * accounts open immediately and are fully usable while (a) the application
 * awaits human review (Company.accessPendingAt — rejection suspends the
 * account) and (b) Finix underwriting completes (charging is structurally
 * impossible until APPROVED, so no money can move early).
 *
 * inPreview() is hardwired false so the ~30 call sites across the API routes
 * stay compiled but never gate anything. If a cost-abuse problem shows up in
 * the review window, resurrect the checks here — every call site still runs
 * through this module.
 */

export const PREVIEW_CAP = 10;
export const PREVIEW_FORM_CAP = 1;

export const PREVIEW_APPROVAL_MSG =
  "unlocks once your account is approved — usually within a business day of finishing payment verification.";

/** Always false — preview mode is retired (see module comment). */
export async function inPreview(_companyId: string): Promise<boolean> {
  return false;
}

/** 403 body for a feature that's fully shut in preview (unused while retired). */
export function previewBlockedError(feature: string): { error: string; preview: true } {
  return { error: `${feature} ${PREVIEW_APPROVAL_MSG}`, preview: true };
}

/** 403 body for a record cap (unused while retired). */
export function previewCapError(noun: string, cap: number = PREVIEW_CAP): {
  error: string;
  preview: true;
} {
  return {
    error: `Preview accounts can add up to ${cap} ${noun} — unlimited ${noun} unlock once your account is approved.`,
    preview: true,
  };
}
