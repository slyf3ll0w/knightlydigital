"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { Input, Select, Textarea } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { PUBLIC_LIMITS, publicSlugFrom, type EstimatorPublicConfig } from "@/lib/estimator-public";

/**
 * Settings → Estimate tools → "Website form". Turns one tool into a public
 * lead-capture form: the visitor answers its questions, sees the estimate
 * the way the owner chooses (exact / range / nothing, before or after
 * leaving details), and the business gets a lead + request (+ quote). The
 * link and the iframe snippet live here too, like the booking items'.
 */

export type PublishTool = {
  id: string;
  name: string;
  isPublic: boolean;
  publicSlug: string | null;
  publicConfig: EstimatorPublicConfig;
  publicViews: number;
  publicCalcs: number;
  submissions: number;
};

export default function PublishEstimatorSheet({
  tool,
  companySlug,
  baseUrl,
  open,
  onClose,
  onSaved,
}: {
  tool: PublishTool | null;
  companySlug: string;
  baseUrl: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState("");
  const [cfg, setCfg] = useState<EstimatorPublicConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tool) return;
    setIsPublic(tool.isPublic);
    setSlug(tool.publicSlug ?? publicSlugFrom(tool.name));
    setCfg(tool.publicConfig);
    setError("");
    setCopied(null);
  }, [open, tool]);

  if (!tool || !cfg) return <Modal open={open} onClose={onClose}>{null}</Modal>;

  const c = cfg;
  const patch = (p: Partial<EstimatorPublicConfig>) => setCfg((s) => (s ? { ...s, ...p } : s));
  const patchField = (k: "email" | "phone" | "address", p: Partial<{ show: boolean; required: boolean }>) =>
    setCfg((s) => (s ? { ...s, fields: { ...s.fields, [k]: { ...s.fields[k], ...p } } } : s));

  const savedSlug = tool.publicSlug;
  const hostedUrl = savedSlug ? `${baseUrl}/book/${companySlug}/estimate/${savedSlug}` : "";
  const embedKey = savedSlug ? `${companySlug}/estimate/${savedSlug}` : "";
  const origin = baseUrl ? new URL(baseUrl).origin : "";
  const embedSnippet = savedSlug
    ? `<iframe src="${baseUrl}/embed/${embedKey}" data-jobflow="${embedKey}" style="width:100%;max-width:640px;height:720px;border:0;" title="Get an estimate"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${origin}"&&d&&d.type==="jobflow:height"&&d.slug==="${embedKey}"){var f=document.querySelector('iframe[data-jobflow="${embedKey}"]');if(f)f.style.height=d.height+"px";}});</script>`
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

  async function save() {
    if (!tool) return;
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/estimators/${tool.id}`, { isPublic, publicSlug: slug, publicConfig: c }, "PATCH");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onSaved();
  }

  const seg = (active: boolean) => `flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`;
  const hidden = c.showPrice === "hidden";
  const funnel = `${tool.publicViews} view${tool.publicViews === 1 ? "" : "s"} → ${tool.publicCalcs} estimate${tool.publicCalcs === 1 ? "" : "s"} → ${tool.submissions} lead${tool.submissions === 1 ? "" : "s"}`;

  return (
    <Modal open={open} onClose={onClose} cardClassName="card-ledger w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-700">
          <Globe size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">Website form</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Put “{tool.name}” on your website. Visitors answer its questions, get an estimate, and land in your leads. Free to run — no Atlas tokens.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-gray-800">On your website</span>
            <span className="block text-xs text-gray-500">{isPublic ? "The link and embed below work" : "Off — the link shows nothing"}</span>
          </span>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-5 w-5 rounded accent-green-600" />
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Link name</label>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="hidden truncate sm:inline">/book/{companySlug}/estimate/</span>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} maxLength={PUBLIC_LIMITS.slug} className="min-w-0 flex-1" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Heading</label>
            <Input value={c.heading} onChange={(e) => patch({ heading: e.target.value })} placeholder={tool.name} maxLength={PUBLIC_LIMITS.heading} className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Button</label>
            <Input value={c.buttonLabel} onChange={(e) => patch({ buttonLabel: e.target.value })} placeholder={c.reveal === "instant" ? "See my estimate" : "Get my quote"} maxLength={PUBLIC_LIMITS.buttonLabel} className="w-full" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Intro</label>
          <Textarea value={c.intro} onChange={(e) => patch({ intro: e.target.value })} rows={2} placeholder="A sentence under the heading (optional)" maxLength={PUBLIC_LIMITS.intro} className="w-full" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">What the visitor sees</label>
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
              <Input
                type="number"
                min={PUBLIC_LIMITS.rangePctMin}
                max={PUBLIC_LIMITS.rangePctMax}
                value={c.rangePct}
                onChange={(e) => patch({ rangePct: Number(e.target.value) || 15 })}
                className="w-20"
              />
              <span>%</span>
              <span className="text-xs text-gray-500">e.g. $1,000 → $850 – $1,150</span>
            </div>
          )}
          {hidden && <p className="mt-1.5 text-xs text-gray-500">Visitors leave their details and you follow up with the number. The estimate is still worked out for you and lands on the request.</p>}
        </div>

        {!hidden && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">When they see it</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => patch({ reveal: "instant" })} className={seg(c.reveal === "instant")}>
                Right away, then ask for details
              </button>
              <button type="button" onClick={() => patch({ reveal: "after_contact" })} className={seg(c.reveal === "after_contact")}>
                After they leave details
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Each submission</label>
          <Select value={c.onSubmit} onChange={(e) => patch({ onSubmit: e.target.value as EstimatorPublicConfig["onSubmit"] })} className="w-full">
            <option value="draft">Creates a lead + request + draft quote for you to review</option>
            {!hidden && <option value="send">Creates a lead + request and emails the quote for approval</option>}
            <option value="request">Creates a lead + request only</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Ask for</label>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {(["email", "phone", "address"] as const).map((k) => {
              const fld = c.fields[k];
              return (
                <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input type="checkbox" checked={fld.show} onChange={(e) => patchField(k, { show: e.target.checked, required: e.target.checked ? fld.required : false })} className="h-4 w-4 rounded accent-green-600" />
                    {k === "email" ? "Email" : k === "phone" ? "Phone" : "Service address"}
                  </label>
                  <label className={`flex items-center gap-1.5 text-xs ${fld.show ? "text-gray-600" : "text-gray-300"}`}>
                    <input type="checkbox" disabled={!fld.show} checked={fld.required} onChange={(e) => patchField(k, { required: e.target.checked })} className="h-3.5 w-3.5 rounded accent-green-600" />
                    required
                  </label>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={c.fields.message.show} onChange={(e) => patch({ fields: { ...c.fields, message: { ...c.fields.message, show: e.target.checked } } })} className="h-4 w-4 rounded accent-green-600" />
                A message box
              </label>
              {c.fields.message.show && (
                <Input value={c.fields.message.label} onChange={(e) => patch({ fields: { ...c.fields, message: { ...c.fields.message, label: e.target.value } } })} maxLength={PUBLIC_LIMITS.messageLabel} className="w-48 py-1 text-xs" />
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Name is always asked. Quotes sent for approval need an email.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Fine print under the estimate</label>
          <Textarea value={c.disclaimer} onChange={(e) => patch({ disclaimer: e.target.value })} rows={2} maxLength={PUBLIC_LIMITS.disclaimer} className="w-full" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Thank-you message</label>
          <Textarea value={c.successMessage} onChange={(e) => patch({ successMessage: e.target.value })} rows={2} placeholder="Leave blank for a default that fits" maxLength={PUBLIC_LIMITS.successMessage} className="w-full" />
        </div>

        {savedSlug && (
          <div className="space-y-3 rounded-lg bg-gray-50 p-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-700">Link</p>
              <div className="flex items-center gap-2">
                <input readOnly value={hostedUrl} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700" />
                <button type="button" onClick={() => copy(hostedUrl, "link")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy link">
                  {copied === "link" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
                <a href={`${hostedUrl}?preview=1`} target="_blank" rel="noreferrer" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Preview">
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-700">Embed on your website</p>
              <div className="flex items-start gap-2">
                <textarea readOnly value={embedSnippet} rows={4} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] text-gray-700" />
                <button type="button" onClick={() => copy(embedSnippet, "embed")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy snippet">
                  {copied === "embed" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Paste it where the form should appear. It sizes itself to fit and matches your booking page's look.</p>
            </div>
            <p className="text-xs text-gray-500">So far: {funnel}</p>
          </div>
        )}
        {!savedSlug && <p className="text-xs text-gray-500">Save once to get the link and embed snippet.</p>}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary h-10 justify-center">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save
        </button>
      </div>
    </Modal>
  );
}
