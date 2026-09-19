"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import { smsConsentLabel, SMS_TERMS_URL } from "@/lib/sms-consent";
import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import type { EstimatorInput } from "@/lib/estimator";
import { defaultSuccessMessage, estimateLabel, money, type EstimatorPublicConfig, type PublicEstimate } from "@/lib/estimator-public";

/**
 * The visitor-facing estimate form (lib/estimator-public.ts). Two screens:
 *   1. the tool's questions → "See my estimate" (server does the math)
 *   2. the estimate (exact lines / a range / nothing, per the owner) + the
 *      contact details → submit → thank-you.
 * Forms set to reveal the price after contact details show it on the
 * thank-you screen instead. Same themed recipe as the booking forms so an
 * estimate form and a booking form on one website read as one family.
 */

type Calc = { ok: true; estimate: PublicEstimate };

export default function PublicEstimateForm({
  companySlug,
  toolSlug,
  inputs,
  config,
  buttonLabel,
  heading,
  intro,
  appearance,
  businessName,
  showHeader = false,
  preview = false,
}: {
  companySlug: string;
  toolSlug: string;
  inputs: EstimatorInput[];
  config: EstimatorPublicConfig;
  buttonLabel: string;
  heading: string;
  intro: string;
  appearance: ScheduleAppearance;
  businessName: string;
  /** Embeds have no page frame — render the heading inside the card */
  showHeader?: boolean;
  /** Owner preview — the estimate computes, nothing submits */
  preview?: boolean;
}) {
  const { dark, accent, transparent } = appearance;
  const f = config.fields;
  const instant = config.reveal === "instant" && config.showPrice !== "hidden";

  const [step, setStep] = useState<"inputs" | "details" | "done">("inputs");
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const v: Record<string, string | boolean> = {};
    for (const i of inputs) {
      if (i.type === "toggle") v[i.id] = i.default === true;
      else if (i.default !== undefined && i.default !== null) v[i.id] = String(i.default);
      else v[i.id] = "";
    }
    return v;
  });
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [finalEstimate, setFinalEstimate] = useState<PublicEstimate | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", message: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const card = transparent ? "bg-transparent" : dark ? "bg-[#101410] border border-white/10 rounded-lg p-6 shadow-sm" : "card-ledger p-6 shadow-sm";
  const ink = dark ? "text-white" : "text-gray-900";
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const label = dark ? "block text-sm font-medium text-gray-300 mb-1" : "block text-sm font-medium text-gray-700 mb-1";
  const input = dark
    ? "w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
    : "w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
  const rowBox = dark ? "border-white/15" : "border-gray-300";
  const primary = "flex w-full items-center justify-center gap-2 rounded py-3 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50";

  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const setVal = (id: string, v: string | boolean) => setValues((p) => ({ ...p, [id]: v }));

  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/public/estimate/${companySlug}/${toolSlug}/calc${preview ? "?preview=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: values }),
      });
      const data = (await res.json().catch(() => null)) as (Calc & { error?: string; errors?: string[] }) | null;
      if (!res.ok || !data || !("estimate" in data)) {
        setError(data?.errors?.join(" · ") ?? data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setEstimate(data.estimate);
      setStep("details");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/public/estimate/${companySlug}/${toolSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: values, ...form, smsConsent, captchaToken, website: honeypot, elapsedMs: Date.now() - startedAt }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; estimate?: PublicEstimate; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setFinalEstimate(data?.estimate ?? estimate);
      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const header = showHeader && (
    <div className="pb-1">
      <h2 className={`text-lg font-bold ${ink}`}>{heading}</h2>
      {intro && <p className={`mt-0.5 text-sm ${muted}`}>{intro}</p>}
    </div>
  );
  const errorBox = error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;

  function EstimatePanel({ e, compact = false }: { e: PublicEstimate; compact?: boolean }) {
    if (e.mode === "hidden") return null;
    const total = estimateLabel(e);
    return (
      <div className={`rounded-lg border ${rowBox} overflow-hidden`}>
        <div className="px-4 py-4 text-center" style={{ backgroundColor: `${accent}14` }}>
          <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>{e.mode === "range" ? "Estimated range" : "Your estimate"}</p>
          <p className={`numeral mt-1 text-3xl font-bold ${ink}`}>{total}</p>
          {e.title && <p className={`mt-1 text-sm ${muted}`}>{e.title}</p>}
        </div>
        {e.mode === "exact" && !compact && (
          <div className={`divide-y ${dark ? "divide-white/10" : "divide-gray-100"}`}>
            {e.lines.map((l, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${ink}`}>
                    {l.name}
                    {l.isOptional && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${dark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}>optional</span>}
                  </p>
                  {l.description && <p className={`text-xs ${muted}`}>{l.description}</p>}
                  {l.quantity !== 1 && (
                    <p className={`text-xs ${muted}`}>
                      {l.quantity} × {money(l.unitPrice)}
                    </p>
                  )}
                </div>
                <p className={`numeral shrink-0 text-sm font-semibold ${ink}`}>{money(l.total)}</p>
              </div>
            ))}
          </div>
        )}
        {config.disclaimer && <p className={`px-4 py-3 text-xs ${muted} ${dark ? "border-t border-white/10" : "border-t border-gray-100"}`}>{config.disclaimer}</p>}
      </div>
    );
  }

  // ── done ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    const shown = finalEstimate && finalEstimate.mode !== "hidden" ? finalEstimate : null;
    return (
      <div className={`${card} space-y-5 py-8 text-center`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22` }}>
          <CheckCircle size={28} style={{ color: accent }} />
        </div>
        <div>
          <h2 className={`mb-2 text-xl font-bold ${ink}`}>{config.onSubmit === "send" ? "Your quote is on its way" : "Request received"}</h2>
          <p className={`text-sm ${muted}`}>{defaultSuccessMessage(config, businessName)}</p>
        </div>
        {shown && (
          <div className="text-left">
            <EstimatePanel e={shown} />
          </div>
        )}
      </div>
    );
  }

  // ── step 1: the tool's questions ───────────────────────────────────────────
  if (step === "inputs") {
    return (
      <form onSubmit={calculate} className={`${card} space-y-4`}>
        {header}
        {errorBox}
        {inputs.map((inp) => {
          const v = values[inp.id];
          const required = "required" in inp && inp.required !== false;
          if (inp.type === "toggle") {
            return (
              <label key={inp.id} className={`flex items-center justify-between gap-3 rounded border px-3 py-2.5 ${rowBox}`}>
                <span>
                  <span className={`block text-sm font-medium ${ink}`}>{inp.label}</span>
                  {inp.help && <span className={`block text-xs ${muted}`}>{inp.help}</span>}
                </span>
                <input type="checkbox" checked={v === true} onChange={(e) => setVal(inp.id, e.target.checked)} className="h-5 w-5 shrink-0 rounded" style={{ accentColor: accent }} />
              </label>
            );
          }
          return (
            <div key={inp.id}>
              <label className={label}>
                {inp.label}
                {required ? " *" : ""}
              </label>
              {inp.type === "number" && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={typeof v === "string" ? v : ""}
                    min={inp.min}
                    max={inp.max}
                    step={inp.step ?? "any"}
                    required={required}
                    onChange={(e) => setVal(inp.id, e.target.value)}
                    className={input}
                  />
                  {inp.unit && <span className={`shrink-0 text-sm ${muted}`}>{inp.unit}</span>}
                </div>
              )}
              {inp.type === "select" && (
                <select value={typeof v === "string" ? v : ""} required={required} onChange={(e) => setVal(inp.id, e.target.value)} className={`${input} ${dark ? "[&>option]:text-gray-900" : ""}`}>
                  <option value="">Select...</option>
                  {inp.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {inp.type === "text" && (
                <textarea value={typeof v === "string" ? v : ""} rows={2} placeholder={inp.placeholder} required={required} maxLength={500} onChange={(e) => setVal(inp.id, e.target.value)} className={`${input} resize-none`} />
              )}
              {inp.help && <p className={`mt-1 text-xs ${muted}`}>{inp.help}</p>}
            </div>
          );
        })}
        <button type="submit" disabled={loading} className={primary} style={{ backgroundColor: accent, color: textOn(accent) }}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          {instant ? buttonLabel : "Continue"}
        </button>
      </form>
    );
  }

  // ── step 2: the estimate (instant) + contact details ───────────────────────
  const askPhone = f.phone.show;
  return (
    <form onSubmit={submit} className={`${card} relative space-y-4`}>
      {header}
      <button type="button" onClick={() => setStep("inputs")} className={`inline-flex items-center gap-1 text-xs font-medium ${muted} hover:underline`}>
        <ArrowLeft size={13} /> Change my answers
      </button>
      {instant && estimate && <EstimatePanel e={estimate} />}
      <div>
        <h3 className={`text-base font-semibold ${ink}`}>
          {instant ? (config.onSubmit === "send" ? "Want this quote? We'll email it to you." : "Want this quote? Leave your details.") : config.showPrice === "hidden" ? "Where should we send your quote?" : "Almost there — where should we send your estimate?"}
        </h3>
      </div>
      {errorBox}
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
      {(f.email.show || askPhone) && (
        <div className="grid grid-cols-2 gap-4">
          {f.email.show && (
            <div className={askPhone ? "" : "col-span-2"}>
              <label className={label}>Email{f.email.required || config.onSubmit === "send" ? " *" : ""}</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required={f.email.required || config.onSubmit === "send"} autoComplete="email" className={input} />
            </div>
          )}
          {askPhone && (
            <div className={f.email.show ? "" : "col-span-2"}>
              <label className={label}>Phone{f.phone.required ? " *" : ""}</label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required={f.phone.required} autoComplete="tel" className={input} />
            </div>
          )}
        </div>
      )}
      {askPhone && (
        <label className={`flex items-start gap-2.5 text-[13px] leading-snug ${dark ? "text-gray-300" : "text-gray-600"}`}>
          <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ accentColor: accent }} />
          <span>
            {smsConsentLabel(businessName || "this business")}{" "}
            <a href={SMS_TERMS_URL} target="_blank" rel="noreferrer" className="underline">
              Text terms
            </a>
          </span>
        </label>
      )}
      {f.address.show && (
        <div>
          <label className={label}>Service address{f.address.required ? " *" : ""}</label>
          <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} required={f.address.required} placeholder="123 Main St, Dallas, TX 75201" autoComplete="street-address" className={input} />
        </div>
      )}
      {f.message.show && (
        <div>
          <label className={label}>
            {f.message.label}
            {f.message.required ? " *" : ""}
          </label>
          <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={3} required={f.message.required} className={`${input} resize-none`} />
        </div>
      )}
      {!preview && <TurnstileWidget onToken={setCaptchaToken} action="booking" />}
      <button type="submit" disabled={loading || preview} className={primary} style={{ backgroundColor: accent, color: textOn(accent) }}>
        {loading && <Loader2 size={14} className="animate-spin" />}
        {instant ? (config.onSubmit === "send" ? "Email me this quote" : "Send my request") : buttonLabel}
      </button>
      {!instant && config.showPrice !== "hidden" && <p className={`text-center text-xs ${muted}`}>Your estimate appears right after you send this.</p>}
      {preview && (
        <p className={`text-center text-xs ${muted}`}>
          Preview only.{" "}
          <Link href="/app/settings/estimators" className="underline">
            Back to estimate tools
          </Link>
        </p>
      )}
    </form>
  );
}
