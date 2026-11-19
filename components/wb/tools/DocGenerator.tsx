"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Download, Eye, ImagePlus, Loader2, Pencil, Send, X } from "lucide-react";
import QuoteEditor from "@/app/platform/quotes/[id]/QuoteEditor";
import InvoiceEditor from "@/app/platform/invoices/new/InvoiceEditor";
import PageTitle from "@/components/PageTitle";
import DocPreview from "@/components/wb/tools/DocPreview";
import EmailPanel, { type EmailSession } from "@/components/wb/tools/EmailPanel";
import { dsBrandVars } from "@/lib/ds-theme";
import { trackSiteEvent } from "@/lib/site-track";
import type { ToolEditorDoc } from "@/lib/tool-editor";
import {
  DEFAULT_ACCENT,
  MAX_LOGO_BYTES,
  addDaysIso,
  docReady,
  docTotals,
  money,
  newLineId,
  sanitizeToolDoc,
  type ToolDoc,
  type ToolParty,
} from "@/lib/tool-doc";

/**
 * The free invoice / estimate tool (/tools/*, and "Make a quote" in the
 * home page's Try-it section). David 2026-11-18: "the exact same thing as
 * in the app". Step 1 IS the app's New Quote / New Invoice screen
 * (QuoteEditor / InvoiceEditor in tool mode, lib/tool-editor.ts: the client
 * stays in the page, Save hands the document back). Step 2 is what the app
 * keeps in Settings — the business name, logo and color — plus the ways out:
 * Send (EmailPanel → lib/tool-send.ts, verified sender, "opened" tracking),
 * Download PDF (POST /api/public/tools/pdf), Preview, and open a free
 * account with it (POST /api/public/tools/draft → /apply?draft=<id>).
 * Everything autosaves to localStorage per page. Nothing is prefilled.
 */

const ACCENTS = ["#0B57D8", "#F86A0A", "#15803D", "#7C3AED", "#0F172A"];

type Props = {
  initial: ToolDoc;
  /** localStorage key; one per page so each page keeps its own draft. */
  storageKey: string;
};

type Saved = { doc: ToolDoc; logo: string | null; draft: ToolEditorDoc | null; step: "edit" | "send" };

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { doc?: unknown; logo?: unknown; draft?: unknown; step?: unknown };
    const doc = sanitizeToolDoc(parsed.doc);
    if (!doc) return null;
    const logo = typeof parsed.logo === "string" && parsed.logo.startsWith("data:image/") ? parsed.logo : null;
    const d = parsed.draft as ToolEditorDoc | null | undefined;
    const draft = d && typeof d === "object" && Array.isArray(d.lines) ? d : null;
    return { doc, logo, draft, step: parsed.step === "send" && draft ? "send" : "edit" };
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

/** The app screen's result + the business details → the document the PDF / email / sign-up take. */
function buildDoc(base: ToolDoc, draft: ToolEditorDoc | null): ToolDoc {
  if (!draft) return base;
  const c = draft.client;
  const client: ToolParty = c
    ? { name: `${c.firstName} ${c.lastName}`.trim(), email: c.email, phone: c.phone, address: c.address, city: "", state: "", zip: "" }
    : { name: "", email: "", phone: "", address: "", city: "", state: "", zip: "" };
  const full = draft.depositType === "FULL";
  return {
    ...base,
    client,
    dueAt: draft.date || addDaysIso(base.issuedAt, base.kind === "invoice" ? 14 : 30),
    lines: draft.lines.map((l) => ({ id: newLineId(), name: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, optional: base.kind === "estimate" && l.isOptional })),
    taxRate: Math.max(0, Math.min(30, parseFloat(draft.taxRatePercent) || 0)),
    discountType: draft.discountType,
    discountValue: Math.max(0, parseFloat(draft.discountValue) || 0),
    depositType: full ? "PERCENT" : (draft.depositType as ToolDoc["depositType"]),
    depositValue: full ? 100 : Math.max(0, parseFloat(draft.depositValue) || 0),
    clientMessage: draft.clientMessage,
  };
}

