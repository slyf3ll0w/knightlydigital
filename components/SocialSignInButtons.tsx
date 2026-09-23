"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { isNativeSignInAvailable, nativeAppleIdToken, nativeGoogleIdToken } from "@/lib/native-social-signin";
import { NO_SOCIAL_SIGN_IN, type SocialSignIn } from "@/lib/sign-in-options";
import { nativePlatform } from "@/components/NativeShell";

/**
 * "Continue with Google" / "Continue with Apple". Two paths behind each:
 *
 * - **Web** — the OAuth redirect (signIn("google" | "apple")).
 * - **Native app** — the system sheet; the ID token it returns goes to the
 *   "google-native" / "apple-native" provider. `social` (from
 *   lib/sign-in-options.ts, decided server-side per visitor) says which.
 *
 * Renders nothing unless the page says a provider is available, so pages
 * pass that answer in as a prop instead of every form asking the server.
 *
 * Brand rules: Google = white, thin grey border, the four-color G at the
 * left, system font. Apple = black, white logo and text (Apple's HIG allows
 * either that or white-with-outline; black reads best on these light forms).
 * In the iOS app Apple goes first, as Apple asks; elsewhere Google does.
 */

/**
 * Which buttons to render — and whether ANY renders, which is what gates
 * the "or" rule beside them (a lone rule above the password form would be
 * worse than no buttons at all).
 *
 * On the native path the answer only arrives after mount: it depends on
 * whether this particular shell build ships the sign-in plugin. Installs
 * older than that build (Play's versionCode 3, the App Store's 1.2) load
 * this same web code, and they must keep seeing the plain password form.
 */
export function useSocialSignInOffered(social: SocialSignIn = NO_SOCIAL_SIGN_IN) {
  const needsPlugin = social.google === "native" || social.apple === "native";
  const [nativeReady, setNativeReady] = useState(false);
  useEffect(() => {
    if (needsPlugin) setNativeReady(isNativeSignInAvailable());
  }, [needsPlugin]);
  const usable = (path: "web" | "native" | null) => path === "web" || (path === "native" && nativeReady);
  const google = usable(social.google);
  const apple = usable(social.apple);
  return { google, apple, any: google || apple };
}

export type SocialProviderId = "google" | "apple";

const LABEL: Record<SocialProviderId, string> = { google: "Google", apple: "Apple" };

