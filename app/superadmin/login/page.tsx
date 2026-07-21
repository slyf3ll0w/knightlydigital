"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import TurnstileWidget, { TurnstileHandle } from "@/components/TurnstileWidget";

const TURNSTILE_ON = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/**
 * The console's own front door. Two steps: password check emails a 6-digit
 * code (/api/superadmin/login-code), then the code rides along on the real
 * NextAuth sign-in — authorize() refuses superadmin sessions without it.
 */
export default function SuperadminLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
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
  const redirected = useRef(false);

  // Already signed in as a superadmin — straight to the console.
  useEffect(() => {
    if (redirected.current || status !== "authenticated") return;
    if (session?.user?.role === "SUPERADMIN") {
      redirected.current = true;
      router.replace("/superadmin");
    }
  }, [status, session, router]);

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

    const res = await signIn("credentials", {
      email,
      password,
      otpCode: code,
      redirect: false,
    });

    if (res?.error) {
      setLoading(false);
      setError(
        res.error === "otp"
          ? "That code isn't right or has expired. Check the email or resend."
          : "Sign-in failed. Start over and try again."
      );
      return;
    }

    // Full page load so the console layout renders with the new session.
    redirected.current = true;
    window.location.href = "/superadmin";
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent";

  return (
    <div className="wb-site min-h-screen bg-gray-50 flex flex-col">
      {/* brand keel — same blue→orange as the console header */}
      <div
        className="h-[3px]"
        style={{ background: "linear-gradient(90deg, #0B57D8 0%, #0B57D8 55%, #F86A0A 100%)" }}
        aria-hidden
      />
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2">
            <Image
              src="/workbench-logo.png"
              alt="WorkBench"
              width={1714}
              height={285}
              priority
              className="h-7 w-auto"
            />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              Platform console
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {notice}
              </div>
            )}

            {step === "credentials" && (
              <form onSubmit={handleCredentials} className="space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Sign in</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Platform staff only. We&apos;ll email you a sign-in code.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className={inputClass}
                    placeholder="you@workbenchfsm.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className={`${inputClass} pr-10`}
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
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0B57D8] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Continue
                </button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={handleCode} className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <ShieldCheck size={18} className="text-[#0B57D8]" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">Check your email</h1>
                    <p className="mt-1 text-sm text-gray-500">
                      We sent a 6-digit code to <span className="font-medium">{email}</span>. It
                      expires in 10 minutes.
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
                  placeholder="••••••"
                />
                {/* Hidden widget keeps minting tokens for the resend button */}
                <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0B57D8] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Sign in
                </button>
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
                    className="font-medium text-[#0B57D8] hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Looking for your business account?{" "}
            <a href="/app/login" className="font-medium text-[#0B57D8] hover:underline">
              Sign in here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
