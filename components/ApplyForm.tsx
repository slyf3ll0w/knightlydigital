"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import TurnstileWidget, { type TurnstileHandle } from "@/components/TurnstileWidget";

const TEAM_SIZES = ["Just me", "2–5", "6–15", "16+"];

/**
 * The /apply access application. Posts to /api/public/apply, which queues a
 * PENDING AccessApplication for superadmin review — approval emails the
 * applicant a single-use invite code for /app/register.
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
    phone: "",
    companyName: "",
    industry: "",
    teamSize: "",
    website: "",
    message: "",
  });

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
        captchaRef.current?.reset();
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
      captchaRef.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center sm:px-12">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
        </div>
        <h2 className="mx-auto mt-5 max-w-md text-2xl font-extrabold">Application received.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          A person reads every application — usually within a business day.
          When you&apos;re approved, we&apos;ll email your invite code to{" "}
          <span className="font-semibold text-gray-900">{form.email}</span>.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]";
  const labelClass = "mb-1.5 block text-[13.5px] font-semibold text-gray-800";

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-10">
      <h2 className="text-2xl font-extrabold">Apply for access</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
        Tell us about your business. If you&apos;re approved, your invite code
        arrives by email.
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
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            required
            maxLength={254}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputClass}
            placeholder="you@acmehvac.com"
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
        <div className="sm:col-span-2">
          <label className={labelClass}>
            Website or social page <span className="font-normal text-gray-400">(optional — helps us verify you faster)</span>
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
        Submit application
      </button>
      <p className="mt-4 text-[13px] text-gray-400">
        A person reads every application — no bots, no auto-approvals.
      </p>
    </form>
  );
}