export default function SocialSignInButtons({
  social,
  callbackUrl,
  verb = "Continue",
  className = "",
  onError,
}: {
  social: SocialSignIn;
  /** Where the round-trip — web redirect or native sheet — lands on success. */
  callbackUrl: string;
  /** "Continue" (login) or "Sign up" (the signup forms). */
  verb?: "Continue" | "Sign up";
  className?: string;
  /** Native path only: the web path navigates away to report its errors. */
  onError?: (message: string) => void;
}) {
  const offered = useSocialSignInOffered(social);
  const [busy, setBusy] = useState<SocialProviderId | null>(null);
  if (!offered.any) return null;

  async function goNative(provider: SocialProviderId) {
    setBusy(provider);
    onError?.("");
    const token = provider === "google" ? await nativeGoogleIdToken(social) : await nativeAppleIdToken(social);
    if (!token.ok) {
      setBusy(null);
      // Backing out of the sheet is not a failure to report.
      if (!token.canceled) onError?.(socialErrorMessage("", provider));
      return;
    }

    // redirect:false so a refused sign-in (the rules in lib/social-login.ts)
    // comes back as a code we can explain in place, instead of a page bounce
    // that reads as the app breaking.
    const res = await signIn(`${provider}-native`, {
      idToken: token.idToken,
      name: token.name ?? "",
      redirect: false,
    }).catch(() => null);

    if (!res || res.error) {
      setBusy(null);
      onError?.(socialErrorMessage(res?.error ?? "", provider));
      return;
    }

    // The session cookie is set now; a hard navigation is what makes every
    // server component on the way in see it.
    window.location.assign(callbackUrl);
  }

  function go(provider: SocialProviderId) {
    if (social[provider] === "native") {
      void goNative(provider);
      return;
    }
    setBusy(provider);
    // Full-page redirect to the provider; the callback mints the session and
    // lands on callbackUrl. Errors come back to /app/login?error= (lib/auth-options).
    signIn(provider, { callbackUrl }).catch(() => setBusy(null));
  }

  const order: SocialProviderId[] = nativePlatform() === "ios" ? ["apple", "google"] : ["google", "apple"];

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {order.map((provider) =>
        !offered[provider] ? null : provider === "google" ? (
          <button
            key="google"
            type="button"
            onClick={() => go("google")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-2.5 text-[15px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
          >
            {busy === "google" ? <Loader2 size={18} className="animate-spin text-gray-500" /> : <GoogleMark />}
            {verb} with Google
          </button>
        ) : (
          <button
            key="apple"
            type="button"
            onClick={() => go("apple")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-black py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-gray-900 active:bg-gray-800 disabled:opacity-60"
          >
            {busy === "apple" ? <Loader2 size={18} className="animate-spin text-gray-300" /> : <AppleMark />}
            {verb} with Apple
          </button>
        )
      )}
    </div>
  );
}

/**
 * The refusal codes lib/social-login.ts can return, in the words the person
 * needs. The web path renders these from ?error= on the login page; the
 * native path has no redirect, so the buttons show them in place.
 */
export function socialErrorMessage(code: string, provider: SocialProviderId | "" = ""): string {
  const who = provider ? LABEL[provider] : "That";
  const account = provider ? `${LABEL[provider]} account` : "account";
  if (code === "unverified-email")
    return `That ${account}'s email address isn't verified, so we can't use it to sign in. Verify it with ${who}, or log in with your password.`;
  if (code === "no-email")
    return `${who} didn't share an email address for that account. Try another account, or log in with your password.`;
  if (code === "staff-only")
    return "That sign-in isn't available for this account. Log in with your email and password instead.";
  return `${provider ? LABEL[provider] : "Social"} sign-in didn't go through — please try again.`;
}

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** The Apple logo, in the current text color. */
export function AppleMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.417 2.2-1.245 3.06-.9.97-2.03 1.53-3.13 1.44a3.1 3.1 0 0 1-.03-.42c0-1.1.47-2.24 1.29-3.08.41-.45.93-.82 1.55-1.1.63-.28 1.22-.43 1.78-.46.02.19.03.38.03.56Zm3.56 16.53c-.36.83-.79 1.6-1.29 2.3-.68.96-1.24 1.63-1.67 2-.66.6-1.37.91-2.13.93-.55 0-1.21-.16-1.98-.47-.77-.32-1.48-.47-2.13-.47-.68 0-1.41.16-2.19.47-.78.32-1.41.48-1.89.5-.73.03-1.46-.29-2.17-.96-.47-.4-1.05-1.09-1.75-2.08-.75-1.05-1.36-2.27-1.84-3.66C.62 15.05.36 13.6.36 12.2c0-1.6.35-2.98 1.04-4.14a6.1 6.1 0 0 1 2.18-2.2 5.87 5.87 0 0 1 2.95-.83c.58 0 1.34.18 2.29.53.94.35 1.55.53 1.81.53.2 0 .87-.21 2.01-.62 1.08-.38 1.99-.54 2.73-.48 2.02.16 3.53.96 4.54 2.39-1.8 1.09-2.69 2.62-2.67 4.58.02 1.53.57 2.8 1.66 3.81.49.47 1.04.83 1.65 1.09-.13.39-.27.76-.43 1.11Z"
      />
    </svg>
  );
}

/** The "or" rule between the social buttons and the password form. */
export function OrDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wide text-gray-400 ${className}`}>
      <span className="h-px flex-1 bg-gray-200" />
      or
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
