"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, Copy, ExternalLink, Upload, Trash2 } from "lucide-react";

type Company = {
  id: string; name: string; slug: string; phone: string | null;
  email: string | null; address: string | null; city: string | null;
  state: string | null; zip: string | null; website: string | null;
  logoUrl: string | null; brandColor: string | null;
  surchargeEnabled: boolean; surchargeRate: string | number | null;
  reviewLink: string | null;
};

export default function SettingsClient({ company }: { company: Company }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<"light" | "dark" | "transparent">("light");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: company.name,
    phone: company.phone ?? "",
    email: company.email ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    zip: company.zip ?? "",
    website: company.website ?? "",
    logoUrl: company.logoUrl ?? "",
    brandColor: company.brandColor ?? "",
    surchargeEnabled: company.surchargeEnabled,
    surchargeRate: company.surchargeRate ? (Number(company.surchargeRate) * 100).toFixed(2) : "3.00",
    reviewLink: company.reviewLink ?? "",
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function uploadLogo(file: File) {
    setLogoError("");
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/app/settings/logo", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLogoError(data?.error ?? "Upload failed. Please try again.");
        return;
      }
      set("logoUrl", data.logoUrl);
      router.refresh();
    } catch {
      setLogoError("Upload failed. Please try again.");
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      await fetch("/api/app/settings/logo", { method: "DELETE" });
      set("logoUrl", "");
      router.refresh();
    } finally {
      setLogoBusy(false);
    }
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const bookingUrl = `${baseUrl}/book/${company.slug}`;
  const embedParams =
    embedTheme === "dark" ? "?theme=dark" : embedTheme === "transparent" ? "?transparent=1" : "";
  const embedSnippet = `<iframe src="${baseUrl}/embed/${company.slug}${embedParams}" style="width:100%;max-width:560px;height:780px;border:0;" title="Request a service from ${company.name}"></iframe>`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch("/api/app/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        surchargeRate: parseFloat(form.surchargeRate) / 100,
      }),
    });

    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  async function copyBookingUrl() {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [embedCopied, setEmbedCopied] = useState(false);
  async function copyEmbed() {
    await navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business profile and configuration</p>
      </div>

      {/* Price book */}
      <Link
        href="/app/settings/products"
        className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-5 mb-6 hover:shadow-sm transition-shadow"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Products &amp; Services
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Your price book — items autocomplete on quotes and invoices
          </p>
        </div>
        <span className="text-sm font-medium text-green-600">Manage →</span>
      </Link>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business info */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Business Info</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
            <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" value={form.city} onChange={(e) => set("city", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input type="text" value={form.state} onChange={(e) => set("state", e.target.value)}
                maxLength={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 uppercase" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input type="url" value={form.website} onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>

        {/* Branding */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Branding</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Shown on everything your clients see — quotes, invoices, the client hub, and booking forms
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
              }}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoBusy}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {logoBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {form.logoUrl ? "Replace Logo" : "Upload Logo"}
              </button>
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={logoBusy}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              )}
            </div>
            {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
            <p className="text-xs text-gray-400 mt-1">
              PNG, JPG, WebP, or GIF up to 1MB. Transparent-background PNG looks best.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.brandColor || "#16A34A"}
                onChange={(e) => set("brandColor", e.target.value)}
                className="h-10 w-14 rounded border border-gray-300 cursor-pointer p-1"
              />
              <span className="text-sm font-mono text-gray-600">
                {form.brandColor || "Default"}
              </span>
              {form.brandColor && (
                <button
                  type="button"
                  onClick={() => set("brandColor", "")}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Reset to default
                </button>
              )}
            </div>
          </div>
          {(form.logoUrl || form.brandColor) && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
              <div
                className="rounded-lg px-5 py-4 flex items-center gap-3"
                style={{ backgroundColor: form.brandColor || "#0C0F0C" }}
              >
                {form.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo preview" className="h-9 w-auto max-w-[120px] object-contain" />
                )}
                <span className="font-bold text-white drop-shadow-sm">{form.name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Surcharging */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Card Surcharging</h2>
            <p className="text-xs text-gray-400 mt-0.5">Pass card processing fees to your customer</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set("surchargeEnabled", !form.surchargeEnabled)}
              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${
                form.surchargeEnabled ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                  form.surchargeEnabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </div>
            <span className="text-sm text-gray-700">Enable surcharging</span>
          </label>
          {form.surchargeEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Surcharge rate</label>
              <div className="flex items-center gap-2">
                <input type="number" value={form.surchargeRate} onChange={(e) => set("surchargeRate", e.target.value)}
                  min="0" max="10" step="0.01"
                  className="w-24 px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <span className="text-sm text-gray-500">% added to card payments</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Example: on a $500 invoice, customer pays ${(500 * (1 + parseFloat(form.surchargeRate || "0") / 100)).toFixed(2)} by card
              </p>
            </div>
          )}
        </div>

        {/* Review requests */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Review Requests</h2>
            <p className="text-xs text-gray-400 mt-0.5">Automatically ask for a Google review after payment</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google review link</label>
            <input type="url" value={form.reviewLink} onChange={(e) => set("reviewLink", e.target.value)}
              placeholder="https://g.page/r/..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-gray-400 mt-1">Find this in your Google Business Profile → Get more reviews</p>
          </div>
        </div>

        {/* Booking widget */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Online Booking Widget</h2>
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
                  Paste this code into your site to show the request form directly on your page
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

        <div>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
