"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, CheckCircle, Loader2 } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import {
  DEFAULT_BOOKING_FORM,
  servicePriceLabel,
  type BookingFormConfig,
  type CustomField,
} from "@/lib/booking-form";
import { zipFromAddress } from "@/lib/business-hours";

type SlotDay = { date: string; label: string; slots: { start: string; label: string }[] };

/** Downloadable "add to calendar" event for a just-booked arrival window. */
function icsHref(summary: string, startIso: string, endIso: string) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Streamflaire//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${fmt(startIso)}-booking@streamflaire`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(startIso)}`,
    `DTEND:${fmt(endIso)}`,
    `SUMMARY:${summary.replace(/[\r\n,;]/g, " ")}`,
    "DESCRIPTION:Arrival window — awaiting confirmation from the business",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export type FormTheme = "light" | "dark";

/**
 * Public booking form, used on /book/[slug] and inside the /embed/[slug]
 * iframe. Themeable (light/dark + transparent), brandable (accent), and
 * field-configurable per company (Settings → Booking Form) so it blends into
 * any website instead of sticking out.
 */
export default function BookingForm({
  companySlug,
  formSlug = "",
  formType = "BOOKING",
  theme = "light",
  accent = "#16A34A",
  transparent = false,
  config = DEFAULT_BOOKING_FORM,
  initialService = "",
  showHeader = false,
  companyName = "",
}: {
  companySlug: string;
  formSlug?: string;
  formType?: "INQUIRY" | "BOOKING" | "SERVICE_REQUEST";
  theme?: FormTheme;
  accent?: string;
  transparent?: boolean;
  config?: BookingFormConfig;
  initialService?: string;
  showHeader?: boolean;
  companyName?: string;
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
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  // Anti-spam: bots fill the off-screen "website" field and submit instantly;
  // the API silently drops submissions that trip either signal
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());

  // Self-scheduling (BOOKING forms with the toggle on): the client picks a
  // service, then a real arrival window instead of a preferred date.
  const selfBook =
    formType === "BOOKING" && config.selfSchedule.enabled && config.services.length > 0;
  const [bookServiceId, setBookServiceId] = useState("");
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [outOfArea, setOutOfArea] = useState(false);
  const [zipRequired, setZipRequired] = useState(false);
  const [activeDay, setActiveDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; label: string } | null>(null);
  const [booked, setBooked] = useState<{ start: string; windowEnd: string; label: string; service: string } | null>(null);
  const [slotsEpoch, setSlotsEpoch] = useState(0); // bump to force a refetch
  const zip = zipFromAddress(form.address) ?? "";

  useEffect(() => {
    if (!selfBook || !bookServiceId) return;
    let cancelled = false;
    setSlotsLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ service: bookServiceId });
        if (formSlug) params.set("form", formSlug);
        if (zip) params.set("zip", zip);
        const res = await fetch(`/api/public/booking-slots/${companySlug}?${params}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data) {
          setDays([]);
        } else {
          setOutOfArea(data.outOfArea === true);
          setZipRequired(data.zipRequired === true);
          const d: SlotDay[] = Array.isArray(data.days) ? data.days : [];
          setDays(d);
          setActiveDay((prev) => (d.some((x) => x.date === prev) ? prev : (d[0]?.date ?? "")));
          setSelectedSlot((prev) =>
            prev && d.some((x) => x.slots.some((s) => s.start === prev.start)) ? prev : null
          );
        }
      } catch {
        if (!cancelled) setDays([]);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfBook, bookServiceId, zip, companySlug, formSlug, slotsEpoch]);

  const dark = theme === "dark";
  const card = transparent
    ? "bg-transparent"
    : dark
      ? "bg-[#101410] border border-white/10 rounded-lg p-6 shadow-sm"
      : "card-ledger p-6 shadow-sm";
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

  // Slot picking is live while the form renders, so the classic date field
  // only shows when self-scheduling is off, no service is picked yet, or the
  // schedule genuinely has nothing open (fall back to "we'll call you").
  const slotsExhausted = selfBook && bookServiceId !== "" && days !== null && days.length === 0 && !slotsLoading;
  const slotPickerActive = selfBook && !outOfArea && !slotsExhausted;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (slotPickerActive) {
      if (!bookServiceId) {
        setError("Pick a service to book.");
        return;
      }
      if (zipRequired && !zip) {
        setError("Enter your address with ZIP code so we can check our service area.");
        return;
      }
      if (!selectedSlot) {
        setError("Pick a time that works for you.");
        return;
      }
    }
    setLoading(true);

    try {
      const res = await fetch(`/api/public/book/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          custom,
          formSlug,
          selectedServices,
          captchaToken,
          website: honeypot,
          elapsedMs: Date.now() - startedAt,
          ...(slotPickerActive && selectedSlot
            ? { serviceId: bookServiceId, slotStart: selectedSlot.start }
            : {}),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && data?.slotTaken) {
          setSelectedSlot(null);
          setSlotsEpoch((n) => n + 1); // refresh the open times
        }
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data?.booking) setBooked(data.booking);
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
    const doneText =
      formType === "SERVICE_REQUEST"
        ? "Your order is in — check your email for the details."
        : formType === "BOOKING"
          ? "We'll be in touch within 1 business day to confirm your appointment."
          : "We'll be in touch within 1 business day.";
    return (
      <div className={`${card} text-center py-10`}>
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: `${accent}22` }}
        >
          <CheckCircle size={28} style={{ color: accent }} />
        </div>
        <h2 className={`text-xl font-bold mb-2 ${dark ? "text-white" : "text-gray-900"}`}>
          {booked ? "You're penciled in!" : formType === "SERVICE_REQUEST" ? "Order received!" : "Request received!"}
        </h2>
        {booked ? (
          <>
            <p className={`text-sm font-semibold ${dark ? "text-gray-200" : "text-gray-800"}`}>
              {booked.service} — {booked.label}
            </p>
            <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>
              We&apos;ll confirm your booking shortly — watch your inbox.
            </p>
            <a
              href={icsHref(
                `${booked.service}${companyName ? ` — ${companyName}` : ""}`,
                booked.start,
                booked.windowEnd
              )}
              download="appointment.ics"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium hover:underline"
              style={{ color: accent }}
            >
              <CalendarPlus size={14} />
              Add to calendar
            </a>
          </>
        ) : (
          <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>{doneText}</p>
        )}
      </div>
    );
  }

  const svc = config.service;
  const f = config.fields;
  // The self-schedule service picker replaces the free-text service question
  const askService = formType !== "SERVICE_REQUEST" && svc.show && !selfBook;

  function toggleService(id: string) {
    if (config.serviceRequest.allowMultiple) {
      setSelectedServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    } else {
      setSelectedServices([id]);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${card} space-y-4 relative`}>
      {showHeader && (config.header.title || config.header.description) && (
        <div className="pb-1">
          {config.header.title && (
            <h2 className={`text-lg font-bold ${dark ? "text-white" : "text-gray-900"}`}>
              {config.header.title}
            </h2>
          )}
          {config.header.description && (
            <p className={`text-sm mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>
              {config.header.description}
            </p>
          )}
        </div>
      )}
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
          <label className={label}>{f.nameFirstLabel} *</label>
          <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required
            className={input} />
        </div>
        <div>
          <label className={label}>{f.nameLastLabel} *</label>
          <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required
            className={input} />
        </div>
      </div>
      {(f.email.show || f.phone.show) && (
        <div className="grid grid-cols-2 gap-4">
          {f.email.show && (
            <div className={f.phone.show ? "" : "col-span-2"}>
              <label className={label}>{f.email.label}{f.email.required ? " *" : ""}</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                required={f.email.required} className={input} />
            </div>
          )}
          {f.phone.show && (
            <div className={f.email.show ? "" : "col-span-2"}>
              <label className={label}>{f.phone.label}{f.phone.required ? " *" : ""}</label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                required={f.phone.required} className={input} />
            </div>
          )}
        </div>
      )}
      {f.address.show && (
        <div>
          <label className={label}>{f.address.label}{f.address.required ? " *" : ""}</label>
          <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
            required={f.address.required}
            placeholder="123 Main St, Dallas, TX 75201"
            className={input} />
        </div>
      )}
      {formType === "SERVICE_REQUEST" && config.services.length > 0 && (
        <div>
          <label className={label}>
            {svc.label} *{config.serviceRequest.allowMultiple ? " (pick any)" : ""}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {config.services.map((s) => {
              const selected = selectedServices.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`${radioCard} ${selected ? "" : radioIdle}`}
                  style={selected ? { borderColor: accent } : undefined}
                >
                  <input
                    type={config.serviceRequest.allowMultiple ? "checkbox" : "radio"}
                    name="services"
                    checked={selected}
                    required={!config.serviceRequest.allowMultiple && selectedServices.length === 0}
                    onChange={() => toggleService(s.id)}
                    className="mt-0.5 shrink-0"
                    style={{ accentColor: accent }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-baseline justify-between gap-2 text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0" style={{ color: accent }}>{servicePriceLabel(s)}</span>
                    </span>
                    {s.description && (
                      <span className={`block text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>
                        {s.description}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {selfBook && (
        <div>
          <label className={label}>{svc.label || "What do you need?"} *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {config.services.map((s) => {
              const selected = bookServiceId === s.id;
              return (
                <label
                  key={s.id}
                  className={`${radioCard} ${selected ? "" : radioIdle}`}
                  style={selected ? { borderColor: accent } : undefined}
                >
                  <input
                    type="radio"
                    name="book-service"
                    checked={selected}
                    required={bookServiceId === ""}
                    onChange={() => {
                      setBookServiceId(s.id);
                      setSelectedSlot(null);
                    }}
                    className="mt-0.5 shrink-0"
                    style={{ accentColor: accent }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-baseline justify-between gap-2 text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0" style={{ color: accent }}>{servicePriceLabel(s)}</span>
                    </span>
                    {s.description && (
                      <span className={`block text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>
                        {s.description}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {selfBook && !slotsExhausted && (
        <div>
          <label className={label}>Pick a time *</label>
          {outOfArea ? (
            <div className="px-4 py-3 rounded border border-amber-300 bg-amber-50 text-sm text-amber-800">
              That address looks outside our service area. You can still send your request
              below and we&apos;ll see what we can do.
            </div>
          ) : !bookServiceId ? (
            <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
              Choose a service above to see open times.
            </p>
          ) : zipRequired && !zip ? (
            <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
              Enter your address (with ZIP code) above so we can check our service area and
              show open times.
            </p>
          ) : days === null || (slotsLoading && days.length === 0) ? (
            <p className={`flex items-center gap-2 text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
              <Loader2 size={14} className="animate-spin" /> Finding open times...
            </p>
          ) : (
            <div className={slotsLoading ? "opacity-60" : ""}>
              <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                {days.map((d) => {
                  const active = d.date === activeDay;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setActiveDay(d.date)}
                      className={`shrink-0 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                        active ? "text-white" : dark ? "border-white/15 text-gray-300 hover:border-white/30" : "border-gray-300 text-gray-600 hover:border-gray-400"
                      }`}
                      style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {(days.find((d) => d.date === activeDay)?.slots ?? []).map((s) => {
                  const selected = selectedSlot?.start === s.start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      className={`px-2 py-2 rounded border text-xs font-medium transition-colors ${
                        selected ? "text-white" : dark ? "border-white/15 text-gray-200 hover:border-white/30" : "border-gray-300 text-gray-700 hover:border-gray-400"
                      }`}
                      style={selected ? { backgroundColor: accent, borderColor: accent } : undefined}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <p className={`mt-1.5 text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>
                Times shown are arrival windows — we&apos;ll confirm your booking before it&apos;s final.
              </p>
            </div>
          )}
        </div>
      )}
      {slotsExhausted && (
        <div className="px-4 py-3 rounded border border-amber-300 bg-amber-50 text-sm text-amber-800">
          No open times right now — leave a preferred date below and we&apos;ll reach out to
          get you scheduled.
        </div>
      )}
      {askService && (
        <div>
          <label className={label}>{svc.label}{svc.required ? " *" : ""}</label>
          {svc.type === "radio" && svc.options.length > 0 ? (
            <RadioCards
              name="service"
              options={svc.options}
              value={form.service}
              required={svc.required}
              onChange={(v) => set("service", v)}
            />
          ) : svc.type === "select" && svc.options.length > 0 ? (
            <select value={form.service} onChange={(e) => set("service", e.target.value)} required={svc.required}
              className={`${input} ${dark ? "[&>option]:text-gray-900" : ""}`}>
              <option value="">Select...</option>
              {svc.options.map((o) => (
                <option key={o.label} value={o.label}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input type="text" value={form.service} onChange={(e) => set("service", e.target.value)} required={svc.required}
              placeholder={svc.placeholder}
              className={input} />
          )}
        </div>
      )}
      {config.customFields.map(renderCustomField)}
      {f.date.show && !slotPickerActive && (
        <div>
          <label className={label}>{f.date.label}{f.date.required ? " *" : ""}</label>
          <input type="date" value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)}
            required={f.date.required} className={input} />
        </div>
      )}
      {config.message.show && (
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
      )}
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
