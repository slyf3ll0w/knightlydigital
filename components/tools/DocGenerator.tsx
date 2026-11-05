"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import DocPreview from "@/components/tools/DocPreview";
import { trackSiteEvent } from "@/lib/site-track";
import {
  DEFAULT_ACCENT,
  MAX_LINES,
  MAX_LOGO_BYTES,
  addDaysIso,
  docReady,
  docTotals,
  money,
  newLine,
  sanitizeToolDoc,
  type ToolDoc,
  type ToolLine,
  type ToolParty,
} from "@/lib/tool-doc";

/**
 * The free invoice / estimate generator. Everything runs in the browser
 * until the visitor asks for the PDF (POST /api/public/tools/pdf, rendered
 * with the app's real document builder) or for an account ("Get paid
 * online": POST /api/public/tools/draft, then /apply?draft=<id>, and the
 * document is waiting in the new account). The draft autosaves to
 * localStorage per page so a reload never loses work. No email gate: the
 * download is the product; the account is the offer beside it.
 */

const ACCENTS = ["#0B57D8", "#F86A0A", "#15803D", "#7C3AED", "#0F172A"];

type Props = {
  initial: ToolDoc;
  /** localStorage key; one per page so a trade template keeps its own draft. */
  storageKey: string;
};

type Saved = { doc: ToolDoc; logo: string | null };

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { doc?: unknown; logo?: unknown };
    const doc = sanitizeToolDoc(parsed.doc);
    if (!doc) return null;
    const logo = typeof parsed.logo === "string" && parsed.logo.startsWith("data:image/") ? parsed.logo : null;
    return { doc, logo };
  } catch {
    return null;
  }
}

