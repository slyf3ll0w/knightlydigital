/**
 * Which sign-in methods a given visitor can use. Server-only (env reads);
 * pages hand the answer to the client forms as one `SocialSignIn` prop so
 * the buttons render on first paint with no "am I configured?" round-trip.
 *
 * Three surfaces, decided from the user agent:
 *
 *   web            Google = OAuth redirect · Apple = OAuth redirect
 *   Android shell  Google = native plugin  · Apple = nothing (Apple on
 *                  Android is a web flow through an external browser; not
 *                  worth the weight — the password form stays)
 *   iOS shell      Google = native plugin  · Apple = native plugin — and
 *                  Google only ever appears WITH Apple there (App Store
 *                  rule 4.8: a third-party login in the app requires Sign
 *                  in with Apple alongside it)
 *
 * Web OAuth never runs inside a shell: Google refuses embedded webviews
 * outright, and a hop out to the system browser would leave the session
 * cookie in the wrong browser.
 */

/** Google sign-in switches on the moment both env vars are set. */
export function isGoogleSignInConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SIGNIN_CLIENT_ID && process.env.GOOGLE_SIGNIN_CLIENT_SECRET);
}

/**
 * Sign in with Apple needs the Services ID (the web client id), the key the
 * client secret is signed with, and the team — all from the Apple developer
 * portal (docs/plans/native-release-queue.md § App Store).
 */
export function isAppleSignInConfigured(): boolean {
  return Boolean(
    process.env.APPLE_SIGNIN_SERVICES_ID &&
      process.env.APPLE_SIGNIN_KEY_ID &&
      process.env.APPLE_SIGNIN_PRIVATE_KEY &&
      process.env.APPLE_TEAM_ID
  );
}

/**
 * Where the middleware parks Apple's one-time `user` form field (the
 * person's name) while it bounces the cross-site callback POST into a GET;
 * the NextAuth route reads it on the callback leg and retires it. Lives
 * here because both the middleware (edge) and the route import it.
 */
export const APPLE_USER_COOKIE = "wb-apple-user";

/** The native app's webview — its user agent is stamped by capacitor.config.ts. */
export function isNativeShellUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && userAgent.includes("StreamflaireHubShell"));
}

/** The Android shell. Both shells carry the same UA suffix; the platform comes from the rest. */
export function isAndroidShellUserAgent(userAgent: string | null | undefined): boolean {
  return isNativeShellUserAgent(userAgent) && /Android/i.test(userAgent ?? "");
}

/** The iOS shell (iPhone or iPad). */
export function isIosShellUserAgent(userAgent: string | null | undefined): boolean {
  return isNativeShellUserAgent(userAgent) && /iPhone|iPad|iPod/i.test(userAgent ?? "");
}

/**
 * Everything a form needs to render its social buttons. Serializable — it
 * travels server → client as a prop.
 *
 * "native" means the shell's sign-in plugin (@capgo/capacitor-social-login)
 * produces an ID token in place and the page posts it; "web" means the
 * NextAuth OAuth redirect. Shells older than the build that added the
 * plugin also receive "native"; the buttons check that the plugin actually
 * exists before they render, so those users keep the password form.
 */
export type SocialSignIn = {
  google: "web" | "native" | null;
  /**
   * The WEB Google client id, sent only on the native path: both platforms'
   * plugins take it as the *server* client id and mint an ID token
   * addressed to our backend (lib/google-id-token.ts verifies that
   * audience). Not a secret — client ids are public in every OAuth flow.
   */
  googleServerClientId: string | null;
  /** iOS only: the iOS OAuth client the Google SDK itself initializes with. */
  googleIosClientId: string | null;
  apple: "web" | "native" | null;
};

export const NO_SOCIAL_SIGN_IN: SocialSignIn = {
  google: null,
  googleServerClientId: null,
  googleIosClientId: null,
  apple: null,
};

export function socialSignInFor(userAgent: string | null | undefined): SocialSignIn {
  const google = isGoogleSignInConfigured();
  const apple = isAppleSignInConfigured();
  const webClientId = process.env.GOOGLE_SIGNIN_CLIENT_ID ?? null;

  if (isIosShellUserAgent(userAgent)) {
    // Rule 4.8: no Apple, no Google. The iOS plugin also needs its own
    // client id (the SDK's URL scheme is derived from it), so without that
    // env var Google stays off in the iOS app and Apple runs alone.
    const iosClientId = process.env.GOOGLE_SIGNIN_IOS_CLIENT_ID ?? null;
    const googleNative = apple && google && Boolean(iosClientId);
    return {
      google: googleNative ? "native" : null,
      googleServerClientId: googleNative ? webClientId : null,
      googleIosClientId: googleNative ? iosClientId : null,
      apple: apple ? "native" : null,
    };
  }

  if (isAndroidShellUserAgent(userAgent)) {
    return {
      google: google ? "native" : null,
      googleServerClientId: google ? webClientId : null,
      googleIosClientId: null,
      apple: null,
    };
  }

  if (isNativeShellUserAgent(userAgent)) return NO_SOCIAL_SIGN_IN;

  return {
    google: google ? "web" : null,
    googleServerClientId: null,
    googleIosClientId: null,
    apple: apple ? "web" : null,
  };
}
