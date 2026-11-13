/**
 * The business email as clients may SEE it — null when the owner turned on
 * "Keep my email off client pages" (Company.hideEmail).
 *
 * Use it wherever the address is printed: client pages, PDFs, calendar
 * invites, site data. Do NOT use it for Reply-To or the company's own
 * notifications — those keep the real `email` so replies and alerts arrive.
 *
 * `forced`: a texting registration under review needs the email on the
 * booking page (lib/business-profile.ts businessDetailsForced) — the
 * carrier's rule wins until it's approved.
 */
export function publicEmail(
  // hideEmail is REQUIRED on purpose: a select that forgot it fails tsc
  // instead of quietly printing a hidden address
  company: { email: string | null; hideEmail: boolean },
  opts: { forced?: boolean } = {}
): string | null {
  const email = company.email?.trim() || null;
  if (!email) return null;
  if (company.hideEmail && !opts.forced) return null;
  return email;
}
