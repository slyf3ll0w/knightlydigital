"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * Google sign-in inside the Android app.
 *
 * Google refuses OAuth in embedded webviews, so the shell can't run the web
 * redirect. Instead the native Credential Manager
 * (@capgo/capacitor-social-login) shows the system account sheet and returns
 * an OIDC ID token, which the page posts to the server — either to the
 * "google-native" provider to sign in (lib/auth-options.ts) or to
 * /api/app/profile/identities to connect it to the session already open.
 *
 * Nothing here imports @capacitor/*: the plugin is reached through
 * window.Capacitor.Plugins exactly like every other shell integration, so the
 * web bundle is untouched and shells built before the plugin existed simply
 * report it missing (see isNativeGoogleAvailable).
 */

type SocialLoginPlugin = {
  initialize?: (options: unknown) => Promise<void>;
  login?: (options: unknown) => Promise<{
    provider?: string;
    result?: { idToken?: string | null };
  }>;
};

function plugin(): SocialLoginPlugin | null {
  // Android only. iOS waits for Sign in with Apple (App Store rule 4.8) and
  // its build has no plugin yet.
  if (nativePlatform() !== "android") return null;
  const p = getCapacitor()?.Plugins?.SocialLogin as SocialLoginPlugin | undefined;
  return typeof p?.login === "function" ? p : null;
}

/**
 * True only in a shell that actually ships the plugin. versionCode 3 is live
 * on Play without it, and those installs load this same web code the moment
 * it deploys — so every caller checks before rendering a Google button, or
 * those users would get a button that can't do anything.
 */
export function isNativeGoogleAvailable(): boolean {
  return plugin() !== null;
}

/** initialize() is idempotent but not free; once per client id is enough. */
let initializedFor: string | null = null;

export type NativeGoogleResult =
  | { ok: true; idToken: string }
  | { ok: false; canceled: boolean };

/**
 * A cancel is not an error — it is the user changing their mind, and showing
 * them a red box for it would be wrong. Callers only surface !canceled.
 */
function isCancel(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /cancel|canceled|cancelled|dismiss|closed/i.test(m);
}

/**
 * Run the native sheet and return the ID token. `webClientId` is the WEB
 * OAuth client — Credential Manager takes it as the server client id, so the
 * token comes back addressed to our backend (lib/google-id-token.ts).
 */
export async function nativeGoogleIdToken(webClientId: string): Promise<NativeGoogleResult> {
  const p = plugin();
  if (!p || !webClientId) return { ok: false, canceled: false };

  try {
    if (initializedFor !== webClientId) {
      await p.initialize?.({ google: { webClientId } });
      initializedFor = webClientId;
    }

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
    return { ok: true, idToken };
  } catch (e) {
    // A failed initialize leaves nothing cached, so a retry re-runs it.
    initializedFor = null;
    return { ok: false, canceled: isCancel(e) };
  }
}
