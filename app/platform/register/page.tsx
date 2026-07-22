"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import TurnstileWidget, { TurnstileHandle } from "@/components/TurnstileWidget";
import { INDUSTRIES } from "@/lib/pricebooks";

/**
 * Single-page signup: just the account essentials plus industry, which seeds
 * the starter price book. Everything else (hours, service area, branding,
 * booking form) lives in Settings — signup shouldn't ask for what the app
 * can't use on day one.
 */

const STOCK_IMAGE =
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80";

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [otherIndustry, setOtherIndustry] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  const [form, setForm] = useState({
    inviteCode: "",
    yourName: "",
    companyName: "",
    email: "",
    password: "",
    industry: "",
  });

  // Approval emails link here as /app/register?code=WB-XXXX-XXXX — prefill it.
  // Read after mount (not in the initializer) so SSR and first client render match.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setForm((f) => ({ ...f, inviteCode: code.toUpperCase() }));
  }, []);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const industry =
      form.industry === "Other" && otherIndustry.trim()
        ? `Other: ${otherIndustry.trim().slice(0, 70)}`
        : form.industry;

    const res = await fetch("/api/app/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, industry, captchaToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      // Turnstile tokens are single-use; the failed attempt consumed this one
      captchaRef.current?.reset();
      setLoading(false);
      return;
    }

    // Auto sign in after registration, then do a full page load so the app
    // layout re-renders with the new session (sidebar included).
    await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    window.location.href = "/app/dashboard";
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="app-ui min-h-screen bg-white flex">
      {/* Form panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto px-6 lg:px-12 py-8">
          <div className="w-full max-w-lg mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/workbench-logo.png" alt="WorkBench" className="h-6 w-auto mb-8" />

            <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">
              Create your account
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Free forever — we make money when you get paid, not before.
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>Invite code</label>
                <input
                  type="text"
                  value={form.inviteCode}
                  onChange={(e) => set("inviteCode", e.target.value.toUpperCase())}
                  required
                  className={`${inputClass} font-mono tracking-wider uppercase`}
                  placeholder="WB-XXXX-XXXX"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  WorkBench is invite-only. Don&apos;t have a code?{" "}
                  <Link href="/apply" className="text-green-600 hover:underline font-medium">
                    Apply for access
                  </Link>
                </p>
              </div>
              <div>
                <label className={labelClass}>Your name</label>
                <input
                  type="text"
                  value={form.yourName}
                  onChange={(e) => set("yourName", e.target.value)}
                  required
                  className={inputClass}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className={labelClass}>Business name</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                  required
                  className={inputClass}
                  placeholder="Acme HVAC & Cooling"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                  placeholder="you@acmehvac.com"
                />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label className={labelClass}>What kind of work do you do?</label>
                <select
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  required
                  className={`${inputClass} bg-white`}
                >
                  <option value="" disabled>
                    Choose your industry…
                  </option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">
                  We&apos;ll pre-load your price book with services for your industry — you can
                  edit everything later.
                </p>
              </div>
              {form.industry === "Other" && (
                <div>
                  <label className={labelClass}>
                    What&apos;s your industry?{" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={otherIndustry}
                    onChange={(e) => setOtherIndustry(e.target.value)}
                    maxLength={70}
                    className={inputClass}
                    placeholder="e.g. Mobile detailing"
                  />
                </div>
              )}

              <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold text-sm rounded-[10px] btn-tool transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Create my free account
              </button>
            </form>

            <p className="text-sm text-gray-500 text-center mt-4">
              Have an account?{" "}
              <Link href="/app/login" className="text-green-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
            <p className="text-xs text-gray-400 text-center mt-2">
              No credit card required. Free forever.
            </p>
          </div>
        </div>
      </div>

      {/* Stock image panel */}
      <div className="hidden lg:block w-[42%] xl:w-[45%] relative shrink-0">
        <img
          src={STOCK_IMAGE}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>
    </div>
  );
}
