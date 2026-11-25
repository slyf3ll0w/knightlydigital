/**
 * The Playwright harness owners (e2e/env.ts) sign in as e2e-*@workbenchfsm.com.
 * Their activity is real on staging, so anything that would notify a human
 * (the feedback inbox, etc.) checks this first and stays quiet.
 */
export function isE2eHarnessEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^e2e-[^@]+@workbenchfsm\.com$/.test(email.trim().toLowerCase());
}