const INPUT =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
const LABEL = "block text-sm font-medium text-gray-700 mb-1";

export default function DocGenerator({ initial, storageKey }: Props) {
  const [base, setBase] = useState<ToolDoc>(initial);
  const [draft, setDraft] = useState<ToolEditorDoc | null>(null);
  const [step, setStep] = useState<"edit" | "send">("edit");
  // Remounts the app screen when a saved draft is restored or "Start over" runs.
  const [round, setRound] = useState(0);
  const [logo, setLogo] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailSession, setEmailSession] = useState<EmailSession | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const isEstimate = base.kind === "estimate";
  const word = isEstimate ? "quote" : "invoice";

  const doc = useMemo(() => buildDoc(base, draft), [base, draft]);

  useEffect(() => {
    const saved = readSaved(storageKey);
    if (saved && saved.doc.kind === initial.kind) {
      setBase(saved.doc);
      setLogo(saved.logo);
      setDraft(saved.draft);
      setStep(saved.step);
      setRound((r) => r + 1);
    }
    setRestored(true);
  }, [storageKey, initial.kind]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ doc: base, logo, draft, step }));
    } catch {
      /* storage full or blocked: the page still works */
    }
  }, [base, logo, draft, step, restored, storageKey]);

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

  const totals = useMemo(() => docTotals(doc), [doc]);
  const ready = docReady(doc);
  const patchBiz = useCallback((p: Partial<ToolParty>) => setBase((d) => ({ ...d, business: { ...d.business, ...p } })), []);

  function goTo(next: "edit" | "send") {
    setStep(next);
    setError("");
    // Keep the top of the screen in view (the home page frames it in a scroll box).
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (!el) return;
      const box = el.closest("[data-tool-scroll]");
      if (box) box.scrollTop = 0;
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight) window.scrollBy({ top: top - 110 });
    });
  }

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
    setBase(initial);
    setDraft(null);
    setLogo(null);
    setDownloaded(false);
    setRound((r) => r + 1);
    goTo("edit");
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
      a.download = `${isEstimate ? "Quote" : "Invoice"}-${doc.number}.pdf`;
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
    if (!check()) return;
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

  const canEmail = Boolean(emailSession?.enabled);
  const signupLabel = isEstimate ? "Get it signed online" : "Get paid online";
  const brand = base.accent || DEFAULT_ACCENT;
  // The app's look in the visitor's color (the .app-ui bridge reads the --wb-* vars).
  const shell = {
    ...dsBrandVars(brand, "#F86A0A"),
    "--wb-accent-light": brand,
    "--wb-accent-strong-light": brand,
    "--wb-accent-bright-light": brand,
    "--wb-primary-l": brand,
  } as React.CSSProperties;

  const tool = { initial: draft, onSave: (d: ToolEditorDoc) => { setDraft(d); goTo("send"); } };

  return (
    <div ref={topRef} className="app-ui ds" style={shell}>
      {step === "edit" ? (
        isEstimate ? (
          <QuoteEditor key={round} contacts={[]} tool={tool} />
        ) : (
          <InvoiceEditor key={round} contacts={[]} prefillJob={null} tool={tool} />
        )
      ) : (
        <div className="mx-auto max-w-3xl space-y-5 p-4 lg:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <PageTitle>
              {isEstimate ? "Quote" : "Invoice"} #{base.number}
            </PageTitle>
            <button type="button" onClick={() => goTo("edit")} className="ds-btn ds-btn-outline ds-btn-sm ml-auto">
              <Pencil size={14} />
              Edit
            </button>
          </div>

          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}

          <div className="ds-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">{doc.client.name || "No client"}</p>
                <p className="text-[26px] font-semibold text-gray-900">{money(totals.total)}</p>
                {totals.deposit > 0 && <p className="text-sm text-[color:var(--ds-primary)]">Required deposit {money(totals.deposit)}</p>}
              </div>
              <button type="button" onClick={() => setPreviewOpen(true)} className="ds-btn ds-btn-outline ds-btn-sm">
                <Eye size={15} />
                Preview
              </button>
            </div>
          </div>

          <div className="ds-card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-gray-700">Your business</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name *" value={base.business.name} onChange={(v) => patchBiz({ name: v })} autoComplete="organization" />
              <Field label="Email" value={base.business.email} onChange={(v) => patchBiz({ email: v })} type="email" autoComplete="email" />
              <Field label="Phone" value={base.business.phone} onChange={(v) => patchBiz({ phone: v })} type="tel" autoComplete="tel" />
              <Field label="Street address" value={base.business.address} onChange={(v) => patchBiz({ address: v })} autoComplete="street-address" />
              <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-3 sm:col-span-2">
                <Field label="City" value={base.business.city} onChange={(v) => patchBiz({ city: v })} />
                <Field label="State" value={base.business.state} onChange={(v) => patchBiz({ state: v })} />
                <Field label="ZIP" value={base.business.zip} onChange={(v) => patchBiz({ zip: v })} />
              </div>
              <Field
                label={`${isEstimate ? "Quote" : "Invoice"} #`}
                value={String(base.number)}
                onChange={(v) => setBase((d) => ({ ...d, number: Math.max(1, Math.min(99_999_999, Math.round(Number(v) || 0))) }))}
                type="number"
              />
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
                    onClick={() => setBase((d) => ({ ...d, accent: hex }))}
                    aria-label={`Color ${hex}`}
                    aria-pressed={base.accent === hex}
                    className={`h-6 w-6 rounded-full border-2 ${base.accent === hex ? "border-gray-900" : "border-white shadow"}`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 border-white bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] shadow" title="Pick any color">
                  <input type="color" value={brand} onChange={(e) => setBase((d) => ({ ...d, accent: e.target.value }))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom color" />
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canEmail && (
              <button type="button" onClick={() => check() && setEmailOpen(true)} disabled={busy !== null} data-wb-event={`tool_email_open_${doc.kind}`} aria-expanded={emailOpen} className="btn-primary btn-lg">
                <Send size={15} />
                Send {word}
              </button>
            )}
            <button type="button" onClick={() => void downloadPdf()} disabled={busy !== null} data-wb-event={`tool_download_${doc.kind}`} className={canEmail ? "ds-btn ds-btn-outline" : "btn-primary btn-lg"}>
              {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={15} />}
              Download PDF
            </button>
            <button type="button" onClick={() => void getPaidOnline()} disabled={busy !== null} data-wb-event={`tool_signup_${doc.kind}`} className="ds-btn ds-btn-outline">
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
              doc={doc}
              logo={logo}
              open={emailOpen}
              onClose={() => setEmailOpen(false)}
              session={emailSession}
              onSession={setEmailSession}
              ready={ready}
              onGetPaid={() => void getPaidOnline()}
              onSenderEmail={(email) => {
                if (!base.business.email.trim()) patchBiz({ email });
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
              <button type="button" onClick={() => void getPaidOnline()} disabled={busy !== null} data-wb-event={`tool_signup_after_${doc.kind}`} className="ds-link mt-2 text-sm font-semibold">
                Open a free account with this {word} →
              </button>
            </div>
          )}
        </div>
      )}

      {previewOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="app-ui ds fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10" onClick={() => setPreviewOpen(false)}>
            <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${word} preview`}>
              <div className="mb-3 flex justify-end">
                <button type="button" onClick={() => setPreviewOpen(false)} className="ds-btn ds-btn-outline ds-btn-sm bg-white">
                  <X size={14} />
                  Close preview
                </button>
              </div>
              <DocPreview doc={doc} logo={logo} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} autoComplete={autoComplete} className={INPUT} />
    </label>
  );
}
