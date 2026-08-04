"use client";

import { useState, useEffect, useRef } from "react";
import { signOut, useSession, getCsrfToken } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import TurnstileWidget, { TurnstileHandle } from "@/components/TurnstileWidget";

// Human-readable copy for the ?error= code NextAuth redirects back with.
function errorMessage(code: string): string {
  if (code === "captcha") return "Security check didn't go through — give it a moment, then try again.";
  if (code === "CredentialsSignin") return "Invalid email or password.";
  return "Sign-in failed — please try again.";
}

export default function AppLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
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
    setLoading(true);
    // No preventDefault: the browser submits and navigates natively.
  }

  return (
    <div className="app-ui min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workbench-logo.png" alt="WorkBench" className="h-7 w-auto" />
        </div>

        <div className="card-ledger p-8 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back to WorkBench</p>

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
              <label htmlFor="signin-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="signin-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="signin-password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <Link
                  href="/app/forgot-password"
                  className="text-xs font-medium text-green-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="signin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
            <button
              type="submit"
              disabled={loading || !csrfToken}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold text-sm rounded-[10px] btn-tool transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/app/register" className="text-green-600 hover:underline font-medium">
            Get started free
          </Link>
        </p>
      </div>
    </div>
  );
}
