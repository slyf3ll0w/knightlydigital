"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";

export type FormTheme = "light" | "dark";

/**
 * Public booking form, used on /book/[slug] and inside the /embed/[slug]
 * iframe. Themeable (light/dark + transparent) and brandable (accent) so it
 * blends into any website instead of sticking out.
 */
export default function BookingForm({
  companySlug,
  theme = "light",
  accent = "#16A34A",
  transparent = false,
}: {
  companySlug: string;
  theme?: FormTheme;
  accent?: string;
  transparent?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", service: "", preferredDate: "", message: "",
  });

  const dark = theme === "dark";
  const card = transparent
    ? "bg-transparent"
    : dark
      ? "bg-[#101410] border border-white/10 rounded-lg p-6 shadow-sm"
      : "bg-white border border-gray-200 rounded-lg p-6 shadow-sm";
  const label = dark
    ? "block text-sm font-medium text-gray-300 mb-1"
    : "block text-sm font-medium text-gray-700 mb-1";
  const input = dark
    ? "w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
    : "w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/public/book/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaToken }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className={`${card} text-center py-10`}>
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: `${accent}22` }}
        >
          <CheckCircle size={28} style={{ color: accent }} />
        </div>
        <h2 className={`text-xl font-bold mb-2 ${dark ? "text-white" : "text-gray-900"}`}>
          Request received!
        </h2>
        <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
          We&apos;ll be in touch within 1 business day to confirm your appointment.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${card} space-y-4`}>
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>First name *</label>
          <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required
            className={input} />
        </div>
        <div>
          <label className={label}>Last name *</label>
          <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required
            className={input} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Email</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
            className={input} />
        </div>
        <div>
          <label className={label}>Phone *</label>
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required
            className={input} />
        </div>
      </div>
      <div>
        <label className={label}>Service address</label>
        <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
          placeholder="123 Main St, Dallas, TX 75201"
          className={input} />
      </div>
      <div>
        <label className={label}>Service needed *</label>
        <input type="text" value={form.service} onChange={(e) => set("service", e.target.value)} required
          placeholder="e.g. AC tune-up, Lawn mowing, Roof inspection"
          className={input} />
      </div>
      <div>
        <label className={label}>Preferred date</label>
        <input type="date" value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)}
          className={input} />
      </div>
      <div>
        <label className={label}>Message</label>
        <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={3}
          placeholder="Any additional details..."
          className={`${input} resize-none`} />
      </div>
      <TurnstileWidget onToken={setCaptchaToken} />
      <button type="submit" disabled={loading}
        className="w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ backgroundColor: accent, color: textOn(accent) }}>
        {loading && <Loader2 size={14} className="animate-spin" />}
        Request Appointment
      </button>
    </form>
  );
}
