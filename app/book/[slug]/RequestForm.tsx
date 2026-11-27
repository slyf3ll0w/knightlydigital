"use client";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useEffect, useRef, useState } from "react";
import { smsConsentLabel, businessSmsTermsUrl, businessPrivacyUrl } from "@/lib/sms-consent";
import Link from "next/link";
import { CheckCircle, Loader2 } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { embedAccent, embedOnAccent, embedWash } from "@/lib/embed-style";
import type { PublicBookingType } from "@/lib/booking-runtime";
import { ADDRESS_DEFAULTS, doneWords, type CustomField } from "@/lib/booking-intake";
import type { ScheduleAppearance } from "./schedule/shell";
import { notifyEmbedSubmitted } from "@/lib/embed-submitted";
import { getArrival } from "@/lib/arrival-client";
import { clientFormStyle } from "@/lib/client-form-style";
import { matchServiceFromPage, matchServiceName } from "@/lib/page-service-match";
import "@/app/client-heavy.css";

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
  hub = null,
  doneHref = "",
  businessName = "",
  offerSms = true,
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
  /** Client hub: the signed-in client is on file — no name, no fields they have, no captcha */
  hub?: { token: string; contact: { firstName: string; lastName: string; email: string; phone: string; address: string } } | null;
  /** Where the done screen sends them (the hub's requests list) */
  doneHref?: string;
  /** Names the business in the SMS consent checkbox ("...from Acme Plumbing via WorkBench") */
  businessName?: string;
  /** Show the SMS consent checkbox — only when the business has its own line (offersSmsConsent). */
  offerSms?: boolean;
}) {
  const { dark, accent: savedAccent, transparent } = appearance;
  // Saved accent, or the host website's once an embed matches it (lib/embed-style.ts)
  const accent = embedAccent(savedAccent);
  const onAccent = embedOnAccent(savedAccent);
  const intake = item.intake;
  // ?service= (or data-service on the snippet): a dropdown or choice list takes the option it names, a text box the words as typed.
  const resolveService = (wanted: string) => {
    const q = intake.serviceQuestion;
    if (!wanted || q.type === "text" || q.options.length === 0) return wanted;
    return q.options[matchServiceName(q.options.map((o) => o.label), wanted)]?.label ?? "";
  };
  const f = intake.fields;
  // In the hub, what the client already has on file isn't asked again
  const askEmail = f.email.show && !(hub && hub.contact.email);
  const askPhone = f.phone.show && !(hub && hub.contact.phone);
  const askAddress = f.address.show && !(hub && hub.contact.address);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  // Unchecked by default on purpose — carriers require an affirmative opt-in
  const [smsConsent, setSmsConsent] = useState(false);
  const [form, setForm] = useState({
    firstName: hub?.contact.firstName ?? "",
    lastName: hub?.contact.lastName ?? "",
    email: hub?.contact.email ?? "",
    phone: hub?.contact.phone ?? "",
    address: hub?.contact.address ?? "",
    service: resolveService(initialService),
    preferredDate: "",
    message: "",
  });
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    if (item.services.length === 1) return [item.services[0].id];
    const named = item.kind === "SERVICE" ? item.services[matchServiceName(item.services.map((s) => s.name), initialService)] : undefined;
    return named ? [named.id] : [];
  });
  // On a website: the page the form sits on usually names one service
  // ("/fence-repair"). The embed says which page that is; pick the service it
  // is about, once, and never over something the visitor already chose.
  const serviceTouched = useRef(false);
  useEffect(() => {
    if (hub || !intake.serviceQuestion.matchPage || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as { type?: unknown; href?: unknown; title?: unknown } | null;
      if (!d || d.type !== "jobflow:page" || serviceTouched.current) return;
      const page = { href: typeof d.href === "string" ? d.href.slice(0, 500) : "", title: typeof d.title === "string" ? d.title.slice(0, 200) : "" };
      const sq = intake.serviceQuestion;
      if (sq.show && sq.type !== "text" && sq.options.length > 0) {
        const hit = sq.options[matchServiceFromPage(sq.options.map((o) => o.label), page)];
        if (hit) setForm((s) => (s.service ? s : { ...s, service: hit.label }));
      }
      if (item.kind === "SERVICE" && item.services.length > 1) {
        const hit = item.services[matchServiceFromPage(item.services.map((s) => s.name), page)];
        if (hit) setSelectedServices((cur) => (cur.length ? cur : [hit.id]));
      }
    };
    window.addEventListener("message", onMessage);
    // The embed sends the page once on load, which can beat this listener: ask again.
    window.parent.postMessage({ type: "workbench:style-request" }, "*");
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Anti-spam: bots fill the off-screen "website" field and submit instantly;
  // the API silently drops submissions that trip either signal
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());

  // One recipe with the stepper (lib/client-form-style.ts): heavy on light, the saved dark/transparent looks as they were
  const st = clientFormStyle(appearance);
  const card = `${st.card} ${transparent ? "" : "p-5 sm:p-7"}`;
  const { ink, muted, label, input } = st;
  // The picked tile's edge: the heavy tiles read --ch-accent, the others an inline border
  const pickedEdge = (on: boolean) => (on && !st.heavy ? { borderColor: accent } : undefined);
  const accentVars = { "--ch-accent": accent, "--ch-on-accent": onAccent } as React.CSSProperties;

  const set = (field: string, value: string) => {
    if (field === "service") serviceTouched.current = true;
    setForm((s) => ({ ...s, [field]: value }));
  };

  function toggleService(id: string) {
    serviceTouched.current = true;
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
          smsConsent: offerSms ? smsConsent : undefined,
          hubToken: hub?.token,
          arrival: hub ? undefined : getArrival(),
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
      notifyEmbedSubmitted("request");
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
            <label key={o.label} className={st.choice(selected)} style={pickedEdge(selected)}>
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
    // The owner's words for this screen, else the defaults for the kind
    const words = doneWords(intake, { kind: item.kind, mode: "REQUEST", confirmation: "INSTANT" });
    const title = words.heading;
    const text = words.body;
    return (
      <div className={`${card} py-10 text-center`} style={accentVars}>
        {st.heavy ? (
          <div className="ch-done-mark mb-5">
            <CheckCircle size={30} />
          </div>
        ) : (
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: embedWash(savedAccent, 13) }}>
            <CheckCircle size={28} style={{ color: accent }} />
          </div>
        )}
        <h2 className={st.heavy ? "ch-h2 mb-2 text-gray-900" : `mb-2 text-xl font-bold ${ink}`}>{title}</h2>
        <p className={`text-sm ${muted}`}>{text}</p>
        {words.note && <p className={`mt-3 whitespace-pre-line text-sm ${muted}`}>{words.note}</p>}
        {doneHref && (
          <Link href={doneHref} className={st.heavy ? "ch-btn-2 is-auto mt-6" : "mt-5 inline-block text-sm font-medium hover:underline"} style={st.heavy ? undefined : { color: accent }}>
            See your requests
          </Link>
        )}
      </div>
    );
  }

  const sq = intake.serviceQuestion;

  return (
    <form onSubmit={handleSubmit} className={`${card} relative ${st.heavy ? "space-y-5" : "space-y-4"}`} style={accentVars}>
      {showHeader && (
        <div className="pb-1">
          <h2 className={st.heading}>{item.heading}</h2>
          {item.description && <p className={`mt-1 text-sm ${muted}`}>{item.description}</p>}
        </div>
      )}
      {error && <div className={st.error}>{error}</div>}
      {/* Honeypot — humans never see it, bots fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>

      {hub ? (
        <p className={`text-sm ${muted}`}>
          From {hub.contact.firstName} {hub.contact.lastName}
          {hub.contact.email ? ` · ${hub.contact.email}` : hub.contact.phone ? ` · ${hub.contact.phone}` : ""}
        </p>
      ) : (
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
      )}
      {(askEmail || askPhone) && (
        <div className="grid grid-cols-2 gap-4">
          {askEmail && (
            <div className={askPhone ? "" : "col-span-2"}>
              <label className={label}>
                {f.email.label}
                {f.email.required ? " *" : ""}
              </label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required={f.email.required} autoComplete="email" className={input} />
            </div>
          )}
          {askPhone && (
            <div className={askEmail ? "" : "col-span-2"}>
              <label className={label}>
                {f.phone.label}
                {f.phone.required ? " *" : ""}
              </label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required={f.phone.required} autoComplete="tel" className={input} />
            </div>
          )}
        </div>
      )}
      {askPhone && offerSms && (
        <label className={`flex items-start gap-2 leading-snug ${st.heavy ? "text-[12px]" : "text-[11px]"} ${dark ? "text-gray-400" : "text-gray-500"}`}>
          <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className={`shrink-0 rounded ${st.heavy ? "mt-0.5 h-4 w-4" : "mt-px h-3.5 w-3.5"}`} style={{ accentColor: accent }} />
          <span>
            {smsConsentLabel(businessName || "this business")}{" "}
            <a href={businessSmsTermsUrl(companySlug)} target="_blank" rel="noreferrer" className="underline">
              Text terms
            </a>{" · "}
            <a href={businessPrivacyUrl(companySlug)} target="_blank" rel="noreferrer" className="underline">
              Privacy
            </a>
          </span>
        </label>
      )}
      {askAddress && (
        <div>
          <label className={label}>
            {f.address.label}
            {f.address.required ? " *" : ""}
          </label>
          <AddressAutocomplete dark={dark} endpoint={`/api/public/address-suggest?slug=${encodeURIComponent(companySlug)}`} value={form.address} onChange={(v) => set("address", v)} onPick={(a) => set("address", a.label)} required={f.address.required} placeholder={f.address.placeholder || ADDRESS_DEFAULTS.placeholder} className={input} />
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
                <label key={s.id} className={st.choice(selected)} style={pickedEdge(selected)}>
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
      {!preview && !hub && <TurnstileWidget onToken={setCaptchaToken} />}
      <button
        type="submit"
        disabled={loading || preview}
        className={st.primaryBtn}
        style={{ backgroundColor: accent, color: onAccent }}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {item.buttonLabel}
      </button>
    </form>
  );
}
