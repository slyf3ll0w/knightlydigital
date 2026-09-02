"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarPlus, Check, CheckCircle, Clock, ExternalLink, Globe, Loader2, MapPin, Phone, Video, Wrench } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import { zipFromAddress } from "@/lib/business-hours";
import type { PublicBookingType } from "@/lib/booking-runtime";
import { durationLabel } from "@/lib/booking-types";
import type { ScheduleAppearance } from "../shell";
import PaymentStep, { type PaymentHandle } from "./PaymentStep";
import type { FinixConfig } from "@/lib/finix-js";
import { derivedQuoteDeposit } from "@/lib/statuses";
import { encodePrefill, type Prefill } from "@/lib/booking-prefill";

/**
 * Public booking page for one booking type — a stepper: services (SERVICE)
 * → address (in-person) → day + time → your details (+ card when paid) →
 * confirmed. Desktop keeps a summary rail on the left (what you're booking,
 * with whom, when); phones stack it. Themed like the company's forms.
 */

type SlotDay = { date: string; label: string; slots: { start: string; end: string; windowEnd: string; label: string }[] };
type Booked = {
  start: string;
  end: string;
  windowEnd: string;
  label: string;
  typeName: string;
  exactTime: boolean;
  tentative: boolean;
  withName: string | null;
  meetingLink: string | null;
  manageUrl: string | null;
  address: string | null;
  paidNote?: string | null;
};

const ICON = { PHONE_CALL: Phone, VIDEO_CALL: Video, IN_PERSON: MapPin, SERVICE: Wrench } as const;

type DepositRule = { depositType: "NONE" | "PERCENT" | "FIXED" | "FULL"; depositValue: number | null };
export type BookingPaymentConfig = {
  finix: FinixConfig;
  surchargeRate: number | null;
  companyDeposit: DepositRule;
  serviceDeposits: Record<string, DepositRule>;
};

function icsHref(summary: string, startIso: string, endIso: string, location?: string | null) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WorkBench//Online Booking//EN",
    "BEGIN:VEVENT",
    `UID:${fmt(startIso)}-booking@workbenchfsm.com`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(startIso)}`,
    `DTEND:${fmt(endIso)}`,
    `SUMMARY:${summary.replace(/[\r\n,;]/g, " ")}`,
    ...(location ? [`LOCATION:${location.replace(/[\r\n,;]/g, " ")}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function googleUrl(summary: string, startIso: string, endIso: string, location?: string | null) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const p = new URLSearchParams({ action: "TEMPLATE", text: summary, dates: `${fmt(startIso)}/${fmt(endIso)}` });
  if (location) p.set("location", location);
  return `https://calendar.google.com/calendar/render?${p}`;
}

