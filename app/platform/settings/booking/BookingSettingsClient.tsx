"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";
import BookingFormBuilder from "../BookingFormBuilder";

type Company = { name: string; slug: string; bookingForm: unknown };

/**
 * Booking Form page: customize the fields clients fill out, grab the share
 * link, and copy the auto-resizing embed snippet.
 */
export default function BookingSettingsClient({
  company,
  baseUrl,
}: {
  company: Company;
  baseUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<"light" | "dark" | "transparent">("light");
  const [embedFont, setEmbedFont] = useState("");

  const bookingUrl = `${baseUrl}/book/${company.slug}`;
  const embedQuery = new URLSearchParams();
  if (embedTheme === "dark") embedQuery.set("theme", "dark");
  if (embedTheme === "transparent") embedQuery.set("transparent", "1");
  if (embedFont.trim()) embedQuery.set("font", embedFont.trim());
  const embedParams = embedQuery.toString() ? `?${embedQuery.toString()}` : "";
  // Iframe + listener pair: the embed posts its content height (jobflow:height)
  // and this script resizes the matching iframe — no scrollbars, no dead gap.
  const embedOrigin = baseUrl ? new URL(baseUrl).origin : "";
  const embedSnippet = `<iframe src="${baseUrl}/embed/${company.slug}${embedParams}" data-jobflow="${company.slug}" style="width:100%;max-width:560px;height:760px;border:0;" title="Request a service from ${company.name}"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${embedOrigin}"&&d&&d.type==="jobflow:height"&&d.slug==="${company.slug}"){var f=document.querySelector('iframe[data-jobflow="${company.slug}"]');if(f)f.style.height=d.height+"px";}});</script>`;

  async function copyBookingUrl() {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyEmbed() {
    await navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/app/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Booking Form</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 lg:ml-[30px]">
        What clients fill out on your booking page and embedded form
      </p>

      <div className="space-y-6">
        <BookingFormBuilder initial={company.bookingForm} />

        {/* Share link + embed */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Share Your Form</h2>
            <p className="text-xs text-gray-400 mt-0.5">Share this link on your website or Google profile</p>
          </div>
          <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded">
            <span className="text-sm font-mono text-gray-600 truncate flex-1">{bookingUrl}</span>
            <button type="button" onClick={copyBookingUrl}
              className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-600 hover:underline">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a href={bookingUrl} target="_blank" rel="noreferrer"
              className="shrink-0 text-gray-400 hover:text-gray-600">
              <ExternalLink size={13} />
            </a>
          </div>

          {/* Embeddable form */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Embed on your website</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Paste this code into your site — the form resizes itself to fit its content
                </p>
              </div>
              <button type="button" onClick={copyEmbed}
                className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-600 hover:underline">
                {embedCopied ? <Check size={12} /> : <Copy size={12} />}
                {embedCopied ? "Copied" : "Copy code"}
              </button>
            </div>
            <div className="flex items-center gap-1 mb-2">
              {([
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "transparent", label: "Transparent" },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEmbedTheme(t.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    embedTheme === t.value
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="text-[11px] text-gray-400 ml-2">
                Transparent inherits your website&apos;s background
              </span>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Match your website&apos;s font:</label>
              <input
                type="text"
                value={embedFont}
                onChange={(e) => setEmbedFont(e.target.value)}
                placeholder="e.g. Oxanium"
                className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500 w-40"
              />
              <span className="text-[11px] text-gray-400">
                Any{" "}
                <a href="https://fonts.google.com" target="_blank" rel="noreferrer" className="underline">
                  Google Font
                </a>{" "}
                name — added to the code automatically
              </span>
            </div>
            <pre className="p-3 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-600 whitespace-pre-wrap break-all">
              {embedSnippet}
            </pre>
            <a
              href={`${baseUrl}/embed/${company.slug}${embedParams}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-green-600 hover:underline"
            >
              <ExternalLink size={11} />
              Preview this theme
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
