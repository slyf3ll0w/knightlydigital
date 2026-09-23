"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";
import type { SocialSignIn } from "@/lib/sign-in-options";

/**
 * Google and Apple sign-in inside the native apps.
 *
 * Google refuses OAuth in embedded webviews, and Apple's web flow would
 * leave the session in the wrong browser, so the shells sign in through
 * @capgo/capacitor-social-login: the system sheet (Credential Manager on
 * Android, the Google SDK or the Sign in with Apple sheet on iOS) returns an
 * OIDC ID token, which the page posts to the server — to the
 * "google-native" / "apple-native" provider to sign in (lib/auth-options.ts),
 * to /api/app/profile/identities to connect it to the session already open,
 * or to /api/app/auth/reauth to verify it's you.
 *
 * Nothing here imports @capacitor/*: the plugin is reached through
 * window.Capacitor.Plugins exactly like every other shell integration, so the
 * web bundle is untouched and shells built before the plugin existed simply
 * report it missing (see isNativeSignInAvailable).
 */

type SocialLoginPlugin = {
  initialize?: (options: unknown) => Promise<void>;
  login?: (options: unknown) => Promise<{
    provider?: string;
    result?: {
      idToken?: string | null;
      profile?: { givenName?: string | null; familyName?: string | null; email?: string | null };
    };
  }>;
};

function plugin(): SocialLoginPlugin | null {
  if (!nativePlatform()) return null;
  const p = getCapacitor()?.Plugins?.SocialLogin as SocialLoginPlugin | undefined;
  return typeof p?.login === "function" ? p : null;
}

/**
 * True only in a shell that actually ships the plugin. Play's versionCode 3
 * and the App Store's 1.2 are live without it, and those installs load this
 * same web code the moment it deploys — so every caller checks before
 * rendering a button, or those users would get one that can't do anything.
 */
export function isNativeSignInAvailable(): boolean {
  return plugin() !== null;
}

/** initialize() is idempotent but not free; once per configuration is enough. */
let initializedWith: string | null = null;

async function ensureInitialized(p: SocialLoginPlugin, social: SocialSignIn): Promise<void> {
  const platform = nativePlatform();
  const options: Record<string, unknown> = {};
  if (social.google === "native" && social.googleServerClientId) {
    options.google =
      platform === "ios"
        ? // The SDK needs the iOS client (its URL scheme is derived from it);
          // the server client id is what the ID token is addressed to.
          { iOSClientId: social.googleIosClientId, iOSServerClientId: social.googleServerClientId }
        : { webClientId: social.googleServerClientId };
  }
  if (social.apple === "native" && platform === "ios") {
    // The client id is not used at the OS level on iOS — the plugin only
    // needs to know Apple is on; the token comes back for the bundle id.
    options.apple = { clientId: "com.streamflaire.hub", redirectUrl: "" };
  }
  const key = JSON.stringify(options);
  if (initializedWith === key) return;
  await p.initialize?.(options);
  initializedWith = key;
}

export type NativeSignInResult =
  | { ok: true; idToken: string; name: string | null }
  | { ok: false; canceled: boolean };

/**
 * A cancel is not an error — it is the user changing their mind, and showing
 * them a red box for it would be wrong. Callers only surface !canceled.
 * (1001 is ASAuthorizationError.canceled on iOS.)
 */
function isCancel(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /cancel|canceled|cancelled|dismiss|closed|1001/i.test(m);
}

/** Run the native Google sheet and return the ID token. */
export async function nativeGoogleIdToken(social: SocialSignIn): Promise<NativeSignInResult> {
  const p = plugin();
  if (!p || social.google !== "native" || !social.googleServerClientId) return { ok: false, canceled: false };
  try {
    await ensureInitialized(p, social);
    const res = await p.login?.({
      provider: "google",
      options: {
        scopes: ["email", "profile"],
        // The full account sheet every time, matching the web flow's
        // prompt=select_account: people with a work and a personal Google
        // account must be able to pick.
        style: "standard",
        filterByAuthorizedAccounts: false,
      },
    });
    const idToken = res?.result?.idToken;
    if (typeof idToken !== "string" || !idToken) return { ok: false, canceled: false };
    return { ok: true, idToken, name: null };
  } catch (e) {
    // A failed initialize leaves nothing cached, so a retry re-runs it.
    initializedWith = null;
    return { ok: false, canceled: isCancel(e) };
  }
}

/**
 * Run the Sign in with Apple sheet and return the identity token. Apple
 * hands the person's name to the app ONLY on the first authorization (the
 * plugin caches it on-device after that), and never puts it in the token —
 * so it rides along separately for the account's display name.
 */
export async function nativeAppleIdToken(social: SocialSignIn): Promise<NativeSignInResult> {
  const p = plugin();
  if (!p || social.apple !== "native") return { ok: false, canceled: false };
  try {
    await ensureInitialized(p, social);
    const res = await p.login?.({ provider: "apple", options: { scopes: ["email", "name"] } });
    const idToken = res?.result?.idToken;
    if (typeof idToken !== "string" || !idToken) return { ok: false, canceled: false };
    const given = res?.result?.profile?.givenName ?? "";
    const family = res?.result?.profile?.familyName ?? "";
    const name = `${given} ${family}`.trim();
    return { ok: true, idToken, name: name || null };
  } catch (e) {
    initializedWith = null;
    return { ok: false, canceled: isCancel(e) };
  }
}
