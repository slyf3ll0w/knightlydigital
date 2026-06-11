"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import { DEFAULT_BOOKING_FORM, type BookingFormConfig, type CustomField } from "@/lib/booking-form";

export type FormTheme = "light" | "dark";

/**
 * Public booking form, used on /book/[slug] and inside the /embed/[slug]
 * iframe. Themeable (light/dark + transparent), brandable (accent), and
 * field-configurable per company (Settings → Booking Form) so it blends into
 * any website instead of sticking out.
 */
export default function BookingForm({
  companySlug,
  theme = "light",
  accent = "#16A34A",
  transparent = false,
  config = DEFAULT_BOOKING_FORM,
  initialService = "",
}: {
  companySlug: string;
  theme?: FormTheme;
  accent?: string;
  transparent?: boolean;
  config?: BookingFormConfig;
  initialService?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", service: initialService, preferredDate: "", message: "",
  });
  const [custom, setCustom] = useState<Record<string, string>>({});
  // Anti-spam: bots fill the off-screen "website" field and submit instantly;
  // the API silently drops submissions that trip either signal
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());

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
  const radioCard = dark
    ? "flex items-start gap-3 px-4 py-3 bg-white/5 border rounded cursor-pointer transition-colors"
    : "flex items-start gap-3 px-4 py-3 border rounded cursor-pointer transition-colors";
  const radioIdle = dark ? "border-white/15 hover:border-white/30" : "border-gray-300 hover:border-gray-400";

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
        body: JSON.stringify({
          ...form,
          custom,
          captchaToken,
          website: honeypot,
          elapsedMs: Date.now() - startedAt,
        }),
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

  /** Radio option group styled as selectable cards (label + description). */
  function RadioCards({
    name,
    options,
    value,
    required,
    onChange,
  }: {
    name: string;
    options: { label: string; description?: string }[];
    value: string;
    required: boolean;
    onChange: (v: string) => void;
  }) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((o) => {
          const selected = value === o.label;
          return (
            <label
              key={o.label}
              className={`${radioCard} ${selected ? "" : radioIdle}`}
              style={selected ? { borderColor: accent } : undefined}
            >
              <input
                type="radio"
                name={name}
                value={o.label}
                checked={selected}
                required={required}
                onChange={() => onChange(o.label)}
                className="mt-0.5 shrink-0"
                style={{ accentColor: accent }}
              />
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
                  {o.label}
                </span>
                {o.description && (
                  <span className={`block text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>
                    {o.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderCustomField(f: CustomField) {
    const value = custom[f.id] ?? "";
    const onChange = (v: string) => setCustom((c) => ({ ...c, [f.id]: v }));
    const fieldLabel = (
      <label className={label}>
        {f.label}
        {f.required ? " *" : ""}
      </label>
    );

    switch (f.type) {
      case "textarea":
        return (
          <div key={f.id}>
            {fieldLabel}
            <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
              required={f.required} placeholder={f.placeholder} maxLength={1000}
              className={`${input} resize-none`} />
          </div>
        );
      case "select":
        return (
          <div key={f.id}>
            {fieldLabel}
            <select value={value} onChange={(e) => onChange(e.target.value)} required={f.required}
              className={`${input} ${dark ? "[&>option]:text-gray-900" : ""}`}>
              <option value="">Select...</option>
              {(f.options ?? []).map((o) => (
                <option key={o.label} value={o.label}>{o.label}</option>
              ))}
            </select>
          </div>
        );
      case "radio":
        return (
          <div key={f.id}>
            {fieldLabel}
            <RadioCards
              name={`custom-${f.id}`}
              options={f.options ?? []}
              value={value}
              required={f.required}
              onChange={onChange}
            />
          </div>
        );
      default:
        return (
          <div key={f.id}>
            {fieldLabel}
            <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
              required={f.required} placeholder={f.placeholder} maxLength={500}
              className={input} />
          </div>
        );
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

  const svc = config.service;

  return (
    <form onSubmit={handleSubmit} className={`${card} space-y-4 relative`}>
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      {/* Honeypot — humans never see it, bots fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>
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
      {config.showAddress && (
        <div>
          <label className={label}>Service address</label>
          <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
            placeholder="123 Main St, Dallas, TX 75201"
            className={input} />
        </div>
      )}
      <div>
        <label className={label}>{svc.label} *</label>
        {svc.type === "radio" && svc.options.length > 0 ? (
          <RadioCards
            name="service"
            options={svc.options}
            value={form.service}
            required
            onChange={(v) => set("service", v)}
          />
        ) : svc.type === "select" && svc.options.length > 0 ? (
          <select value={form.service} onChange={(e) => set("service", e.target.value)} required
            className={`${input} ${dark ? "[&>option]:text-gray-900" : ""}`}>
            <option value="">Select...</option>
            {svc.options.map((o) => (
              <option key={o.label} value={o.label}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input type="text" value={form.service} onChange={(e) => set("service", e.target.value)} required
            placeholder={svc.placeholder}
            className={input} />
        )}
      </div>
      {config.customFields.map(renderCustomField)}
      {config.showPreferredDate && (
        <div>
          <label className={label}>Preferred date</label>
          <input type="date" value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)}
            className={input} />
        </div>
      )}
      <div>
        <label className={label}>
          {config.message.label}
          {config.message.required ? " *" : ""}
        </label>
        <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={3}
          required={config.message.required}
          placeholder={config.message.placeholder}
          className={`${input} resize-none`} />
      </div>
      <TurnstileWidget onToken={setCaptchaToken} />
      <button type="submit" disabled={loading}
        className="w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 active:opacity-80 flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ backgroundColor: accent, color: textOn(accent) }}>
        {loading && <Loader2 size={14} className="animate-spin" />}
        {config.button.label}
      </button>
    </form>
  );
}
