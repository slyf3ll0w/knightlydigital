/**
 * Which sign-in methods a given visitor can use. Server-only (env reads);
 * pages hand the answer to the client forms as a prop so the buttons render
 * on first paint with no "am I configured?" round-trip.
 */

/** Google sign-in switches on the moment both env vars are set. */
export function isGoogleSignInConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SIGNIN_CLIENT_ID && process.env.GOOGLE_SIGNIN_CLIENT_SECRET);
}

/** The native app's webview — its user agent is stamped by capacitor.config.ts. */
export function isNativeShellUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && userAgent.includes("StreamflaireHubShell"));
}

/**
 * Web OAuth can't run inside the native shell: Google refuses embedded
 * webviews outright, and a hop out to the system browser would leave the
 * session cookie in the wrong browser. The shell gets Google sign-in through
 * a native plugin in a later store build; until then the button hides there.
 */
export function googleSignInAvailableFor(userAgent: string | null | undefined): boolean {
  return isGoogleSignInConfigured() && !isNativeShellUserAgent(userAgent);
}
