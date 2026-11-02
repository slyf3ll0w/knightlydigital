/**
 * Where the login page may send someone after they sign in.
 *
 * The form always posted a fixed `/app/dashboard`, which is still the
 * default. The one other destination is an OAuth callback finishing a
 * Connect (Square, QuickBooks, Google Calendar): those callbacks now require
 * the signed-in session that started the flow (security audit 2026-11-01),
 * so a consent screen completed in a browser with no session — the phone
 * app hands consent to Safari / Chrome — lands on the login page with the
 * callback URL to return to, code and state intact. Nothing else is honored:
 * no scheme, no host, no protocol-relative `//`, no other path.
 *
 * Pure and client-safe (the login form runs it in the browser).
 */
export const DEFAULT_LOGIN_RETURN = "/app/dashboard";

const OAUTH_CALLBACKS = [
  "/api/app/square/callback",
  "/api/app/quickbooks/callback",
  "/api/app/integrations/google-calendar/callback",
];

export function safeLoginReturn(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return DEFAULT_LOGIN_RETURN;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\s]/.test(raw) || /[\u0000-\u001f]/.test(raw)) return DEFAULT_LOGIN_RETURN;
  const path = raw.split(/[?#]/)[0];
  if (OAUTH_CALLBACKS.includes(path)) return raw;
  return DEFAULT_LOGIN_RETURN;
}

/** The login URL that comes back to `returnTo` once signed in. */
export function loginUrlReturningTo(returnTo: string): string {
  return `/app/login?callbackUrl=${encodeURIComponent(returnTo)}`;
}
