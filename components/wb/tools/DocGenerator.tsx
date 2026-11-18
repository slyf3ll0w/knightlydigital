"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Download, Eye, ImagePlus, Loader2, Send, X } from "lucide-react";
import DocPreview from "@/components/wb/tools/DocPreview";
import EmailPanel, { type EmailSession } from "@/components/wb/tools/EmailPanel";
import LineItemsEditor, { type EditorLineItem, emptyEditorLine, newLineKey } from "@/components/LineItemsEditor";
import MoreDetails from "@/components/MoreDetails";
import { dsBrandVars } from "@/lib/ds-theme";
import { trackSiteEvent } from "@/lib/site-track";
import {
  DEFAULT_ACCENT,
  MAX_LINES,
  MAX_LOGO_BYTES,
  addDaysIso,
  docReady,
  docTotals,
  money,
  sanitizeToolDoc,
  type ToolDoc,
  type ToolLine,
  type ToolParty,
} from "@/lib/tool-doc";

/**
 * The free invoice / estimate builder (/tools/*, and "Make a quote" in the
 * home page's Try-it section), redesigned 2026-11-18 to BE the app's quote
 * screen: the app's cards, inputs and buttons (.app-ui .ds), the app's own
 * line-item editor (components/LineItemsEditor) and More details fold, the
 * app's totals block. What it does is unchanged: everything runs in the
 * browser until the visitor downloads the PDF (POST /api/public/tools/pdf),
 * emails it to their client (EmailPanel → lib/tool-send.ts, from a verified
 * address, with "opened" tracking), or opens a free account with it (POST
 * /api/public/tools/draft → /apply?draft=<id>). The draft autosaves to
 * localStorage per page. The document itself shows on "Preview".
 * Lines start empty (David 2026-11-18: no prefilled line items, trade pages
 * included).
 */

const ACCENTS = ["#0B57D8", "#F86A0A", "#15803D", "#7C3AED", "#0F172A"];

