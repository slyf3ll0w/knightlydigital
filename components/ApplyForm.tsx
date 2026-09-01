"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import TurnstileWidget, { type TurnstileHandle } from "@/components/TurnstileWidget";
import { saveCredential } from "@/lib/save-credential";

const TEAM_SIZES = ["Just me", "2–5", "6–15", "16+"];
const PAYMENTS_TODAY = [
  "Card — through Square, Stripe, or similar",
  "Card — through my current software",
  "Mostly cash or check",
  "Mix of everything",
];
const MONTHLY_VOLUMES = ["Under $5k", "$5k – $20k", "$20k – $75k", "$75k+"];
const YEARS_IN_BUSINESS = ["Less than 1 year", "1–3 years", "3–10 years", "10+ years"];
const ENTITY_TYPES = [
  "LLC or corporation",
  "Sole proprietor",
  "Partnership",
  "Not registered yet",
];

/**
 * Step 1 of onboarding — the application form at /apply. One submit does
 * everything: records the application AND opens the account, then signs the
 * new owner in and sends them straight to payment verification (Finix
 * underwriting) at /app/activate. A person still reviews the application
 * afterward — the account runs in pending-approval mode until then.
 *
 * The questions are payment-intent screening: every company must pass Finix
 * underwriting, so this form's job is to predict (a) is this a real business
 * and (b) will they actually run card volume.
 *
 * The optional invite code (regular or sandbox-bypass) skips the review
 * pending state — the code is the approval.
 */
export default function ApplyForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    companyName: "",
    industry: "",
    teamSize: "",
    city: "",
    state: "",
    paymentsToday: "",
    monthlyVolume: "",
    yearsInBusiness: "",
    entityType: "",
    website: "",
    message: "",
    inviteCode: "",
  });

  // Bypass-code links arrive as /apply?code=WB-XXXX-XXXX — prefill it. Read
  // after mount (not in the initializer) so SSR and first client render match.
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
    try {
      const res = await fetch("/api/public/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        // Turnstile tokens are single-use; the failed attempt consumed this one
        captchaRef.current?.reset();
        setLoading(false);
        return;
      }

      // Account is open — sign in and continue to payment verification.
      setDone(true);
      await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      // Signup is the one moment a password manager most wants to hear from
      // us — a brand-new credential nothing else will ever offer to store.
      await saveCredential(form.email, form.password);
      window.location.href = "/app/activate";
    } catch {
      setError("Something went wrong. Please try again.");
      captchaRef.current?.reset();
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center sm:px-12">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
        </div>
        <h2 className="mx-auto mt-5 max-w-md text-2xl font-extrabold">Your account is open.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          Signing you in and taking you to payment verification…
        </p>
        <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]";
  const labelClass = "mb-1.5 block text-[13.5px] font-semibold text-gray-800";

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-10">
      <h2 className="text-2xl font-extrabold">Tell us about your business</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
        This opens your account right away — next comes a short
        payment-verification step, then you&apos;re in. A person reviews every
        application within a business day; your account stays open while
        that happens.
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Your name</label>
          <input
            type="text"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
            placeholder="Jane Smith"
          />
        </div>
        {/* autocomplete="username" (not "email") — this is the account
            identifier the new password gets stored against, and password
            managers won't offer to save a signup without one. */}
        <div>
          <label htmlFor="apply-email" className={labelClass}>Email</label>
          <input
            id="apply-email"
            name="username"
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputClass}
            placeholder="you@acmehvac.com"
          />
        </div>
        <div>
          <label htmlFor="apply-password" className={labelClass}>Choose a password</label>
          <input
            id="apply-password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            className={inputClass}
            placeholder="Min. 8 characters"
          />
        </div>
        <div>
          <label className={labelClass}>Business name</label>
          <input
            type="text"
            required
            maxLength={120}
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            className={inputClass}
            placeholder="Acme HVAC & Cooling"
          />
        </div>
        <div>
          <label className={labelClass}>
            Phone <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="tel"
            maxLength={30}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
            placeholder="(214) 555-0100"
          />
        </div>
        <div>
          <label className={labelClass}>What kind of work do you do?</label>
          <input
            type="text"
            required
            maxLength={80}
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            className={inputClass}
            placeholder="e.g. HVAC, lawn care, plumbing"
          />
        </div>
        <div>
          <label className={labelClass}>Team size</label>
          <select
            required
            value={form.teamSize}
            onChange={(e) => set("teamSize", e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>
              Select…
            </option>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input
            type="text"
            required
            maxLength={80}
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            className={inputClass}
            placeholder="Allen"
          />
        </div>
        <div>
          <label className={labelClass}>State</label>
          <input
            type="text"
            required
            maxLength={40}
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
            className={inputClass}
            placeholder="TX"
          />
        </div>
        <div>
          <label className={labelClass}>How do you take payment today?</label>
          <select
            required
            value={form.paymentsToday}
            onChange={(e) => set("paymentsToday", e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>
              Select…
            </option>
            {PAYMENTS_TODAY.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Roughly how much do you invoice per month?</label>
          <select
            required
            value={form.monthlyVolume}
            onChange={(e) => set("monthlyVolume", e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>
              Select…
            </option>
            {MONTHLY_VOLUMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>How long have you been in business?</label>
          <select
            required
            value={form.yearsInBusiness}
            onChange={(e) => set("yearsInBusiness", e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>
              Select…
            </option>
            {YEARS_IN_BUSINESS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Business structure</label>
          <select
            required
            value={form.entityType}
            onChange={(e) => set("entityType", e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>
              Select…
            </option>
            {ENTITY_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>
            Website or social page <span className="font-normal text-gray-400">(optional — the fastest way for us to verify you)</span>
          </label>
          <input
            type="text"
            maxLength={200}
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            className={inputClass}
            placeholder="acmehvac.com, Google Business, Facebook…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>
            Anything else? <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            maxLength={2000}
            rows={3}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            className={inputClass}
            placeholder="How you heard about WorkBench, what you're using today…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>
            Invite code{" "}
            <span className="font-normal text-gray-400">
              (optional — skips the review if someone gave you one)
            </span>
          </label>
          <input
            type="text"
            maxLength={40}
            value={form.inviteCode}
            onChange={(e) => set("inviteCode", e.target.value.toUpperCase())}
            className={`${inputClass} font-mono tracking-wider uppercase`}
            placeholder="WB-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="mt-6">
        <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="wb-btn-tool mt-6 inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-50"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        Create my account
      </button>
      <p className="mt-4 text-[13px] text-gray-400">
        Free forever — we make money when you get paid, not before. A person
        reads every application; until yours is approved your account is
        provisional, and it closes if we can&apos;t approve it.
      </p>
    </form>
  );
}
