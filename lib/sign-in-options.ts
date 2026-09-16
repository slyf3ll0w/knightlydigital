/**
 * Which sign-in methods a given visitor can use. Server-only (env reads);
 * pages hand the answer to the client forms as props so the buttons render
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
 * The Android shell specifically. Both shells carry the same UA suffix, so
 * the platform comes from the rest of the string. iOS is deliberately left
 * out: App Store rule 4.8 means Google cannot appear in the iOS app until
 * Sign in with Apple does, and the iOS build has no sign-in plugin yet.
 */
export function isAndroidShellUserAgent(userAgent: string | null | undefined): boolean {
  return isNativeShellUserAgent(userAgent) && /Android/i.test(userAgent ?? "");
}

/**
 * Whether to offer Google at all. Web gets the OAuth redirect; the Android
 * shell gets the native plugin (see googleNativeClientIdFor). The iOS shell
 * gets nothing — web OAuth can't run in a webview (Google refuses embedded
 * webviews outright, and a hop out to the system browser would leave the
 * session cookie in the wrong browser).
 */
export function googleSignInAvailableFor(userAgent: string | null | undefined): boolean {
  if (!isGoogleSignInConfigured()) return false;
  if (!isNativeShellUserAgent(userAgent)) return true;
  return isAndroidShellUserAgent(userAgent);
}

/**
 * The client id the native plugin initializes with, or null when this visitor
 * is on the web redirect path. It is the WEB client id on purpose: Android's
 * Credential Manager takes it as the *server* client id and mints an ID token
 * addressed to our backend (lib/google-id-token.ts verifies that audience).
 *
 * Not a secret — client ids are public in every OAuth flow — but it is only
 * sent to the shell that needs it.
 *
 * Shells older than the build that added the plugin also receive this; the
 * button checks that the plugin actually exists before it renders, so those
 * users simply keep seeing the password form.
 */
export function googleNativeClientIdFor(userAgent: string | null | undefined): string | null {
  if (!isGoogleSignInConfigured()) return null;
  if (!isAndroidShellUserAgent(userAgent)) return null;
  return process.env.GOOGLE_SIGNIN_CLIENT_ID ?? null;
}