type Props = {
  initial: ToolDoc;
  /** localStorage key; one per page so each page keeps its own draft. */
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
    let out = canvas.toDataURL("image/png");
    if (out.length > MAX_LOGO_BYTES * 1.3) out = canvas.toDataURL("image/jpeg", 0.85);
    return out.length > MAX_LOGO_BYTES * 1.37 ? null : out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The document's lines ↔ the app editor's rows (strings while typing). */
function toRows(lines: ToolLine[]): EditorLineItem[] {
  const rows = lines.map((l) => ({
    ...emptyEditorLine,
    _key: l.id || newLineKey(),
    name: l.name,
    description: l.description,
    quantity: String(l.quantity || 1),
    unitPrice: l.unitPrice ? String(l.unitPrice) : "",
    isOptional: l.optional,
  }));
  return rows.length ? rows : [{ ...emptyEditorLine, _key: newLineKey() }];
}
function toLines(rows: EditorLineItem[]): ToolLine[] {
  return rows.slice(0, MAX_LINES).map((r) => ({
    id: r._key || newLineKey(),
    name: r.name,
    description: r.description,
    quantity: Math.max(0, Math.round(Number(r.quantity) || 0)),
    unitPrice: Math.max(0, Number(r.unitPrice) || 0),
    optional: Boolean(r.isOptional),
  }));
}

const INPUT =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
const LABEL = "block text-sm font-medium text-gray-700 mb-1";

export default function DocGenerator({ initial, storageKey }: Props) {
  const [doc, setDoc] = useState<ToolDoc>(initial);
  const [rows, setRows] = useState<EditorLineItem[]>(() => toRows(initial.lines));
  const [logo, setLogo] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailSession, setEmailSession] = useState<EmailSession | null>(null);
  const [adjust, setAdjust] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEstimate = doc.kind === "estimate";
  const word = isEstimate ? "estimate" : "invoice";

  // The document as it stands: the fields plus the editor's rows.
  const full = useMemo<ToolDoc>(() => ({ ...doc, lines: toLines(rows) }), [doc, rows]);

  // Restore after mount (SSR renders the blank document; the saved draft wins).
  useEffect(() => {
    const saved = readSaved(storageKey);
    if (saved && saved.doc.kind === initial.kind) {
      setDoc(saved.doc);
      setRows(toRows(saved.doc.lines));
      setLogo(saved.logo);
      if (saved.doc.discountType !== "NONE" || saved.doc.depositType !== "NONE" || saved.doc.taxRate) setAdjust(true);
    }
    setRestored(true);
  }, [storageKey, initial.kind]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ doc: full, logo }));
    } catch {
      /* storage full or blocked: the page still works */
    }
  }, [full, logo, restored, storageKey]);

  // Whether emailing is on, and who this browser already verified as.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/tools/email/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: EmailSession | null) => {
        if (!cancelled && s) setEmailSession(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreviewOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const totals = useMemo(() => docTotals(full), [full]);
  const ready = docReady(full);

  const patch = useCallback((p: Partial<ToolDoc>) => setDoc((d) => ({ ...d, ...p })), []);
  const patchParty = useCallback((who: "business" | "client", p: Partial<ToolParty>) => setDoc((d) => ({ ...d, [who]: { ...d[who], ...p } })), []);

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
    setRows(toRows(initial.lines));
    setLogo(null);
    setDownloaded(false);
    setError("");
    setAdjust(false);
  }

  function check(): boolean {
    if (!ready.ok) {
      setError(ready.reason);
      return false;
    }
    setError("");
    return true;
  }

  async function downloadPdf() {
    if (!check()) return;
    setBusy("pdf");
    try {
      const res = await fetch("/api/public/tools/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: full, logo }),
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
      a.download = `${isEstimate ? "Estimate" : "Invoice"}-${full.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDownloaded(true);
      trackSiteEvent("tool_pdf", full.kind);
    } catch {
      setError("The PDF didn't render. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function getPaidOnline() {
    if (!check()) return;
    setBusy("draft");
    try {
      const res = await fetch("/api/public/tools/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: full, logo }),
      });
      const data = (await res.json().catch(() => ({}))) as { href?: string; error?: string };
      if (!res.ok || !data.href) {
        setError(data.error ?? "Something went wrong. Try again.");
        setBusy(null);
        return;
      }
      trackSiteEvent("tool_draft", full.kind);
      window.location.href = data.href;
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setBusy(null);
    }
  }

  const canEmail = Boolean(emailSession?.enabled);
  const signupLabel = isEstimate ? "Get it signed online" : "Get paid online";

  function openEmail() {
    if (!check()) return;
    setEmailOpen(true);
  }

  return (
    <div className="app-ui ds" style={dsBrandVars(doc.accent || DEFAULT_ACCENT, "#F86A0A") as React.CSSProperties}>
      <div className="mx-auto max-w-3xl space-y-5 p-4 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] font-semibold text-gray-900">{isEstimate ? "New Quote" : "New Invoice"}</h1>
          <button type="button" onClick={() => setPreviewOpen(true)} className="ds-btn ds-btn-outline ds-btn-sm">
            <Eye size={15} />
            Preview
          </button>
        </div>

        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        {/* Your business */}
        <div className="ds-card space-y-4 p-5">
          <p className="text-sm font-semibold text-gray-700">Your business</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name *" value={doc.business.name} onChange={(v) => patchParty("business", { name: v })} autoComplete="organization" />
            <Field label="Email" value={doc.business.email} onChange={(v) => patchParty("business", { email: v })} type="email" autoComplete="email" />
            <Field label="Phone" value={doc.business.phone} onChange={(v) => patchParty("business", { phone: v })} type="tel" autoComplete="tel" />
            <Field label="Street address" value={doc.business.address} onChange={(v) => patchParty("business", { address: v })} autoComplete="street-address" />
            <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-3 sm:col-span-2">
              <Field label="City" value={doc.business.city} onChange={(v) => patchParty("business", { city: v })} />
              <Field label="State" value={doc.business.state} onChange={(v) => patchParty("business", { state: v })} />
              <Field label="ZIP" value={doc.business.zip} onChange={(v) => patchParty("business", { zip: v })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onLogoFile(e.target.files?.[0])} />
            {logo ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="Your logo" className="h-10 w-auto max-w-[120px] rounded-md border border-gray-200 bg-white object-contain p-1" />
                <button type="button" onClick={() => setLogo(null)} className="ds-btn ds-btn-outline ds-btn-sm" aria-label="Remove logo">
                  <X size={14} />
                  Remove
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="ds-btn ds-btn-outline ds-btn-sm">
                <ImagePlus size={15} />
                Add your logo
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Color</span>
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
        </div>

        {/* Client */}
        <div className="ds-card space-y-4 p-5">
          <p className="text-sm font-semibold text-gray-700">Client</p>
          <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        {/* Line items + totals, the app's way */}
        <div className="ds-card">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-700">Product / Service</h2>
          </div>
          <LineItemsEditor items={rows} onChange={(next) => setRows(next.slice(0, MAX_LINES))} integerQty showOptional={isEstimate} />
          <div className="space-y-4 rounded-b-[7px] border-t border-gray-100 bg-gray-50 px-5 py-4 max-lg:rounded-b-[13px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {!adjust ? (
                <button type="button" onClick={() => setAdjust(true)} className="ds-link text-xs font-medium">
                  Adjust tax, discount{isEstimate ? " or deposit" : ""}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Tax rate</label>
                    <input
                      type="number"
                      value={doc.taxRate || ""}
                      onChange={(e) => patch({ taxRate: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
                      min="0"
                      max="30"
                      step="0.001"
                      placeholder="0"
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Discount</label>
                    <select
                      value={doc.discountType}
                      onChange={(e) => patch({ discountType: e.target.value as ToolDoc["discountType"], discountValue: 0 })}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                    >
                      <option value="NONE">None</option>
                      <option value="PERCENT">%</option>
                      <option value="FIXED">$</option>
                    </select>
                    {doc.discountType !== "NONE" && (
                      <input
                        type="number"
                        value={doc.discountValue || ""}
                        onChange={(e) => patch({ discountValue: Math.max(0, Number(e.target.value) || 0) })}
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                      />
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-1 text-right text-sm">
                <div className="flex justify-between gap-8">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">{money(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between gap-8 text-[color:var(--ds-good)]">
                    <span>Discount{doc.discountType === "PERCENT" ? ` (${doc.discountValue}%)` : ""}</span>
                    <span className="font-medium">-{money(totals.discount)}</span>
                  </div>
                )}
                {(totals.tax ?? 0) > 0 && (
                  <div className="flex justify-between gap-8">
                    <span className="text-gray-500">Tax ({doc.taxRate}%)</span>
                    <span className="font-medium">{money(totals.tax ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8 border-t border-gray-200 pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>{money(totals.total)}</span>
                </div>
                {totals.deposit > 0 && (
                  <div className="flex justify-between gap-8 text-[color:var(--ds-primary)]">
                    <span>Required deposit</span>
                    <span className="font-semibold">{money(totals.deposit)}</span>
                  </div>
                )}
              </div>
            </div>
            {adjust && isEstimate && (
              <div className="border-t border-gray-200 pt-3">
                <p className="mb-2 text-sm font-medium text-gray-700">Required deposit</p>
                <div className="flex items-center gap-2">
                  <select
                    value={doc.depositType}
                    onChange={(e) => patch({ depositType: e.target.value as ToolDoc["depositType"], depositValue: 0 })}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                  >
                    <option value="NONE">No deposit</option>
                    <option value="PERCENT">Percent of total</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                  {doc.depositType !== "NONE" && (
                    <div className="flex items-center gap-1.5">
                      {doc.depositType === "FIXED" && <span className="text-sm text-gray-500">$</span>}
                      <input
                        type="number"
                        value={doc.depositValue || ""}
                        onChange={(e) => patch({ depositValue: Math.max(0, Number(e.target.value) || 0) })}
                        min="0"
                        step={doc.depositType === "PERCENT" ? "1" : "0.01"}
                        placeholder={doc.depositType === "PERCENT" ? "25" : "100.00"}
                        className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                      />
                      {doc.depositType === "PERCENT" && <span className="text-sm text-gray-500">%</span>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <MoreDetails hint={`${word} number, dates, message to the client`}>
          <div className="ds-card grid gap-4 p-5 sm:grid-cols-3">
            <Field label={`${isEstimate ? "Quote" : "Invoice"} #`} value={String(doc.number)} onChange={(v) => patch({ number: Math.max(1, Math.min(99_999_999, Math.round(Number(v) || 0))) })} type="number" />
            <Field label="Date" value={doc.issuedAt} onChange={(v) => patch({ issuedAt: v, dueAt: doc.dueAt && v ? addDaysIso(v, isEstimate ? 30 : 14) : doc.dueAt })} type="date" />
            <Field label={isEstimate ? "Valid until" : "Due date"} value={doc.dueAt} onChange={(v) => patch({ dueAt: v })} type="date" />
          </div>
          <div className="ds-card p-5">
            <label className={LABEL}>Client message</label>
            <textarea
              value={doc.clientMessage}
              onChange={(e) => patch({ clientMessage: e.target.value })}
              rows={3}
              maxLength={1000}
              className={`${INPUT} resize-none`}
              placeholder={`A message the client sees on the ${word}…`}
            />
          </div>
        </MoreDetails>

        {/* Actions: send, download, or open a free account with it */}
        <div className="flex flex-wrap items-center gap-3">
          {canEmail ? (
            <button type="button" onClick={openEmail} disabled={busy !== null} data-wb-event={`tool_email_open_${full.kind}`} aria-expanded={emailOpen} className="btn-primary btn-lg">
              <Send size={15} />
              Send {isEstimate ? "quote" : "invoice"}
            </button>
          ) : null}
          <button type="button" onClick={() => void downloadPdf()} disabled={busy !== null} data-wb-event={`tool_download_${full.kind}`} className={canEmail ? "ds-btn ds-btn-outline" : "btn-primary btn-lg"}>
            {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={15} />}
            Download PDF
          </button>
          <button type="button" onClick={() => void getPaidOnline()} disabled={busy !== null} data-wb-event={`tool_signup_${full.kind}`} className="ds-btn ds-btn-outline">
            {busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={15} />}
            {signupLabel}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-gray-500">
          Free, with no watermark and no sign-up.{canEmail ? ` Send emails the ${word} to your client and shows you when they open it.` : ""} {signupLabel} opens a free
          WorkBench account with this {word} in it, so the client can {isEstimate ? "approve and sign it on their phone" : "pay it by card or bank transfer from a link"}.{" "}
          <button type="button" onClick={startOver} className="font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900">
            Start over
          </button>
        </p>

        {emailSession?.enabled && (
          <EmailPanel
            doc={full}
            logo={logo}
            open={emailOpen}
            onClose={() => setEmailOpen(false)}
            session={emailSession}
            onSession={setEmailSession}
            ready={ready}
            onGetPaid={() => void getPaidOnline()}
            onSenderEmail={(email) => {
              if (!doc.business.email.trim()) patchParty("business", { email });
            }}
            path={typeof window !== "undefined" ? window.location.pathname : "/tools"}
          />
        )}

        {downloaded && (
          <div className="ds-card p-5">
            <p className="text-sm font-semibold text-gray-900">Your {word} is downloaded.</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              {isEstimate
                ? "Want the client to approve it with a tap and pay a deposit? Open a free WorkBench account and this quote is waiting in it, logo and all."
                : "Want the client to pay it by card or bank from a link, with reminders that go out on their own? Open a free WorkBench account and this invoice is waiting in it, logo and all."}
            </p>
            <button type="button" onClick={() => void getPaidOnline()} disabled={busy !== null} data-wb-event={`tool_signup_after_${full.kind}`} className="ds-link mt-2 text-sm font-semibold">
              Open a free account with this {word} →
            </button>
          </div>
        )}
      </div>

      {/* Preview: the document as the client gets it */}
      {previewOpen && typeof document !== "undefined" && createPortal(
        <div className="app-ui ds fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10" onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${word} preview`}>
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setPreviewOpen(false)} className="ds-btn ds-btn-outline ds-btn-sm bg-white">
                <X size={14} />
                Close preview
              </button>
            </div>
            <DocPreview doc={full} logo={logo} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} autoComplete={autoComplete} className={INPUT} />
    </label>
  );
}
