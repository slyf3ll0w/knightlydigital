"use client";

import { useMemo, useState } from "react";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import BookingFormBuilder from "../../BookingFormBuilder";
import BookingForm from "@/app/book/[slug]/BookingForm";
import {
  bookingAccent,
  sanitizeBookingForm,
  FONT_SIZE_ZOOM,
  GOOGLE_FONT_RE,
  type BookingFormConfig,
} from "@/lib/booking-form";

type FormMeta = {
  id: string;
  name: string;
  slug: string;
  type: "INQUIRY" | "BOOKING" | "SERVICE_REQUEST";
  isDefault: boolean;
  config: BookingFormConfig;
};

const TYPE_LABEL = {
  INQUIRY: "Inquiry",
  BOOKING: "Booking",
  SERVICE_REQUEST: "Service Request",
} as const;

/**
 * Per-form editor: edit on the left, live preview on the right, share link
 * and embed snippet below. Saves to the form's own row.
 */
export default function WebFormEditor({
  form,
  company,
  baseUrl,
  contactFieldDefs,
  priceBookItems = [],
}: {
  form: FormMeta;
  company: { name: string; slug: string; brandColor: string | null };
  baseUrl: string;
  contactFieldDefs: { id: string; label: string }[];
  priceBookItems?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    durationMinutes?: number | null;
  }[];
}) {
  const [config, setConfig] = useState(form.config);
  const [name, setName] = useState(form.name);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const preview = useMemo(() => sanitizeBookingForm(config), [config]);
  const dark = preview.appearance.theme === "dark";
  const transparent = preview.appearance.theme === "transparent";
  const accent = bookingAccent(preview, company.brandColor ?? "#16A34A");
  const previewFont =
    preview.appearance.font && GOOGLE_FONT_RE.test(preview.appearance.font)
      ? preview.appearance.font
      : null;

  useUnsavedWarning(dirty);

  const pathSuffix = form.isDefault ? company.slug : `${company.slug}/${form.slug}`;
  const bookingUrl = `${baseUrl}/book/${pathSuffix}`;
  const embedKey = form.isDefault ? company.slug : `${company.slug}/${form.slug}`;
  const embedOrigin = baseUrl ? new URL(baseUrl).origin : "";
  const embedSnippet = `<iframe src="${baseUrl}/embed/${pathSuffix}" data-jobflow="${embedKey}" style="width:100%;max-width:560px;height:760px;border:0;" title="${form.name} — ${company.name}"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${embedOrigin}"&&d&&d.type==="jobflow:height"&&d.slug==="${embedKey}"){var f=document.querySelector('iframe[data-jobflow="${embedKey}"]');if(f)f.style.height=d.height+"px";}});</script>`;

  function onChange(next: BookingFormConfig) {
    setConfig(next);
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/app/web-forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, name }),
    });
    setSaving(false);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function copyText(text: string, set: (v: boolean) => void) {
    await navigator.clipboard.writeText(text);
    set(true);
    setTimeout(() => set(false), 2000);
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/app/settings/booking" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft size={18} />
            </Link>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
                setSaved(false);
              }}
              className="numeral-ledger text-2xl font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none min-w-0"
            />
          </div>
          <p className="text-sm text-gray-500 lg:ml-[30px]">
            {TYPE_LABEL[form.type]} form
            {form.type === "SERVICE_REQUEST" && " — submissions create an invoice automatically"}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saved ? "Saved!" : dirty ? "Save Changes" : "Saved"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <BookingFormBuilder
          config={config}
          onChange={onChange}
          formType={form.type}
          contactFieldDefs={contactFieldDefs}
          priceBookItems={priceBookItems}
        />

        {/* Live preview */}
        <div className="lg:sticky lg:top-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Live preview
            </p>
            {transparent && (
              <p className="text-[11px] text-gray-400">
                Transparent — sample background shown; on your site it shows your page
              </p>
            )}
          </div>
          {previewFont && (
            <link
              rel="stylesheet"
              href={`https://fonts.googleapis.com/css2?family=${previewFont.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`}
            />
          )}
          <div
            className="rounded-lg border border-gray-200 p-4 overflow-hidden"
            style={{
              backgroundColor: dark ? "#0C0F0C" : transparent ? "#13151c" : "#f9fafb",
              ...(transparent
                ? {
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                  }
                : {}),
            }}
          >
            <div
              className="pointer-events-none select-none"
              aria-hidden
              style={{
                zoom: FONT_SIZE_ZOOM[preview.appearance.fontSize],
                ...(previewFont ? { fontFamily: `"${previewFont}", sans-serif` } : {}),
              }}
            >
              <BookingForm
                companySlug={company.slug}
                formType={form.type}
                theme={dark || transparent ? "dark" : "light"}
                accent={accent}
                transparent={transparent}
                config={preview}
                showHeader
              />
            </div>
          </div>
        </div>
      </div>

      {/* Share link + embed */}
      <div className="card-ledger p-5 mt-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Share This Form</h2>
          <p className="text-xs text-gray-400 mt-0.5">Share this link on your website or Google profile</p>
        </div>
        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-sm font-mono text-gray-600 truncate flex-1">{bookingUrl}</span>
          <button type="button" onClick={() => copyText(bookingUrl, setCopied)}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-600 hover:underline">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <a href={bookingUrl} target="_blank" rel="noreferrer"
            className="shrink-0 text-gray-400 hover:text-gray-600">
            <ExternalLink size={13} />
          </a>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Embed on your website</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Paste this code into your site — it resizes itself, and your saved style and font
                come with it
              </p>
            </div>
            <button type="button" onClick={() => copyText(embedSnippet, setEmbedCopied)}
              className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-600 hover:underline">
              {embedCopied ? <Check size={12} /> : <Copy size={12} />}
              {embedCopied ? "Copied" : "Copy code"}
            </button>
          </div>
          <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-600 whitespace-pre-wrap break-all">
            {embedSnippet}
          </pre>
          <a
            href={`${baseUrl}/embed/${pathSuffix}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-green-600 hover:underline"
          >
            <ExternalLink size={11} />
            Preview the embed
          </a>
        </div>
      </div>
    </div>
  );
}
