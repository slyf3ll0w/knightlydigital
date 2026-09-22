"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Camera, Check, CheckCircle, Loader2, X } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import { smsConsentLabel, SMS_TERMS_URL } from "@/lib/sms-consent";
import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import { sectionsOf, visibleInputIds, formDefaults, inputsComplete, type EstimatorInput, type EstimatorSpec } from "@/lib/estimator";
import { defaultSuccessMessage, estimateLabel, type EstimatorPublicConfig, type PublicEstimate, type PublicVariant } from "@/lib/estimator-public";
import { Breakdown, ChoiceControl, MultiControl, NumberControl, PriceHero, StepRail, ToggleRow, pickedIncludes, publicTheme, wash } from "@/components/EstimatorControls";
import { fileToAssistPhoto, type AssistPhoto } from "@/lib/image-downscale";
import type { LatLngTuple } from "@/components/MapMeasure";

const MapMeasure = dynamic(() => import("@/components/MapMeasure"), { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-lg bg-black/5" /> });

/**
 * The visitor-facing estimate form (lib/estimator-public.ts). Screens:
 *   1. the tool's questions — one step per section when the tool has
 *      sections (a numbered step rail), questions appearing/disappearing
 *      per showWhen, package tiers priced live — then "See my estimate"
 *      (server does the math)
 *   2. the estimate (a big number + a quote-shaped breakdown, a range, or
 *      nothing — the owner's call) + the contact details → submit → thank-you.
 * Forms set to reveal the price after contact details show it on the
 * thank-you screen instead. When the owner turned photo fill-in on, the first
 * step offers "snap a photo" and Atlas fills in the answers (the owner's
 * tokens, capped). Same themed recipe as the booking forms so an estimate
 * form and a booking form on one website read as one family; the controls
 * themselves are shared with the in-app runner (components/EstimatorControls).
 */

type Calc = { ok: true; estimate: PublicEstimate };
type FormValues = Record<string, string | boolean | string[]>;

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
  photoAssist = false,
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
  /** The owner opted into photo fill-in and the tool supports it */
  photoAssist?: boolean;
}) {
  const { dark, accent, transparent } = appearance;
  const f = config.fields;
  const instant = config.reveal === "instant" && config.showPrice !== "hidden";
  const theme = useMemo(() => publicTheme(dark, accent), [dark, accent]);
  // visibleInputIds wants a spec; the form only ever holds the inputs
  const spec = useMemo<EstimatorSpec>(() => ({ version: 1, inputs, variables: [], lines: [] }), [inputs]);

  const [step, setStep] = useState<"inputs" | "details" | "done">("inputs");
  const [values, setValues] = useState<FormValues>(() => formDefaults(spec));
  const visible = useMemo(() => visibleInputIds(spec, values), [spec, values]);
  const sections = useMemo(() => sectionsOf(inputs, visible), [inputs, visible]);
  const [sectionIdx, setSectionIdx] = useState(0);
  useEffect(() => {
    if (sectionIdx > sections.length - 1) setSectionIdx(Math.max(0, sections.length - 1));
  }, [sections.length, sectionIdx]);

  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [finalEstimate, setFinalEstimate] = useState<PublicEstimate | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", message: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [startedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // map questions keep their drawn corners here; the form value is just the number
  const geomRef = useRef<Record<string, LatLngTuple[]>>({});

  // photo fill-in
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<AssistPhoto | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [usedPhoto, setUsedPhoto] = useState(false);

  // where the lead came from: the embedding page (snippet replies with its href) or the referrer
  const [page, setPage] = useState("");
  useEffect(() => {
    try {
      if (document.referrer && /^https?:\/\//.test(document.referrer)) setPage(document.referrer.slice(0, 300));
    } catch {
      /* ignore */
    }
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; href?: string } | null;
      if (d && d.type === "jobflow:page" && typeof d.href === "string" && /^https?:\/\//.test(d.href)) setPage(d.href.slice(0, 300));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const apiBase = `/api/public/estimate/${companySlug}/${toolSlug}`;
  const previewQs = preview ? "?preview=1" : "";

  // Package tiers priced live: the first visible package question, once
  // everything else it needs is answered (the visitor may not have picked yet).
  const packageInput = useMemo(() => inputs.find((i) => i.type === "select" && i.style === "packages" && visible.has(i.id)) ?? null, [inputs, visible]);
  const [tierPrices, setTierPrices] = useState<Record<string, string | null> | undefined>(undefined);
  useEffect(() => {
    if (!packageInput || packageInput.type !== "select" || config.showPrice === "hidden" || config.reveal !== "instant") {
      setTierPrices(undefined);
      return;
    }
    const ignore = new Set([packageInput.id]);
    if (!inputsComplete(spec, values, ignore)) {
      setTierPrices(undefined);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/calc${previewQs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: values, variants: { input: packageInput.id, values: packageInput.options.map((o) => o.value) } }),
        });
        const data = (await res.json().catch(() => null)) as { variants?: Record<string, PublicVariant> } | null;
        if (cancelled || !data?.variants) return;
        const out: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(data.variants)) out[k] = v ? v.label : null;
        setTierPrices(out);
      } catch {
        /* the tiers just show no price */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [packageInput, values, spec, apiBase, previewQs, config.showPrice, config.reveal]);

  const card = transparent ? "bg-transparent" : dark ? "bg-[#101410] border border-white/10 rounded-lg p-6 shadow-sm" : "card-ledger p-6 shadow-sm";
  const ink = theme.ink;
  const muted = theme.faint;
  const label = dark ? "block text-sm font-medium text-gray-300 mb-1.5" : "block text-sm font-medium text-gray-700 mb-1.5";
  const input = theme.input;
  const rowBox = theme.border;
  const primary = "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50";
  const secondary = `inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-3 text-sm font-medium ${rowBox} ${ink} hover:opacity-80`;

  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const setVal = (id: string, v: string | boolean | string[]) => setValues((p) => ({ ...p, [id]: v }));
  const toggleMulti = (id: string, value: string) =>
    setValues((p) => {
      const cur = Array.isArray(p[id]) ? (p[id] as string[]) : [];
      return { ...p, [id]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });

  async function calculate() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/calc${previewQs}`, {
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

  function nextOrCalculate(e: React.FormEvent) {
    e.preventDefault();
    if (sectionIdx < sections.length - 1) {
      setSectionIdx(sectionIdx + 1);
      return;
    }
    void calculate();
  }

  async function fillFromPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    setPhotoNote("");
    setPhotoBusy(true);
    try {
      const p = await fileToAssistPhoto(file);
      if (!p) {
        setError("That photo couldn't be read — try a JPEG or PNG.");
        return;
      }
      setPhoto(p);
      const res = await fetch(`${apiBase}/assist${previewQs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: p.base64, imageMime: p.mime }),
      });
      const data = (await res.json().catch(() => null)) as { values?: Record<string, unknown>; notes?: string; error?: string } | null;
      if (!res.ok || !data?.values) {
        setPhotoNote(data?.error ?? "We couldn't read that photo — please answer the questions below.");
        return;
      }
      const filled = data.values;
      const n = Object.keys(filled).length;
      setValues((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(filled)) next[k] = typeof v === "boolean" ? v : Array.isArray(v) ? v.map(String) : String(v);
        return next;
      });
      setUsedPhoto(n > 0);
      setPhotoNote(n === 0 ? "We couldn't tell much from that photo — please answer below." : `We filled in ${n} answer${n === 1 ? "" : "s"} from your photo — please check them.${data.notes ? ` ${data.notes}` : ""}`);
    } catch {
      setPhotoNote("We couldn't read that photo — please answer the questions below.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: values, ...form, smsConsent, captchaToken, website: honeypot, elapsedMs: Date.now() - startedAt, page, usedPhoto }),
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
  const errorBox = error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;

  function EstimatePanel({ e, compact = false }: { e: PublicEstimate; compact?: boolean }) {
    if (e.mode === "hidden") return null;
    const included = pickedIncludes(inputs, values);
    return (
      <div className="space-y-3">
        {e.mode === "range" ? (
          <PriceHero theme={theme} label="Estimated range" text={estimateLabel(e)} sub={e.title} />
        ) : (
          <PriceHero theme={theme} label="Your estimate" amount={e.subtotal} sub={e.title} />
        )}
        {included && !compact && (
          <div className={`rounded-xl border p-4 ${rowBox}`}>
            <p className={`text-xs font-semibold ${muted}`}>{included.tier} includes</p>
            <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {included.includes.map((line) => (
                <li key={line} className={`flex items-start gap-1.5 text-sm ${theme.muted}`}>
                  <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" style={{ color: accent }} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
        {e.mode === "exact" && !compact && <Breakdown theme={theme} lines={e.lines} subtotal={e.subtotal} />}
        {config.disclaimer && <p className={`text-xs ${muted}`}>{config.disclaimer}</p>}
      </div>
    );
  }

  // ── done ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    const shown = finalEstimate && finalEstimate.mode !== "hidden" ? finalEstimate : null;
    return (
      <div className={`${card} space-y-5 py-8 text-center`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: wash(theme, 16) }}>
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

  // ── step 1: the tool's questions (one section per screen) ──────────────────
  if (step === "inputs") {
    const current = sections[sectionIdx] ?? { title: null, inputs: [] };
    const multiStep = sections.length > 1;
    const last = sectionIdx >= sections.length - 1;
    return (
      <form onSubmit={nextOrCalculate} className={`${card} space-y-5`}>
        {header}
        {errorBox}

        {photoAssist && sectionIdx === 0 && (
          <div className={`rounded-xl border border-dashed p-3 ${rowBox}`}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void fillFromPhoto(e.target.files?.[0])} />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${ink}`}>Have a photo of the job?</p>
                <p className={`text-xs ${muted}`}>Snap one and we&apos;ll fill in the answers for you.</p>
              </div>
              {photo ? (
                <span className={`flex shrink-0 items-center gap-1.5 rounded-lg border py-0.5 pl-0.5 pr-1.5 text-[11px] ${rowBox} ${muted}`}>
                  <img src={photo.previewUrl} alt="" className="h-7 w-7 rounded object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoNote("");
                    }}
                    aria-label="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </span>
              ) : (
                <button type="button" disabled={photoBusy} onClick={() => fileRef.current?.click()} className={`${secondary} shrink-0 py-2`}>
                  {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  Add photo
                </button>
              )}
            </div>
            {photoBusy && <p className={`mt-2 text-xs ${muted}`}>Reading your photo…</p>}
            {photoNote && !photoBusy && <p className={`mt-2 text-xs ${muted}`}>{photoNote}</p>}
          </div>
        )}

        {multiStep && <StepRail theme={theme} titles={sections.map((s) => s.title)} idx={sectionIdx} />}
        {current.title && <h3 className={`text-base font-semibold ${ink}`}>{current.title}</h3>}

        {current.inputs.map((inp) => {
          const v = values[inp.id];
          const required = "required" in inp && inp.required !== false;
          if (inp.type === "toggle") return <ToggleRow key={inp.id} theme={theme} label={inp.label} help={inp.help} value={v === true} onChange={(b) => setVal(inp.id, b)} />;
          return (
            <div key={inp.id}>
              {inp.image && <img src={inp.image} alt="" className="mb-2 max-h-48 w-full rounded-lg object-cover" />}
              <label className={label}>
                {inp.label}
                {required ? " *" : ""}
              </label>
              {inp.type === "map" && (
                <>
                  <MapMeasure
                    measure={inp.measure}
                    points={geomRef.current[inp.id] ?? []}
                    accent={accent}
                    dark={dark}
                    onChange={(pts, val) => {
                      geomRef.current[inp.id] = pts;
                      setVal(inp.id, val === null ? "" : String(val));
                    }}
                  />
                  {/* the browser's required check needs a real field */}
                  <input type="text" value={typeof v === "string" ? v : ""} required={required} readOnly tabIndex={-1} aria-hidden className="sr-only" onChange={() => undefined} />
                </>
              )}
              {inp.type === "number" && <NumberControl inp={inp} theme={theme} value={typeof v === "string" ? v : ""} required={required} onChange={(val) => setVal(inp.id, val)} />}
              {inp.type === "select" && (
                <>
                  <ChoiceControl inp={inp} theme={theme} value={typeof v === "string" ? v : ""} required={required} onChange={(val) => setVal(inp.id, val)} tierPrices={inp.style === "packages" && packageInput?.id === inp.id ? tierPrices : undefined} />
                  {(inp.style === "cards" || inp.style === "packages" || inp.options.some((o) => o.image)) && (
                    <input type="text" value={typeof v === "string" ? v : ""} required={required} readOnly tabIndex={-1} aria-hidden className="sr-only" onChange={() => undefined} />
                  )}
                </>
              )}
              {inp.type === "multi" && (
                <>
                  <MultiControl inp={inp} theme={theme} value={Array.isArray(v) ? v : []} onToggle={(val) => toggleMulti(inp.id, val)} />
                  {required && Array.isArray(v) && v.length === 0 && <p className={`mt-1 text-xs ${muted}`}>Pick at least one</p>}
                </>
              )}
              {inp.type === "text" && (
                <textarea value={typeof v === "string" ? v : ""} rows={2} placeholder={inp.placeholder} required={required} maxLength={500} onChange={(e) => setVal(inp.id, e.target.value)} className={`${input} resize-none`} />
              )}
              {inp.help && <p className={`mt-1.5 text-xs ${muted}`}>{inp.help}</p>}
            </div>
          );
        })}

        <div className="flex gap-2">
          {multiStep && sectionIdx > 0 && (
            <button type="button" onClick={() => setSectionIdx(sectionIdx - 1)} className={secondary} aria-label="Back">
              <ArrowLeft size={14} />
            </button>
          )}
          <button type="submit" disabled={loading} className={primary} style={{ backgroundColor: accent, color: textOn(accent) }}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {!last ? "Next" : instant ? buttonLabel : "Continue"}
          </button>
        </div>
      </form>
    );
  }

  // ── step 2: the estimate (instant) + contact details ───────────────────────
  const askPhone = f.phone.show;
  return (
    <form onSubmit={submit} className={`${card} relative space-y-4`}>
      {header}
      <button
        type="button"
        onClick={() => {
          setStep("inputs");
          setSectionIdx(0);
        }}
        className={`inline-flex items-center gap-1 text-xs font-medium ${muted} hover:underline`}
      >
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
          <Link href="/app/estimates" className="underline">
            Back to Estimates
          </Link>
        </p>
      )}
    </form>
  );
}
