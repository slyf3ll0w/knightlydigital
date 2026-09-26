"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Input, Select, Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { InfoTip } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { PUBLIC_LIMITS, PUBLIC_PHOTO_ASSIST_DAILY_CAP, publicSlugFrom, type EstimatorPublicConfig } from "@/lib/estimator-public";

/**
 * A tool's Web form section. One switch publishes it (saved on the spot) and
 * the link + embed snippet appear right there — no checkbox-then-save. The
 * knobs (what the visitor sees and when, what each submission creates, the
 * words) live under "Options", folded until wanted.
 */

export type PublishTool = {
  id: string;
  name: string;
  /** The tool has Atlas fill-in — the only case where photo fill-in can be offered */
  usesAtlas: boolean;
  /** A question Atlas assesses itself — the photo step is then always on */
  assessed: boolean;
  isPublic: boolean;
  publicSlug: string | null;
  publicConfig: EstimatorPublicConfig;
  publicViews: number;
  publicCalcs: number;
  submissions: number;
};

type Saved = { isPublic?: boolean; publicSlug?: string | null; publicConfig?: unknown; error?: string };

export default function PublishPanel({ tool, companySlug, baseUrl, onSaved, onDirty, initialOptionsOpen = false }: { tool: PublishTool; companySlug: string; baseUrl: string; onSaved: (t: Saved) => void; /** Tells the page there are unsaved options (it asks before leaving / switching sections). */ onDirty?: (dirty: boolean) => void; initialOptionsOpen?: boolean }) {
  const atlas = useAssistant();
  const [slug, setSlug] = useState(tool.publicSlug ?? publicSlugFrom(tool.name));
  const [cfg, setCfg] = useState<EstimatorPublicConfig>(tool.publicConfig);
  const [busy, setBusy] = useState<"publish" | "slug" | "options" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [options, setOptions] = useState(initialOptionsOpen);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSlug(tool.publicSlug ?? publicSlugFrom(tool.name));
    setCfg(tool.publicConfig);
  }, [tool]);

  const c = cfg;
  const optionsDirty = JSON.stringify(cfg) !== JSON.stringify(tool.publicConfig);
  const slugDirty = slug !== (tool.publicSlug ?? publicSlugFrom(tool.name));
  useEffect(() => {
    onDirty?.(optionsDirty || slugDirty);
    return () => onDirty?.(false);
  }, [optionsDirty, slugDirty, onDirty]);
  const patch = (p: Partial<EstimatorPublicConfig>) => setCfg((s) => ({ ...s, ...p }));
  const patchField = (k: "email" | "phone" | "address", p: Partial<{ show: boolean; required: boolean }>) => setCfg((s) => ({ ...s, fields: { ...s.fields, [k]: { ...s.fields[k], ...p } } }));

  const liveSlug = tool.publicSlug;
  const hostedUrl = tool.isPublic && liveSlug ? `${baseUrl}/book/${companySlug}/estimate/${liveSlug}` : "";
  const embedKey = liveSlug ? `${companySlug}/estimate/${liveSlug}` : "";
  const origin = baseUrl ? new URL(baseUrl).origin : "";
  const embedSnippet = hostedUrl
    ? `<iframe src="${baseUrl}/embed/${embedKey}" data-jobflow="${embedKey}" style="width:100%;max-width:640px;height:720px;border:0;" title="Get an estimate"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${origin}"&&d&&d.type==="jobflow:height"&&d.slug==="${embedKey}"){var f=document.querySelector('iframe[data-jobflow="${embedKey}"]');if(f)f.style.height=d.height+"px";if(e.source&&e.source.postMessage)e.source.postMessage({type:"jobflow:page",href:location.href},e.origin);}});</script>`
    : "";

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      setError("Couldn't copy — select the text and copy it manually.");
    }
  }

  async function send(body: Record<string, unknown>, kind: "publish" | "slug" | "options") {
    setBusy(kind);
    setError("");
    setSaved(false);
    const { ok, data } = await postJson<Saved>(`/api/app/estimators/${tool.id}`, body, "PATCH");
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return false;
    }
    setSaved(true);
    onSaved(data);
    return true;
  }

  // segmented choices in the app accent, like every other selected control
  const seg = (active: boolean) => `flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${active ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`;
  const hidden = c.showPrice === "hidden";
  const funnel = `${tool.publicViews} view${tool.publicViews === 1 ? "" : "s"} → ${tool.publicCalcs} estimate${tool.publicCalcs === 1 ? "" : "s"} → ${tool.submissions} lead${tool.submissions === 1 ? "" : "s"}`;
  const label = "mb-1 block text-sm font-medium text-gray-800";
  // the photo step is always on when a question is assessed by Atlas (the form needs it)
  const photoOn = c.photoAssist || tool.assessed;

  const whenLine = c.reveal === "before_form" ? "asks for details first" : c.reveal === "after_contact" ? "details, then the estimate" : "estimate, then details";

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}

      {/* ── publish + the link ── */}
      <section className="ds-card p-4 sm:p-5">
        <button
          type="button"
          role="switch"
          aria-checked={tool.isPublic}
          disabled={busy !== null}
          onClick={() => void send({ isPublic: !tool.isPublic, publicSlug: slug || publicSlugFrom(tool.name) }, "publish")}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-gray-900">{tool.isPublic ? "Published as a web form" : "Publish as a web form"}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{tool.isPublic ? "It's live at the link below. Share the link, or paste the embed code into your website — visitors get an estimate and land in your leads." : "One tap gives you a link to share and an embed code for your website. Visitors get an estimate and land in your leads. Free to run."}</span>
          </span>
          <span className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ backgroundColor: tool.isPublic ? "var(--ds-primary)" : "var(--ds-line-strong)" }} aria-hidden>
            {busy === "publish" ? (
              <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
            ) : (
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${tool.isPublic ? "translate-x-[26px]" : "translate-x-1"}`} />
            )}
          </span>
        </button>

        {hostedUrl && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-700">Link — share it anywhere</p>
              <div className="flex items-center gap-2">
                <input readOnly value={hostedUrl} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700" />
                <button type="button" onClick={() => copy(hostedUrl, "link")} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {copied === "link" ? <Check size={14} className="text-[color:var(--ds-good)]" /> : <Copy size={14} />} {copied === "link" ? "Copied" : "Copy"}
                </button>
                <a href={`${hostedUrl}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <ExternalLink size={14} /> Open
                </a>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-700">Embed — paste into your site where the form should appear</p>
              <div className="flex items-start gap-2">
                <textarea readOnly value={embedSnippet} rows={2} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-600" />
                <button type="button" onClick={() => copy(embedSnippet, "embed")} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {copied === "embed" ? <Check size={14} className="text-[color:var(--ds-good)]" /> : <Copy size={14} />} {copied === "embed" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">So far: {funnel}.</p>
          </div>
        )}
      </section>

      {/* ── options ── */}
      <section className="ds-card overflow-hidden">
        <button type="button" onClick={() => setOptions((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50" aria-expanded={options}>
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-[color:var(--ds-ink)]">Options</span>
            <span className="ds-small mt-0.5 block">{`${c.showPrice === "exact" ? "Shows the exact estimate" : c.showPrice === "range" ? `Shows a range (±${c.rangePct}%)` : "Shows no price"} · ${whenLine} · ${c.onSubmit === "send" ? "emails the quote" : c.onSubmit === "draft" ? "drafts a quote" : "creates a request"}${photoOn ? " · photo fill-in" : ""}`}</span>
          </span>
          {options ? <ChevronDown size={16} className="shrink-0 text-gray-400" /> : <ChevronRight size={16} className="shrink-0 text-gray-400" />}
        </button>
        {options && (
          <div className="space-y-5 border-t border-gray-100 p-4 sm:p-5">
            <div>
              <label className={label}>Link name</label>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="hidden truncate sm:inline">/book/{companySlug}/estimate/</span>
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} maxLength={PUBLIC_LIMITS.slug} className="min-w-0 flex-1" />
                {slugDirty && (
                  <button type="button" disabled={busy !== null} onClick={() => void send({ publicSlug: slug }, "slug")} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    {busy === "slug" ? <Loader2 size={13} className="animate-spin" /> : null} Rename
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="block text-sm font-medium text-gray-800">What the visitor sees</label>
                {hidden && <InfoTip>Visitors leave their details and you follow up with the number. The estimate is still worked out for you and lands on the request.</InfoTip>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => patch({ showPrice: "exact" })} className={seg(c.showPrice === "exact")}>
                  Exact estimate
                </button>
                <button type="button" onClick={() => patch({ showPrice: "range" })} className={seg(c.showPrice === "range")}>
                  A range
                </button>
                <button type="button" onClick={() => patch({ showPrice: "hidden", onSubmit: c.onSubmit === "send" ? "draft" : c.onSubmit })} className={seg(hidden)}>
                  No price
                </button>
              </div>
              {c.showPrice === "range" && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <span>Range width ±</span>
                  <Input type="number" min={PUBLIC_LIMITS.rangePctMin} max={PUBLIC_LIMITS.rangePctMax} value={c.rangePct} onChange={(e) => patch({ rangePct: Number(e.target.value) || 15 })} className="w-20" />
                  <span>%</span>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="block text-sm font-medium text-gray-800">When to ask for their name and contact details</label>
                <InfoTip>
                  {c.reveal === "before_form"
                    ? "Everyone who starts the form becomes a lead, even if they never finish. Fewer people finish."
                    : c.reveal === "after_contact" || hidden
                      ? "They answer the questions, leave their details, and the estimate follows. A fair trade for most visitors."
                      : "They see the number first, then decide whether to leave their details. The most estimates, the fewest leads."}
                </InfoTip>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {!hidden && (
                  <button type="button" onClick={() => patch({ reveal: "instant" })} className={seg(c.reveal === "instant")}>
                    After the estimate
                  </button>
                )}
                <button type="button" onClick={() => patch({ reveal: "after_contact" })} className={seg(c.reveal === "after_contact" || (hidden && c.reveal === "instant"))}>
                  After the questions{hidden ? "" : ", before the estimate"}
                </button>
                <button type="button" onClick={() => patch({ reveal: "before_form" })} className={seg(c.reveal === "before_form")}>
                  Before the questions
                </button>
              </div>
            </div>

            <div>
              <label className={label}>Each submission</label>
              <Select value={c.onSubmit} onChange={(e) => patch({ onSubmit: e.target.value as EstimatorPublicConfig["onSubmit"] })} className="w-full">
                <option value="draft">Creates a lead + request + draft quote for you to review</option>
                {!hidden && <option value="send">Creates a lead + request and emails the quote for approval</option>}
                <option value="request">Creates a lead + request only</option>
              </Select>
            </div>

            <div>
              <label className={label}>Ask for</label>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {(["email", "phone", "address"] as const).map((k) => {
                  const fld = c.fields[k];
                  return (
                    <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input type="checkbox" checked={fld.show} onChange={(e) => patchField(k, { show: e.target.checked, required: e.target.checked ? fld.required : false })} className="h-4 w-4 rounded accent-[color:var(--ds-primary)]" />
                        {k === "email" ? "Email" : k === "phone" ? "Phone" : "Service address"}
                      </label>
                      <label className={`flex items-center gap-1.5 text-xs ${fld.show ? "text-gray-600" : "text-gray-300"}`}>
                        <input type="checkbox" disabled={!fld.show} checked={fld.required} onChange={(e) => patchField(k, { required: e.target.checked })} className="h-3.5 w-3.5 rounded accent-[color:var(--ds-primary)]" />
                        required
                      </label>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input type="checkbox" checked={c.fields.message.show} onChange={(e) => patch({ fields: { ...c.fields, message: { ...c.fields.message, show: e.target.checked } } })} className="h-4 w-4 rounded accent-[color:var(--ds-primary)]" />
                    A message box
                  </label>
                  {c.fields.message.show && <Input value={c.fields.message.label} onChange={(e) => patch({ fields: { ...c.fields, message: { ...c.fields.message, label: e.target.value } } })} maxLength={PUBLIC_LIMITS.messageLabel} className="w-48 py-1 text-xs" />}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500">Name is always asked. Quotes sent for approval need an email.</p>
            </div>

            {!tool.usesAtlas && <p className="text-xs text-gray-500">Want visitors to attach a photo and have Atlas fill in the answers? Turn on Atlas fill-in on the tool&apos;s Overview first.</p>}
            {tool.usesAtlas && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-gray-800">Let visitors attach a photo or describe the job</span>
                  <span className="block text-xs text-gray-500">
                    {tool.assessed ? "Always on for this tool — a question is assessed by Atlas from the photo or description. " : ""}
                    Atlas fills in the answers. Uses your tokens — at most {PUBLIC_PHOTO_ASSIST_DAILY_CAP} a day.{atlas.locked ? " Your tokens are used up right now, so the form hides this step until they refill." : ""}
                  </span>
                </span>
                <input type="checkbox" checked={photoOn} disabled={tool.assessed} onChange={(e) => patch({ photoAssist: e.target.checked })} className="h-5 w-5 rounded accent-[color:var(--ds-primary)] disabled:opacity-60" />
              </label>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Heading</label>
                <Input value={c.heading} onChange={(e) => patch({ heading: e.target.value })} placeholder={tool.name} maxLength={PUBLIC_LIMITS.heading} className="w-full" />
              </div>
              <div>
                <label className={label}>Button</label>
                <Input value={c.buttonLabel} onChange={(e) => patch({ buttonLabel: e.target.value })} placeholder={c.reveal !== "after_contact" && !hidden ? "See my estimate" : "Get my quote"} maxLength={PUBLIC_LIMITS.buttonLabel} className="w-full" />
              </div>
            </div>
            <div>
              <label className={label}>Intro</label>
              <Textarea value={c.intro} onChange={(e) => patch({ intro: e.target.value })} rows={2} placeholder="A sentence under the heading (optional)" maxLength={PUBLIC_LIMITS.intro} className="w-full" />
            </div>
            <div>
              <label className={label}>Fine print under the estimate</label>
              <Textarea value={c.disclaimer} onChange={(e) => patch({ disclaimer: e.target.value })} rows={2} maxLength={PUBLIC_LIMITS.disclaimer} className="w-full" />
            </div>
            <div>
              <label className={label}>Thank-you message</label>
              <Textarea value={c.successMessage} onChange={(e) => patch({ successMessage: e.target.value })} rows={2} placeholder="Leave blank for a default that fits" maxLength={PUBLIC_LIMITS.successMessage} className="w-full" />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-500">{optionsDirty ? "Unsaved changes" : saved ? "Saved" : ""}</span>
              <button type="button" disabled={busy !== null || !optionsDirty} onClick={() => void send({ publicConfig: c }, "options")} className="btn-primary h-9 justify-center">
                {busy === "options" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save options
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