/** Shrinks an uploaded logo to a small PNG/JPEG data URL (react-pdf wants png/jpg; the draft caps bytes). */
async function logoToDataUrl(file: File): Promise<string | null> {
  if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/.test(file.type)) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("bad image"));
      el.src = url;
    });
    const max = 600;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // PNG keeps transparency; fall back to JPEG when the PNG is too big.
    let out = canvas.toDataURL("image/png");
    if (out.length > MAX_LOGO_BYTES * 1.3) out = canvas.toDataURL("image/jpeg", 0.85);
    return out.length > MAX_LOGO_BYTES * 1.37 ? null : out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function DocGenerator({ initial, storageKey }: Props) {
  const [doc, setDoc] = useState<ToolDoc>(initial);
  const [logo, setLogo] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEstimate = doc.kind === "estimate";
  const word = isEstimate ? "estimate" : "invoice";

  // Restore after mount (SSR renders the template; the saved draft wins).
  useEffect(() => {
    const saved = readSaved(storageKey);
    if (saved && saved.doc.kind === initial.kind) {
      setDoc(saved.doc);
      setLogo(saved.logo);
    }
    setRestored(true);
  }, [storageKey, initial.kind]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ doc, logo }));
    } catch {
      /* storage full or blocked: the page still works */
    }
  }, [doc, logo, restored, storageKey]);

  const totals = useMemo(() => docTotals(doc), [doc]);
  const ready = docReady(doc);

  const patch = useCallback((p: Partial<ToolDoc>) => setDoc((d) => ({ ...d, ...p })), []);
  const patchParty = useCallback((who: "business" | "client", p: Partial<ToolParty>) => setDoc((d) => ({ ...d, [who]: { ...d[who], ...p } })), []);
  const patchLine = useCallback((id: string, p: Partial<ToolLine>) => setDoc((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) })), []);
  const removeLine = useCallback((id: string) => setDoc((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((l) => l.id !== id) : [newLine()] })), []);
  const addLine = useCallback(() => setDoc((d) => (d.lines.length >= MAX_LINES ? d : { ...d, lines: [...d.lines, newLine()] })), []);

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    const url = await logoToDataUrl(file);
    if (!url) {
      setError("That logo didn't work. Use a PNG or JPG under a few megabytes.");
      return;
    }
    setError("");
    setLogo(url);
  }

  function startOver() {
    setDoc(initial);
    setLogo(null);
    setDownloaded(false);
    setError("");
  }

  async function downloadPdf() {
    if (!ready.ok) {
      setError(ready.reason);
      return;
    }
    setError("");
    setBusy("pdf");
    try {
      const res = await fetch("/api/public/tools/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, logo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "The PDF didn't render. Try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${isEstimate ? "Estimate" : "Invoice"}-${doc.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDownloaded(true);
      trackSiteEvent("tool_pdf", doc.kind);
    } catch {
      setError("The PDF didn't render. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function getPaidOnline() {
    if (!ready.ok) {
      setError(ready.reason);
      return;
    }
    setError("");
    setBusy("draft");
    try {
      const res = await fetch("/api/public/tools/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, logo }),
      });
      const data = (await res.json().catch(() => ({}))) as { href?: string; error?: string };
      if (!res.ok || !data.href) {
        setError(data.error ?? "Something went wrong. Try again.");
        setBusy(null);
        return;
      }
      trackSiteEvent("tool_draft", doc.kind);
      window.location.href = data.href;
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setBusy(null);
    }
  }

  const sendLabel = isEstimate ? "Send it for e-signature" : "Get paid online";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      {/* ── Editor ── */}
      <div className="space-y-5">
        <Card title="Your business">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" value={doc.business.name} onChange={(v) => patchParty("business", { name: v })} autoComplete="organization" required />
            <Field label="Email" value={doc.business.email} onChange={(v) => patchParty("business", { email: v })} type="email" autoComplete="email" />
            <Field label="Phone" value={doc.business.phone} onChange={(v) => patchParty("business", { phone: v })} type="tel" autoComplete="tel" />
            <Field label="Street address" value={doc.business.address} onChange={(v) => patchParty("business", { address: v })} autoComplete="street-address" />
            <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-3 sm:col-span-2">
              <Field label="City" value={doc.business.city} onChange={(v) => patchParty("business", { city: v })} />
              <Field label="State" value={doc.business.state} onChange={(v) => patchParty("business", { state: v })} />
              <Field label="ZIP" value={doc.business.zip} onChange={(v) => patchParty("business", { zip: v })} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onLogoFile(e.target.files?.[0])} />
              {logo ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="Your logo" className="h-10 w-auto max-w-[120px] rounded border border-gray-200 bg-white object-contain p-1" />
                  <button type="button" onClick={() => setLogo(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Remove logo">
                    <X className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-3.5 py-2 text-[13.5px] font-semibold text-gray-700 hover:border-gray-900">
                  <ImagePlus className="h-4 w-4" strokeWidth={2} />
                  Add your logo
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-gray-500">Color</span>
              {ACCENTS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => patch({ accent: hex })}
                  aria-label={`Accent ${hex}`}
                  aria-pressed={doc.accent === hex}
                  className={`h-6 w-6 rounded-full border-2 ${doc.accent === hex ? "border-gray-900" : "border-white shadow"}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 border-white bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] shadow" title="Pick any color">
                <input type="color" value={doc.accent || DEFAULT_ACCENT} onChange={(e) => patch({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom accent color" />
              </label>
            </div>
          </div>
        </Card>

        <Card title={isEstimate ? "Prepared for" : "Bill to"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client name" value={doc.client.name} onChange={(v) => patchParty("client", { name: v })} />
            <Field label="Email" value={doc.client.email} onChange={(v) => patchParty("client", { email: v })} type="email" />
            <Field label="Phone" value={doc.client.phone} onChange={(v) => patchParty("client", { phone: v })} type="tel" />
            <Field label="Street address" value={doc.client.address} onChange={(v) => patchParty("client", { address: v })} />
            <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-3 sm:col-span-2">
              <Field label="City" value={doc.client.city} onChange={(v) => patchParty("client", { city: v })} />
              <Field label="State" value={doc.client.state} onChange={(v) => patchParty("client", { state: v })} />
              <Field label="ZIP" value={doc.client.zip} onChange={(v) => patchParty("client", { zip: v })} />
            </div>
          </div>
        </Card>

        <Card title="Details">
          <div className="grid grid-cols-3 gap-3">
            <Field label={`${isEstimate ? "Estimate" : "Invoice"} #`} value={String(doc.number)} onChange={(v) => patch({ number: Math.max(1, Math.min(99_999_999, Math.round(Number(v) || 0))) })} type="number" inputMode="numeric" />
            <Field label="Date" value={doc.issuedAt} onChange={(v) => patch({ issuedAt: v, dueAt: doc.dueAt && v ? addDaysIso(v, isEstimate ? 30 : 14) : doc.dueAt })} type="date" />
            <Field label={isEstimate ? "Valid through" : "Due date"} value={doc.dueAt} onChange={(v) => patch({ dueAt: v })} type="date" />
          </div>
        </Card>

        <Card title="Line items">
          <div className="space-y-3">
            {doc.lines.map((l, i) => (
              <div key={l.id} className="rounded-xl border border-gray-200 p-3">
                <div className="grid grid-cols-[76px_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_72px_104px_auto]">
                  <input
                    value={l.name}
                    onChange={(e) => patchLine(l.id, { name: e.target.value })}
                    placeholder={i === 0 ? "What you did, e.g. Water heater replacement" : "Item"}
                    className={`${INPUT} col-span-3 sm:col-span-1`}
                    aria-label={`Line ${i + 1} name`}
                  />
                  <span className="-mb-1.5 text-[11px] font-bold text-gray-500 sm:hidden">Qty</span>
                  <span className="-mb-1.5 text-[11px] font-bold text-gray-500 sm:hidden">Price</span>
                  <span className="sm:hidden" aria-hidden />
                  <input value={l.quantity} onChange={(e) => patchLine(l.id, { quantity: Math.max(0, Number(e.target.value) || 0) })} type="number" inputMode="decimal" min={0} step="1" className={`${INPUT} text-right`} aria-label={`Line ${i + 1} quantity`} />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-gray-400">$</span>
                    <input value={l.unitPrice} onChange={(e) => patchLine(l.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} type="number" inputMode="decimal" min={0} step="0.01" className={`${INPUT} pl-6 text-right`} aria-label={`Line ${i + 1} unit price`} />
                  </div>
                  <button type="button" onClick={() => removeLine(l.id)} className="inline-flex h-10 w-10 items-center justify-center self-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Remove line ${i + 1}`}>
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <input value={l.description} onChange={(e) => patchLine(l.id, { description: e.target.value })} placeholder="Description (optional)" className={`${INPUT} min-w-[200px] flex-1 text-[13px]`} aria-label={`Line ${i + 1} description`} />
                  {isEstimate && (
                    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-gray-600">
                      <input type="checkbox" checked={l.optional} onChange={(e) => patchLine(l.id, { optional: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                      Optional for the client
                    </label>
                  )}
                  <span className="ml-auto text-[13px] font-bold tabular-nums text-gray-700">{money(Math.round(l.quantity * l.unitPrice * 100) / 100)}</span>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLine} disabled={doc.lines.length >= MAX_LINES} className="mt-3 inline-flex items-center gap-2 rounded-full border border-gray-300 px-3.5 py-2 text-[13.5px] font-semibold text-gray-700 hover:border-gray-900 disabled:opacity-50">
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            Add a line
          </button>
        </Card>

        <Card title="Tax, discount and message">
          <div className={`grid gap-3 ${isEstimate ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Field label="Sales tax %" value={String(doc.taxRate)} onChange={(v) => patch({ taxRate: Math.max(0, Math.min(30, Number(v) || 0)) })} type="number" inputMode="decimal" step="0.01" />
            <div>
              <span className={LABEL}>Discount</span>
              <div className="flex gap-2">
                <select value={doc.discountType} onChange={(e) => patch({ discountType: e.target.value as ToolDoc["discountType"], discountValue: 0 })} className={`${INPUT} w-auto`} aria-label="Discount type">
                  <option value="NONE">None</option>
                  <option value="PERCENT">Percent</option>
                  <option value="FIXED">Amount</option>
                </select>
                {doc.discountType !== "NONE" && (
                  <input value={doc.discountValue} onChange={(e) => patch({ discountValue: Math.max(0, Number(e.target.value) || 0) })} type="number" inputMode="decimal" min={0} className={`${INPUT} text-right`} aria-label="Discount value" />
                )}
              </div>
            </div>
            {isEstimate && (
              <div>
                <span className={LABEL}>Deposit</span>
                <div className="flex gap-2">
                  <select value={doc.depositType} onChange={(e) => patch({ depositType: e.target.value as ToolDoc["depositType"], depositValue: 0 })} className={`${INPUT} w-auto`} aria-label="Deposit type">
                    <option value="NONE">None</option>
                    <option value="PERCENT">Percent</option>
                    <option value="FIXED">Amount</option>
                  </select>
                  {doc.depositType !== "NONE" && (
                    <input value={doc.depositValue} onChange={(e) => patch({ depositValue: Math.max(0, Number(e.target.value) || 0) })} type="number" inputMode="decimal" min={0} className={`${INPUT} text-right`} aria-label="Deposit value" />
                  )}
                </div>
              </div>
            )}
          </div>
          <label className="mt-3 block">
            <span className={LABEL}>Message to the client</span>
            <textarea value={doc.clientMessage} onChange={(e) => patch({ clientMessage: e.target.value })} rows={3} maxLength={1000} className={`${INPUT} min-h-[84px] resize-y`} />
          </label>
        </Card>

        <div className="flex items-center justify-between text-[13px] text-gray-500">
          <button type="button" onClick={startOver} className="font-semibold text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline">
            Start over
          </button>
          <span>Saved in this browser as you type.</span>
        </div>
      </div>

      {/* ── Preview + actions ── */}
      <div className="lg:sticky lg:top-28">
        <DocPreview doc={doc} logo={logo} />
        <div className="mt-4 rounded-2xl border border-gray-200 bg-[#F6F8FB] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-bold text-gray-500">Total</span>
            <span className="text-[22px] font-extrabold tabular-nums text-gray-900">{money(totals.total)}</span>
          </div>
          {error && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" onClick={() => void downloadPdf()} disabled={busy !== null} data-wb-event={`tool_download_${doc.kind}`} className="wb-pill wb-pill-primary flex-1 justify-center disabled:opacity-60">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" strokeWidth={2.5} />}
              Download PDF
            </button>
            <button type="button" onClick={() => void getPaidOnline()} disabled={busy !== null} data-wb-event={`tool_signup_${doc.kind}`} className="wb-pill wb-pill-orange flex-1 justify-center disabled:opacity-60">
              {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" strokeWidth={2.5} />}
              {sendLabel}
            </button>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-gray-500">
            The PDF is free, with no watermark and no sign-up.{" "}
            <strong className="font-semibold text-gray-700">{sendLabel}</strong> opens a free WorkBench account with this {word} already in it, so
            {isEstimate ? " the client can approve and sign it on their phone" : " the client can pay it by card or bank transfer from a link"}.
          </p>
        </div>

        {downloaded && (
          <div className="mt-4 rounded-2xl border border-[#0B57D8]/20 bg-blue-50/60 p-4">
            <p className="text-[14.5px] font-bold text-gray-900">Your {word} is downloaded.</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-gray-600">
              {isEstimate
                ? "Want the client to approve it with a tap and pay a deposit? Open a free WorkBench account and this estimate is waiting in it, logo and all."
                : "Want the client to pay it by card or bank from a link, with reminders that go out on their own? Open a free WorkBench account and this invoice is waiting in it, logo and all."}
            </p>
            <button type="button" onClick={() => void getPaidOnline()} disabled={busy !== null} data-wb-event={`tool_signup_after_${doc.kind}`} className="mt-3 inline-flex items-center gap-2 text-[14px] font-bold text-[#0B57D8] hover:underline">
              Open a free account with this {word}
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const INPUT = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#0B57D8] focus:ring-2 focus:ring-[#0B57D8]/15";
const LABEL = "mb-1 block text-[12.5px] font-bold text-gray-600";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-[15px] font-extrabold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  required,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "numeric" | "decimal" | "text" | "tel" | "email";
  autoComplete?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>
        {label}
        {required && <span className="text-[#F86A0A]"> *</span>}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} inputMode={inputMode} autoComplete={autoComplete} step={step} className={INPUT} />
    </label>
  );
}
