"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import TurnstileWidget, { TurnstileHandle } from "@/components/TurnstileWidget";
import { Input } from "@/components/Input";
import { Button } from "@/components/ds";

const TURNSTILE_ON = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/**
 * The console's own front door, in the app's login language (app/platform/
 * login/LoginForm.tsx). Two steps: password check emails a 6-digit code
 * (/api/superadmin/login-code), then POST /api/superadmin/session verifies
 * the code and sets the console's own cookie — deliberately not a NextAuth
 * session, so a tenant login in this browser is untouched.
 * (middleware.ts bounces already-signed-in staff from here to /superadmin.)
 */
export default function SuperadminLoginPage() {
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [pendingResend, setPendingResend] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function requestCode(token: string): Promise<boolean> {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        captchaRef.current?.reset();
        return false;
      }
      return true;
    } catch {
      setError("Network error — please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    if (await requestCode(captchaToken)) {
      // That token is spent now; a fresh one backs the resend button.
      captchaRef.current?.reset();
      setStep("code");
      setCode("");
    }
  }

  // Resend needs a fresh single-use captcha token; the widget delivers one
  // asynchronously after reset, so the request waits for it here.
  useEffect(() => {
    if (!pendingResend || (TURNSTILE_ON && !captchaToken)) return;
    setPendingResend(false);
    requestCode(captchaToken).then((ok) => {
      if (ok) setNotice("A new code is on its way.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResend, captchaToken]);

  function handleResend() {
    setNotice("");
    if (TURNSTILE_ON && !captchaToken) captchaRef.current?.reset();
    setPendingResend(true);
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    let failed: string | null = "network";
    try {
      const res = await fetch("/api/superadmin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json().catch(() => ({}));
      failed = res.ok ? null : ((data.error as string) ?? "invalid");
    } catch {
      failed = "network";
    }

    if (failed) {
      setLoading(false);
      setError(
        failed === "code"
          ? "That code isn't right or has expired. Check the email or resend."
          : failed === "network"
            ? "Network error — please try again."
            : "Sign-in failed. Start over and try again."
      );
      return;
    }

    // Full page load so the console layout renders with the new session.
    window.location.href = "/superadmin";
  }

  return (
    <div className="app-ui ds flex min-h-screen flex-col items-center justify-center bg-[color:var(--ds-canvas)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Image src="/workbench-logo.png" alt="WorkBench" width={1714} height={285} priority className="h-7 w-auto" />
          <span className="ds-eyebrow ds-eyebrow-plain text-[11px] font-semibold uppercase tracking-[0.14em]">Console</span>
        </div>

        <div className="ds-card ds-card-raised p-8">
          {error && (
            <div role="alert" className="form-error mb-4">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-lg bg-[color:var(--ds-primary-soft)] px-4 py-3 text-sm text-[color:var(--ds-primary)]">
              {notice}
            </div>
          )}

          {step === "credentials" && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <h1 className="ds-h2 text-[22px]">Sign in</h1>
                <p className="ds-small mt-1">Platform staff only. We&apos;ll email you a sign-in code.</p>
              </div>
              <div>
                <label htmlFor="sa-email" className="mb-1 block text-sm font-semibold text-gray-700">
                  Email
                </label>
                <Input
                  id="sa-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full"
                  placeholder="you@workbenchfsm.com"
                />
              </div>
              <div>
                <label htmlFor="sa-password" className="mb-1 block text-sm font-semibold text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="sa-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
              <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading && <Loader2 size={15} className="animate-spin" />}
                Continue
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={handleCode} className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="ds-disc mt-0.5">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h1 className="ds-h2 text-[22px]">Check your email</h1>
                  <p className="ds-small mt-1">
                    We sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>. It expires in
                    10 minutes.
                  </p>
                </div>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                aria-label="Sign-in code"
                className="ds-num w-full text-center text-2xl tracking-[0.5em]"
                placeholder="••••••"
              />
              {/* Hidden widget keeps minting tokens for the resend button */}
              <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
              <Button type="submit" size="lg" disabled={loading || code.length !== 6} className="w-full">
                {loading && <Loader2 size={15} className="animate-spin" />}
                Sign in
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setError("");
                    setNotice("");
                    captchaRef.current?.reset();
                  }}
                  className="font-medium text-gray-500 hover:text-gray-700"
                >
                  Start over
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading || pendingResend}
                  className="ds-link disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="ds-small mt-6 text-center">
          Looking for your business account?{" "}
          <a href="/app/login" className="ds-link">
            Sign in here
          </a>
        </p>
      </div>
    </div>
  );
}
