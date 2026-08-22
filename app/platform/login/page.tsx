"use client";

import { useState, useEffect, useRef } from "react";
import { signOut, useSession, getCsrfToken } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import TurnstileWidget, { TurnstileHandle } from "@/components/TurnstileWidget";
import { Input } from "@/components/Input";

// Human-readable copy for the ?error= code NextAuth redirects back with.
function errorMessage(code: string): string {
  if (code === "captcha") return "Security check didn't go through — give it a moment, then try again.";
  if (code === "CredentialsSignin") return "Invalid email or password.";
  if (code === "rate-limit") return "Too many attempts — wait a few minutes, then try again.";
  return "Sign-in failed — please try again.";
}

// A failed attempt navigates back here as a fresh page load (see the form
// comment below), which empties the uncontrolled fields. The email is stashed
// across that reload so a typo'd password only costs the password.
const EMAIL_KEY = "wb-login-email";

export default function AppLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Guards the double redirect for already-signed-in visitors: the effect
  // below must never race a navigation the browser is already committed to —
  // the loser cancels the winner, which the native shell surfaces as a load
  // failure (NSURLError -999).
  const redirected = useRef(false);

  // This form is a REAL form: it POSTs to NextAuth's credentials callback and
  // the browser performs the navigation itself (302 → /app/dashboard). That
  // native submit-then-navigate is the one signal every password manager
  // (Chrome, Edge, Safari, Firefox, 1Password, …) reliably prompts on. The
  // previous XHR sign-in + Credential Management API + programmatic redirect
  // never produced a save prompt on most setups — do not regress to it.

  // Already signed in with a company — go straight to the dashboard.
  // Sessions WITHOUT a company (e.g. a deleted test company) must stay here,
  // or login → dashboard → register becomes a bounce loop and the register
  // page's "Sign in" link appears dead.
  useEffect(() => {
    if (status !== "authenticated" || redirected.current) return;
    if (session?.user?.companyId) {
      redirected.current = true;
      router.replace("/app/dashboard");
    }
  }, [status, session, router]);

  // The CSRF token NextAuth requires in the POST body, and the error code a
  // failed attempt comes back with (read once, then scrubbed from the URL so
  // a refresh doesn't resurrect a stale error).
  useEffect(() => {
    getCsrfToken().then((t) => setCsrfToken(t ?? ""));
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code) {
      setError(errorMessage(code));
      try {
        const stored = sessionStorage.getItem(EMAIL_KEY);
        sessionStorage.removeItem(EMAIL_KEY);
        if (stored && emailRef.current && !emailRef.current.value) {
          emailRef.current.value = stored;
        }
      } catch {}
      // Email survived the round-trip — put the cursor where the retry
      // actually happens.
      if (emailRef.current?.value) passwordRef.current?.focus();
      params.delete("error");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, []);

  const staleSession = status === "authenticated" && !session?.user?.companyId;

  function handleSubmit() {
    // The eye toggle may have flipped the field to type="text"; put it back
    // synchronously so the browser serializes a password field, or password
    // managers won't recognize the login. (React state updates land too late
    // for the native submission that follows this handler.)
    if (passwordRef.current) passwordRef.current.type = "password";
    try {
      sessionStorage.setItem(EMAIL_KEY, emailRef.current?.value ?? "");
    } catch {}
    setLoading(true);
    // No preventDefault: the browser submits and navigates natively.
  }

  return (
    // Clean and quiet, like the app it opens into: the app's flat light
    // ground, one white card with a hairline border, blue accents — no
    // patterns, gradients, or chrome. app-ui stays on the wrapper so the
    // form controls' green utilities keep bridging to the brand accent.
    <div className="app-ui flex min-h-screen flex-col items-center justify-center bg-[#FAFBFD] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workbench-logo.png" alt="WorkBench" className="h-8 w-auto" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div>
            <h1 className="text-center text-[22px] font-bold tracking-tight text-gray-900">
              Log in to your account
            </h1>
            <p className="mb-6 mt-1.5 text-center text-sm text-gray-500">
              Welcome back — let&apos;s get to work.
            </p>

            {staleSession && (
              <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                You&apos;re signed in as{" "}
                <span className="font-semibold">{session?.user?.email}</span>, which doesn&apos;t
                have a company workspace.{" "}
                <button
                  type="button"
                  onClick={() => signOut({ redirect: false })}
                  className="font-semibold text-amber-900 underline hover:no-underline"
                >
                  Sign out
                </button>{" "}
                or sign in below with another account.
              </div>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Password managers classify a form by its field metadata, so the
                names, ids and autocomplete tokens here are load-bearing — not
                decoration. The identifier field must be autocomplete="username"
                (NOT "email", which marks a newsletter-style address field and
                leaves the form with no account identifier to pair the password
                with), and both fields need a stable name/id or the form has no
                signature to remember. The name attributes double as NextAuth's
                credential field names — the callback reads `email`, `password`
                and `captchaToken` from the POST body. */}
            <form
              method="post"
              action="/api/auth/callback/credentials"
              onSubmit={handleSubmit}
              id="signin-form"
              className="space-y-4"
            >
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="callbackUrl" value="/app/dashboard" />
              <input type="hidden" name="captchaToken" value={captchaToken} />
              <div>
                <label
                  htmlFor="signin-email"
                  className="mb-1 block text-sm font-semibold text-gray-700"
                >
                  Email
                </label>
                <Input
                  ref={emailRef}
                  id="signin-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  className="w-full"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="signin-password"
                    className="block text-sm font-semibold text-gray-700"
                  >
                    Password
                  </label>
                  <Link
                    href="/app/forgot-password"
                    className="text-xs font-semibold text-[#0B57D8] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    id="signin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="w-full pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} action="login" />
              <button
                type="submit"
                disabled={loading || !csrfToken}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0A4CBB] active:bg-[#09429F] disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Log in
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/app/register" className="font-semibold text-[#0B57D8] hover:underline">
            Get started free
          </Link>
        </p>
      </div>
    </div>
  );
}