export default function BookingStepper({
  companySlug,
  type,
  company,
  appearance,
  embed = false,
  payment,
  hostedUrl,
  prefill,
}: {
  companySlug: string;
  type: PublicBookingType;
  company: { name: string; timezone: string; phone: string | null; email: string | null; menuHref: string };
  appearance: ScheduleAppearance;
  embed?: boolean;
  /** Card processing for paid service types; finix null = payments not live. */
  payment?: BookingPaymentConfig;
  /** Absolute URL of the hosted booking page (embeds hand paid bookings off to it). */
  hostedUrl?: string;
  /** Selections carried over from an embed handoff (see prefillParam). */
  prefill?: Prefill | null;
}) {
  const { dark, accent, transparent } = appearance;
  const Icon = ICON[type.kind];
  const visitorTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || company.timezone, [company.timezone]);
  // Calls show in the visitor's zone (they might be anywhere); visits always in company time
  const [tz, setTz] = useState(type.exactTime ? visitorTz : company.timezone);
  useEffect(() => {
    if (type.exactTime) setTz(visitorTz);
  }, [type.exactTime, visitorTz]);

  const steps = useMemo(() => {
    const s: ("services" | "address" | "time" | "details")[] = [];
    if (type.kind === "SERVICE") s.push("services");
    if (type.needsAddress) s.push("address");
    s.push("time", "details");
    return s;
  }, [type.kind, type.needsAddress]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  const [services, setServices] = useState<string[]>(
    prefill?.services?.length ? prefill.services.filter((id) => type.services.some((s) => s.id === id)) : type.services.length === 1 ? [type.services[0].id] : []
  );
  const [address, setAddress] = useState(prefill?.address ?? "");
  // A handed-off slot: selected once the fresh slot list confirms it's still open
  const [pendingStart, setPendingStart] = useState<string | null>(prefill?.start ?? null);
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [outOfArea, setOutOfArea] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [activeDay, setActiveDay] = useState("");
  const [slot, setSlot] = useState<SlotDay["slots"][number] | null>(null);
  const [slotsEpoch, setSlotsEpoch] = useState(0);
  const [form, setForm] = useState({
    firstName: prefill?.firstName ?? "",
    lastName: prefill?.lastName ?? "",
    email: prefill?.email ?? "",
    phone: prefill?.phone ?? "",
    notes: prefill?.notes ?? "",
  });
  const [captchaToken, setCaptchaToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Booked | null>(null);
  const paymentRef = useRef<PaymentHandle>(null);
  const [cardReady, setCardReady] = useState(false);

  const zip = zipFromAddress(address) ?? "";
  const picked = type.services.filter((s) => services.includes(s.id));
  const total = picked.reduce((sum, s) => sum + s.price, 0);
  const allFixed = picked.length > 0 && picked.every((s) => s.priceDisplay === "FIXED");
  const paying = type.paymentMode !== "NONE" && allFixed && Boolean(payment?.finix);
  // finix.js won't mount inside a third-party iframe — embeds send paid
  // bookings to the hosted page (new tab) with everything prefilled.
  const handoff = embed && paying && Boolean(hostedUrl);
  const handoffUrl = () =>
    `${hostedUrl}?prefill=${encodePrefill({ services, address, start: slot?.start, firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, notes: form.notes })}`;
  const depositAmount =
    type.paymentMode === "DEPOSIT" && payment
      ? derivedQuoteDeposit(
          picked.map((s) => ({ total: s.price, deposit: payment.serviceDeposits[s.id] ?? null })),
          total,
          payment.companyDeposit
        )
      : null;
  const duration = type.kind === "SERVICE" ? picked.reduce((sum, s) => sum + (s.durationMinutes ?? type.durationMinutes), 0) : type.durationMinutes;

  // Fetch open times whenever the inputs that shape them change
  const addressParam = type.needsAddress ? (zip ? address.trim() : "") : "";
  const servicesParam = services.join(",");
  useEffect(() => {
    if (type.needsAddress && !addressParam) {
      setDays(null);
      return;
    }
    if (type.kind === "SERVICE" && !servicesParam) {
      setDays(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (addressParam) params.set("address", addressParam);
        if (servicesParam) params.set("services", servicesParam);
        const res = await fetch(`/api/public/schedule/${companySlug}/${type.slug}/slots?${params}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data) {
          setDays([]);
          return;
        }
        setOutOfArea(data.outOfArea === true);
        setUnavailable(data.unavailable === true);
        const d: SlotDay[] = Array.isArray(data.days) ? data.days : [];
        setDays(d);
        setSlot((prev) => (prev && d.some((x) => x.slots.some((s) => s.start === prev.start)) ? prev : null));
        if (pendingStart) {
          const hit = d.flatMap((x) => x.slots).find((s) => s.start === pendingStart);
          setPendingStart(null);
          if (hit) {
            setSlot(hit);
            setStepIdx(steps.length - 1);
          } else {
            setStepIdx(steps.indexOf("time"));
            setError("That time was just taken — please pick another.");
          }
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
  }, [companySlug, type.slug, type.kind, type.needsAddress, addressParam, servicesParam, slotsEpoch]);

  // Re-group by the chosen timezone (calls) — visits keep company-day grouping + labels
  const shownDays = useMemo(() => {
    if (!days) return null;
    if (!type.exactTime) return days;
    const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
    const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    const out: SlotDay[] = [];
    for (const d of days) {
      for (const s of d.slots) {
        const start = new Date(s.start);
        const key = keyFmt.format(start);
        let day = out.find((x) => x.date === key);
        if (!day) {
          day = { date: key, label: dayFmt.format(start), slots: [] };
          out.push(day);
        }
        day.slots.push({ ...s, label: timeFmt.format(start) });
      }
    }
    return out;
  }, [days, tz, type.exactTime]);

  useEffect(() => {
    if (!shownDays) return;
    setActiveDay((prev) => (shownDays.some((d) => d.date === prev) ? prev : (shownDays[0]?.date ?? "")));
  }, [shownDays]);

  const slotLabelIn = (s: { start: string; windowEnd: string }) => {
    const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
    const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    const start = new Date(s.start);
    const end = new Date(s.windowEnd);
    return `${dayFmt.format(start)}, ${timeFmt.format(start)}${end > start ? ` – ${timeFmt.format(end)}` : ""}`;
  };

  const canAdvance =
    step === "services"
      ? picked.length > 0
      : step === "address"
        ? Boolean(zip) && !outOfArea
        : step === "time"
          ? Boolean(slot)
          : true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!slot) {
      setError("Pick a time that works for you.");
      return;
    }
    if (type.kind === "PHONE_CALL" && !form.phone.trim()) {
      setError("Enter the phone number we should call.");
      return;
    }
    setSubmitting(true);
    try {
      let paymentToken: string | null = null;
      let fraudSessionId: string | null = null;
      if (paying) {
        const tok = await paymentRef.current?.tokenize();
        if (!tok) {
          setError("Check your card details and try again.");
          return;
        }
        paymentToken = tok.token;
        fraudSessionId = tok.fraudSessionId;
      }
      const res = await fetch(`/api/public/schedule/${companySlug}/${type.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          address: type.needsAddress ? address : undefined,
          slotStart: slot.start,
          services: type.kind === "SERVICE" ? services : undefined,
          paymentToken,
          fraudSessionId,
          captchaToken,
          website: honeypot,
          elapsedMs: Date.now() - startedAt,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && data?.slotTaken) {
          setSlot(null);
          setSlotsEpoch((n) => n + 1);
          setStepIdx(steps.indexOf("time"));
        }
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setBooked(data?.booking ?? null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styling (matches BookingForm's themed recipe) ─────────────────────────
  const ink = dark ? "text-white" : "text-gray-900";
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const card = transparent ? "bg-transparent" : dark ? "bg-[#101410] border border-white/10 rounded-lg shadow-sm" : "card-ledger shadow-sm";
  const label = dark ? "block text-sm font-medium text-gray-300 mb-1" : "block text-sm font-medium text-gray-700 mb-1";
  const input = dark
    ? "w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
    : "w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
  const chip = (selected: boolean) =>
    `px-2 py-2 rounded border text-xs font-medium transition-colors ${
      selected ? "text-white" : dark ? "border-white/15 text-gray-200 hover:border-white/30" : "border-gray-300 text-gray-700 hover:border-gray-400"
    }`;
  const primaryBtn = "w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 active:opacity-80 flex items-center justify-center gap-2 disabled:opacity-50";

  // ── Done ──────────────────────────────────────────────────────────────────
  if (booked) {
    const summary = `${booked.typeName} — ${company.name}`;
    const where = booked.address ?? booked.meetingLink ?? null;
    const whenLabel = type.exactTime ? slotLabelIn(booked) : booked.label;
    return (
      <div className={`${card} mx-auto max-w-lg px-6 py-10 text-center`}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22` }}>
          <CheckCircle size={28} style={{ color: accent }} />
        </div>
        <h2 className={`mb-1 text-xl font-bold ${ink}`}>{booked.tentative ? "You're penciled in!" : "You're booked!"}</h2>
        <p className={`text-sm font-semibold ${dark ? "text-gray-200" : "text-gray-800"}`}>{booked.typeName}</p>
        <p className={`mt-1 text-lg font-bold ${ink}`}>{whenLabel}</p>
        {type.exactTime && <p className={`text-xs ${muted}`}>{tz.replace(/_/g, " ")}</p>}
        {booked.withName && <p className={`mt-2 text-sm ${muted}`}>with {booked.withName}</p>}
        {booked.address && <p className={`mt-1 text-sm ${muted}`}>{booked.address}</p>}
        {booked.meetingLink && (
          <a href={booked.meetingLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: accent }}>
            <Video size={14} /> Join link <ExternalLink size={12} />
          </a>
        )}
        {booked.paidNote && <p className="mt-2 text-sm font-semibold text-green-600">{booked.paidNote}</p>}
        <p className={`mt-3 text-sm ${muted}`}>
          {booked.tentative ? "We'll confirm shortly — watch your inbox." : "A confirmation with calendar invite is on its way to your inbox."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
          <a href={googleUrl(summary, booked.start, booked.end, where)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline" style={{ color: accent }}>
            <CalendarPlus size={14} /> Google Calendar
          </a>
          <a href={icsHref(summary, booked.start, booked.end, where)} download="appointment.ics" className="inline-flex items-center gap-1.5 hover:underline" style={{ color: accent }}>
            <CalendarPlus size={14} /> Apple / Outlook
          </a>
        </div>
        {booked.manageUrl && (
          <p className={`mt-5 text-xs ${muted}`}>
            Need to change it?{" "}
            <a href={booked.manageUrl} className="underline" target={embed ? "_blank" : undefined} rel="noopener noreferrer">
              Reschedule or cancel
            </a>
          </p>
        )}
      </div>
    );
  }

  // ── Summary rail ──────────────────────────────────────────────────────────
  const rail = (
    <aside className={`${card} p-5 lg:sticky lg:top-6`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22`, color: accent }}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${ink}`}>{type.name}</p>
          <p className={`text-xs ${muted}`}>{company.name}</p>
        </div>
      </div>
      <dl className={`mt-4 space-y-2 text-sm ${dark ? "text-gray-300" : "text-gray-700"}`}>
        <div className="flex items-center gap-2">
          <Clock size={14} className={muted} />
          <span>
            {durationLabel(duration || type.durationMinutes)}
            {type.exactTime ? "" : ` · ${type.arrivalWindowMinutes > 0 ? "arrival window" : "exact time"}`}
          </span>
        </div>
        {picked.length > 0 && (
          <div className="flex items-start gap-2">
            <Wrench size={14} className={`mt-0.5 ${muted}`} />
            <span>
              {picked.map((s) => s.name).join(", ")}
              {allFixed && <span className={`block text-xs ${muted}`}>${total.toFixed(2)}{paying ? type.paymentMode === "FULL" ? " · paid at booking" : " · deposit at booking" : ""}</span>}
            </span>
          </div>
        )}
        {type.needsAddress && zip && (
          <div className="flex items-start gap-2">
            <MapPin size={14} className={`mt-0.5 ${muted}`} />
            <span>{address}</span>
          </div>
        )}
        {slot && (
          <div className="flex items-start gap-2">
            <CalendarPlus size={14} className={`mt-0.5 ${muted}`} />
            <span className="font-medium">{slotLabelIn(slot)}</span>
          </div>
        )}
        {type.exactTime && (
          <div className="flex items-center gap-2">
            <Globe size={14} className={muted} />
            <select value={tz} onChange={(e) => setTz(e.target.value)} className={`${dark ? "bg-transparent text-gray-300" : "bg-transparent text-gray-700"} text-xs focus:outline-none`}>
              {[...new Set([visitorTz, company.timezone])].map((z) => (
                <option key={z} value={z} className="text-gray-900">
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        )}
      </dl>
      <p className={`mt-4 text-xs ${muted}`}>{type.confirmation === "INSTANT" ? "Confirmed instantly." : "We'll confirm your booking before it's final."}</p>
      {!embed && (
        <a href={company.menuHref} className={`mt-3 inline-flex items-center gap-1 text-xs ${muted} hover:underline`}>
          <ArrowLeft size={12} /> Book something else
        </a>
      )}
    </aside>
  );

  const stepTitle =
    step === "services" ? "What do you need done?" : step === "address" ? "Where is it?" : step === "time" ? "Pick a time" : "Your details";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      {rail}
      <form onSubmit={submit} className={`${card} relative space-y-4 p-5 lg:p-6`}>
        {/* Stepper header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button type="button" onClick={() => setStepIdx(stepIdx - 1)} className={`rounded-full p-1.5 ${muted} hover:opacity-80`} aria-label="Back">
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className={`text-base font-semibold ${ink}`}>{stepTitle}</h2>
          </div>
          <div className="flex items-center gap-1" aria-label={`Step ${stepIdx + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <span key={s} className="h-1.5 w-5 rounded-full" style={{ backgroundColor: i <= stepIdx ? accent : dark ? "#ffffff22" : "#e5e7eb" }} />
            ))}
          </div>
        </div>

        {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>
        </div>

        {step === "services" && (
          <div className="space-y-2">
            {type.services.map((s) => {
              const on = services.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-start gap-3 rounded border px-4 py-3 transition-colors ${dark ? "bg-white/5" : ""} ${on ? "" : dark ? "border-white/15 hover:border-white/30" : "border-gray-300 hover:border-gray-400"}`}
                  style={on ? { borderColor: accent } : undefined}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setServices(e.target.checked ? [...services, s.id] : services.filter((id) => id !== s.id))}
                    className="mt-0.5 shrink-0"
                    style={{ accentColor: accent }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-baseline justify-between gap-3 text-sm font-semibold ${ink}`}>
                      <span>{s.name}</span>
                      <span className={`shrink-0 text-xs font-medium ${muted}`}>{s.priceLabel}</span>
                    </span>
                    {s.description && <span className={`mt-0.5 block text-xs ${muted}`}>{s.description}</span>}
                    {s.durationMinutes != null && <span className={`mt-0.5 block text-xs ${muted}`}>About {durationLabel(s.durationMinutes)}</span>}
                  </span>
                </label>
              );
            })}
            {type.paymentMode !== "NONE" && picked.length > 0 && !allFixed && (
              <p className={`text-xs ${muted}`}>Some of these are quoted on site, so nothing is charged now — we&apos;ll confirm pricing with you.</p>
            )}
          </div>
        )}

        {step === "address" && (
          <div>
            <label className={label}>Service address *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Plano, TX 75024"
              autoComplete="street-address"
              className={input}
              required
            />
            <p className={`mt-1.5 text-xs ${muted}`}>
              {outOfArea
                ? "That address looks outside our service area — please contact us and we'll see what we can do."
                : !zip
                  ? "Include your ZIP code — we only show times someone can actually get to."
                  : "Open times are based on who's working near you that day."}
            </p>
          </div>
        )}

        {step === "time" && (
          <div>
            {unavailable ? (
              <p className={`text-sm ${muted}`}>Online scheduling isn&apos;t open right now — please contact us.</p>
            ) : shownDays === null || (slotsLoading && (shownDays?.length ?? 0) === 0) ? (
              <p className={`flex items-center gap-2 text-sm ${muted}`}>
                <Loader2 size={14} className="animate-spin" /> Finding open times…
              </p>
            ) : shownDays.length === 0 ? (
              <p className={`text-sm ${muted}`}>
                No open times in the next {Math.max(1, Math.round(14))} days.{" "}
                {company.phone ? `Call us at ${company.phone}` : company.email ? `Email ${company.email}` : "Contact us"} and we&apos;ll find something.
              </p>
            ) : (
              <div className={slotsLoading ? "opacity-60" : ""}>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
                  {shownDays.map((d) => {
                    const active = d.date === activeDay;
                    return (
                      <button key={d.date} type="button" onClick={() => setActiveDay(d.date)} className={`shrink-0 rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "text-white" : dark ? "border-white/15 text-gray-300 hover:border-white/30" : "border-gray-300 text-gray-600 hover:border-gray-400"}`} style={active ? { backgroundColor: accent, borderColor: accent } : undefined}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(shownDays.find((d) => d.date === activeDay)?.slots ?? []).map((s) => {
                    const selected = slot?.start === s.start;
                    return (
                      <button key={s.start} type="button" onClick={() => setSlot(s)} className={chip(selected)} style={selected ? { backgroundColor: accent, borderColor: accent } : undefined}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <p className={`mt-1.5 text-xs ${muted}`}>
                  {type.exactTime ? `Times in ${tz.replace(/_/g, " ")}.` : "Times shown are arrival windows."}
                </p>
              </div>
            )}
          </div>
        )}

        {step === "details" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>First name *</label>
                <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required autoComplete="given-name" className={input} />
              </div>
              <div>
                <label className={label}>Last name *</label>
                <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required autoComplete="family-name" className={input} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" className={input} />
              </div>
              <div>
                <label className={label}>
                  Phone{type.kind === "PHONE_CALL" ? " * (we'll call this number)" : ""}
                </label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required={type.kind === "PHONE_CALL"} autoComplete="tel" className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Anything we should know?</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={`${input} resize-none`} />
            </div>
            {handoff && (
              <div className={`rounded border px-4 py-3 text-sm ${dark ? "border-white/15 text-gray-300" : "border-gray-200 text-gray-700"}`}>
                <p className="font-semibold">Pay now · ${(type.paymentMode === "FULL" ? total : (depositAmount ?? 0)).toFixed(2)}</p>
                <p className={`mt-1 text-xs ${muted}`}>Card payment opens in a secure window on {new URL(hostedUrl!).hostname} with everything you've entered here.</p>
              </div>
            )}
            {paying && !handoff && (
              <PaymentStep
                ref={paymentRef}
                finix={payment?.finix ?? null}
                amount={total}
                mode={type.paymentMode}
                depositAmount={depositAmount}
                surchargeRate={payment?.surchargeRate ?? null}
                dark={dark}
                accent={accent}
                onReady={setCardReady}
              />
            )}
            <TurnstileWidget onToken={setCaptchaToken} action="booking" />
          </div>
        )}

        {step === "details" && handoff ? (
          <a
            href={handoffUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className={primaryBtn}
            style={{ backgroundColor: accent, color: textOn(accent) }}
            onClick={(e) => {
              if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
                e.preventDefault();
                setError("Enter your name and email first.");
              }
            }}
          >
            <ExternalLink size={14} /> Continue to secure checkout
          </a>
        ) : step === "details" ? (
          <button type="submit" disabled={submitting || (paying && (type.paymentMode === "FULL" || (depositAmount ?? 0) > 0) && !cardReady)} className={primaryBtn} style={{ backgroundColor: accent, color: textOn(accent) }}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {paying
              ? type.paymentMode === "FULL"
                ? `Pay ${total.toFixed(2)} & book`
                : depositAmount && depositAmount > 0
                  ? `Pay ${depositAmount.toFixed(2)} deposit & book`
                  : "Confirm booking"
              : type.confirmation === "INSTANT"
                ? "Confirm booking"
                : "Request this time"}
          </button>
        ) : (
          <button type="button" disabled={!canAdvance} onClick={() => setStepIdx(stepIdx + 1)} className={primaryBtn} style={{ backgroundColor: accent, color: textOn(accent) }}>
            {step === "time" && slot ? (
              <>
                <Check size={14} /> {slotLabelIn(slot)}
              </>
            ) : (
              "Next"
            )}
          </button>
        )}
      </form>
    </div>
  );
}
