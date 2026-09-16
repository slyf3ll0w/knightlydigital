"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { isNativeGoogleAvailable, nativeGoogleIdToken } from "@/lib/native-google-signin";

/**
 * "Continue with Google". Two paths behind one button:
 *
 * - **Web** — the OAuth redirect (signIn("google")).
 * - **Android app** — the native account sheet; the ID token it returns goes
 *   to the "google-native" provider. A non-null `nativeClientId` is what
 *   selects this path (lib/sign-in-options.ts decides who gets it).
 *
 * Renders nothing unless the page says Google is available (env configured,
 * and not a surface where it can't run), so pages pass that answer in as a
 * prop instead of every form asking the server.
 *
 * Google's brand rules for the button: white, thin grey border, the
 * four-color G at the left, "Continue with Google" in a system font.
 */

/**
 * Whether to render the Google block at all — the button AND the "or" rule
 * beside it, which is why this is a hook the parent calls rather than
 * something the button decides on its own.
 *
 * On the native path the answer only arrives after mount: it depends on
 * whether this particular shell build ships the sign-in plugin. Installs
 * older than that build (versionCode 3 is live on Play without it) load this
 * same web code, and they must keep seeing the plain password form.
 */
export function useGoogleSignInOffered(enabled: boolean, nativeClientId?: string | null): boolean {
  const [nativeReady, setNativeReady] = useState(false);
  useEffect(() => {
    if (enabled && nativeClientId) setNativeReady(isNativeGoogleAvailable());
  }, [enabled, nativeClientId]);
  if (!enabled) return false;
  return nativeClientId ? nativeReady : true;
}
export default function GoogleSignInButton({
  enabled,
  callbackUrl,
  nativeClientId = null,
  label = "Continue with Google",
  className = "",
  onError,
}: {
  enabled: boolean;
  /** Where the round-trip — web redirect or native sheet — lands on success. */
  callbackUrl: string;
  /** Set only in the Android shell; switches this button to the plugin. */
  nativeClientId?: string | null;
  label?: string;
  className?: string;
  /** Native path only: the web path navigates away to report its errors. */
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const offered = useGoogleSignInOffered(enabled, nativeClientId);
  if (!offered) return null;

  async function goNative(clientId: string) {
    setBusy(true);
    onError?.("");
    const token = await nativeGoogleIdToken(clientId);
    if (!token.ok) {
      setBusy(false);
      // Backing out of the account sheet is not a failure to report.
      if (!token.canceled) onError?.(googleErrorMessage(""));
      return;
    }

    // redirect:false so a refused sign-in (the rules in lib/social-login.ts)
    // comes back as a code we can explain in place, instead of a page bounce
    // that reads as the app breaking.
    const res = await signIn("google-native", {
      idToken: token.idToken,
      redirect: false,
    }).catch(() => null);

    if (!res || res.error) {
      setBusy(false);
      onError?.(googleErrorMessage(res?.error ?? ""));
      return;
    }

    // The session cookie is set now; a hard navigation is what makes every
    // server component on the way in see it.
    window.location.assign(callbackUrl);
  }

  function go() {
    if (nativeClientId) {
      void goNative(nativeClientId);
      return;
    }
    setBusy(true);
    // Full-page redirect to Google; the callback mints the session and lands
    // on callbackUrl. Errors come back to /app/login?error= (lib/auth-options).
    signIn("google", { callbackUrl }).catch(() => setBusy(false));
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className={`flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-2.5 text-[15px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60 ${className}`}
    >
      {busy ? (
        <Loader2 size={18} className="animate-spin text-gray-500" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      )}
      {label}
    </button>
  );
}

/**
 * The refusal codes lib/social-login.ts can return, in the words the person
 * needs. The web path renders these from ?error= on the login page; the
 * native path has no redirect, so the button shows them in place.
 */
export function googleErrorMessage(code: string): string {
  if (code === "unverified-email")
    return "That Google account's email address isn't verified, so we can't use it to sign in. Verify it with Google, or log in with your password.";
  if (code === "no-email")
    return "Google didn't share an email address for that account. Try another Google account, or log in with your password.";
  if (code === "staff-only")
    return "That sign-in isn't available for this account. Log in with your email and password instead.";
  return "Google sign-in didn't go through — please try again.";
}

/** The "or" rule between the Google button and the password form. */
export function OrDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wide text-gray-400 ${className}`}>
      <span className="h-px flex-1 bg-gray-200" />
      or
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
