"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import type { PublicBookingType } from "@/lib/booking-runtime";
import type { CustomField } from "@/lib/booking-intake";
import type { ScheduleAppearance } from "./schedule/shell";

/**
 * The one-step public form for "we'll follow up" items: a message form, an
 * estimate request with a preferred date, or a quote request with services
 * from the price book. Same themed recipe as the stepper, so an item reads
 * the same whichever mode it's in. Used hosted (/book/[slug]/[item]) and
 * inside the /embed iframe.
 */
export default function RequestForm({
  companySlug,
  item,
  appearance,
  showHeader = false,
  initialService = "",
  preview = false,
}: {
  companySlug: string;
  item: PublicBookingType;
  appearance: ScheduleAppearance;
  /** Embeds have no page frame — render the heading inside the card */
  showHeader?: boolean;
  /** ?service= on an embed pre-fills the service question */
  initialService?: string;
  /** Owner preview from the editor — nothing submits */
  preview?: boolean;
}) {
  const { dark, accent, transparent } = appearance;
  const intake = item.intake;
  const f = intake.fields;
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    service: initialService,
    preferredDate: "",
    message: "",
  });
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [selectedServices, setSelectedServices] = useState<string[]>(item.services.length === 1 ? [item.services[0].id] : []);
  // Anti-spam: bots fill the off-screen "website" field and submit instantly;
  // the API silently drops submissions that trip either signal
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());

  const card = transparent ? "bg-transparent" : dark ? "bg-[#101410] border border-white/10 rounded-lg p-6 shadow-sm" : "card-ledger p-6 shadow-sm";
  const ink = dark ? "text-white" : "text-gray-900";
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const label = dark ? "block text-sm font-medium text-gray-300 mb-1" : "block text-sm font-medium text-gray-700 mb-1";
  const input = dark
    ? "w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
    : "w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
  const choice = dark
    ? "flex items-start gap-3 px-4 py-3 bg-white/5 border rounded cursor-pointer transition-colors"
    : "flex items-start gap-3 px-4 py-3 border rounded cursor-pointer transition-colors";
  const choiceIdle = dark ? "border-white/15 hover:border-white/30" : "border-gray-300 hover:border-gray-400";

  const set = (field: string, value: string) => setForm((s) => ({ ...s, [field]: value }));

  function toggleService(id: string) {
    if (intake.allowMultiple) setSelectedServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setSelectedServices([id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    setError("");
    if (item.kind === "SERVICE" && selectedServices.length === 0) {
      setError("Pick a service.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/public/book/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: item.slug,
          ...form,
          custom,
          selectedServices,
          captchaToken,
          website: honeypot,
          elapsedMs: Date.now() - startedAt,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
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

  function Choices({ name, options, value, required, onChange }: { name: string; options: { label: string; description?: string }[]; value: string; required: boolean; onChange: (v: string) => void }) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const selected = value === o.label;
          return (
            <label key={o.label} className={`${choice} ${selected ? "" : choiceIdle}`} style={selected ? { borderColor: accent } : undefined}>
              <input type="radio" name={name} value={o.label} checked={selected} required={required} onChange={() => onChange(o.label)} className="mt-0.5 shrink-0" style={{ accentColor: accent }} />
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${ink}`}>{o.label}</span>
                {o.description && <span className={`mt-0.5 block text-xs ${muted}`}>{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderCustomField(c: CustomField) {
    const value = custom[c.id] ?? "";
    const onChange = (v: string) => setCustom((m) => ({ ...m, [c.id]: v }));
    const head = (
      <label className={label}>
        {c.label}
        {c.required ? " *" : ""}
      </label>
    );
    switch (c.type) {
      case "textarea":
        return (
          <div key={c.id}>
            {head}
            <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} required={c.required} placeholder={c.placeholder} maxLength={1000} className={`${input} resize-none`} />
          </div>
        );
      case "select":
        return (
          <div key={c.id}>
            {head}
            <select value={value} onChange={(e) => onChange(e.target.value)} required={c.required} className={`${input} ${dark ? "[&>option]:text-gray-900" : ""}`}>
              <option value="">Select...</option>
              {(c.options ?? []).map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        );
      case "radio":
        return (
          <div key={c.id}>
            {head}
            <Choices name={`custom-${c.id}`} options={c.options ?? []} value={value} required={c.required} onChange={onChange} />
          </div>
        );
      default:
        return (
          <div key={c.id}>
            {head}
            <input type="text" value={value} onChange={(e) => onChange(e.target.value)} required={c.required} placeholder={c.placeholder} maxLength={500} className={input} />
          </div>
        );
    }
  }

  if (done) {
    const title = item.kind === "MESSAGE" ? "Message sent" : item.kind === "SERVICE" ? "Request received" : "Request received";
    const text =
      item.kind === "SERVICE"
        ? intake.quoteMode === "send"
          ? "Your quote is on its way — check your email."
          : "We'll send your quote shortly."
        : item.kind === "MESSAGE"
          ? "We'll be in touch within 1 business day."
          : "We'll be in touch within 1 business day to set a time.";
    return (
      <div className={`${card} py-10 text-center`}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22` }}>
          <CheckCircle size={28} style={{ color: accent }} />
        </div>
        <h2 className={`mb-2 text-xl font-bold ${ink}`}>{title}</h2>
        <p className={`text-sm ${muted}`}>{text}</p>
      </div>
    );
  }

  const sq = intake.serviceQuestion;

  return (
    <form onSubmit={handleSubmit} className={`${card} relative space-y-4`}>
      {showHeader && (
        <div className="pb-1">
          <h2 className={`text-lg font-bold ${ink}`}>{item.heading}</h2>
          {item.description && <p className={`mt-0.5 text-sm ${muted}`}>{item.description}</p>}
        </div>
      )}
      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {/* Honeypot — humans never see it, bots fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>First name *</label>
          <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required autoComplete="given-name" className={input} />
        </div>
        <div>
          <label className={label}>Last name *</label>
          <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required autoComplete="family-name" className={input} />
        </div>
      </div>
      {(f.email.show || f.phone.show) && (
        <div className="grid grid-cols-2 gap-4">
          {f.email.show && (
            <div className={f.phone.show ? "" : "col-span-2"}>
              <label className={label}>
                {f.email.label}
                {f.email.required ? " *" : ""}
              </label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required={f.email.required} autoComplete="email" className={input} />
            </div>
          )}
          {f.phone.show && (
            <div className={f.email.show ? "" : "col-span-2"}>
              <label className={label}>
                {f.phone.label}
                {f.phone.required ? " *" : ""}
              </label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required={f.phone.required} autoComplete="tel" className={input} />
            </div>
          )}
        </div>
      )}
      {f.address.show && (
        <div>
          <label className={label}>
            {f.address.label}
            {f.address.required ? " *" : ""}
          </label>
          <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} required={f.address.required} placeholder="123 Main St, Dallas, TX 75201" autoComplete="street-address" className={input} />
        </div>
      )}

      {item.kind === "SERVICE" && item.services.length > 0 && (
        <div>
          <label className={label}>
            {sq.label || "What do you need?"} *{intake.allowMultiple ? " (pick any)" : ""}
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {item.services.map((s) => {
              const selected = selectedServices.includes(s.id);
              return (
                <label key={s.id} className={`${choice} ${selected ? "" : choiceIdle}`} style={selected ? { borderColor: accent } : undefined}>
                  <input
                    type={intake.allowMultiple ? "checkbox" : "radio"}
                    name="services"
                    checked={selected}
                    required={!intake.allowMultiple && selectedServices.length === 0}
                    onChange={() => toggleService(s.id)}
                    className="mt-0.5 shrink-0"
                    style={{ accentColor: accent }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-baseline justify-between gap-2 text-sm font-semibold ${ink}`}>
                      <span className="min-w-0">{s.name}</span>
                      <span className="shrink-0" style={{ color: accent }}>
                        {s.priceLabel}
                      </span>
                    </span>
                    {s.description && <span className={`mt-0.5 block text-xs ${muted}`}>{s.description}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {sq.show && (
        <div>
          <label className={label}>
            {sq.label}
            {sq.required ? " *" : ""}
          </label>
          {sq.type === "radio" && sq.options.length > 0 ? (
            <Choices name="service" options={sq.options} value={form.service} required={sq.required} onChange={(v) => set("service", v)} />
          ) : sq.type === "select" && sq.options.length > 0 ? (
            <select value={form.service} onChange={(e) => set("service", e.target.value)} required={sq.required} className={`${input} ${dark ? "[&>option]:text-gray-900" : ""}`}>
              <option value="">Select...</option>
              {sq.options.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value={form.service} onChange={(e) => set("service", e.target.value)} required={sq.required} placeholder={sq.placeholder} className={input} />
          )}
        </div>
      )}

      {intake.customFields.map(renderCustomField)}

      {f.date.show && (
        <div>
          <label className={label}>
            {f.date.label}
            {f.date.required ? " *" : ""}
          </label>
          <input type="date" value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)} required={f.date.required} className={input} />
        </div>
      )}
      {intake.message.show && (
        <div>
          <label className={label}>
            {intake.message.label}
            {intake.message.required ? " *" : ""}
          </label>
          <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={3} required={intake.message.required} placeholder={intake.message.placeholder} className={`${input} resize-none`} />
        </div>
      )}
      {!preview && <TurnstileWidget onToken={setCaptchaToken} />}
      <button
        type="submit"
        disabled={loading || preview}
        className="flex w-full items-center justify-center gap-2 rounded py-3 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: accent, color: textOn(accent) }}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {item.buttonLabel}
      </button>
    </form>
  );
}
