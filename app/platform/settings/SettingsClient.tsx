"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, Upload, Trash2 } from "lucide-react";
import { resizeImageFile } from "@/lib/resize-image";
import { INDUSTRIES } from "@/lib/pricebooks";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

type Company = {
  id: string; name: string; slug: string; phone: string | null;
  email: string | null; address: string | null; city: string | null;
  state: string | null; zip: string | null; website: string | null;
  logoUrl: string | null; brandColor: string | null;
  surchargeEnabled: boolean; surchargeRate: string | number | null;
  defaultDepositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
  defaultDepositValue: string | number | null;
  reviewLink: string | null; industry: string | null;
  timezone: string;
};

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

function PortalLinkCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 card-ledger p-5 mb-6">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Client Portal Sign-In
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Clients enter their email at this page and get their portal link — put it on your
          website or in your email signature.
        </p>
        <p className="text-xs font-mono text-gray-600 mt-1.5 truncate">/portal/{slug}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}/portal/${slug}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-sm font-medium text-green-600 hover:underline shrink-0"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

export default function SettingsClient({ company }: { company: Company }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState({
    name: company.name,
    phone: company.phone ?? "",
    email: company.email ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    zip: company.zip ?? "",
    website: company.website ?? "",
    industry: company.industry ?? "",
    logoUrl: company.logoUrl ?? "",
    brandColor: company.brandColor ?? "",
    surchargeEnabled: company.surchargeEnabled,
    surchargeRate: company.surchargeRate ? (Number(company.surchargeRate) * 100).toFixed(2) : "3.00",
    defaultDepositType: company.defaultDepositType ?? "NONE",
    defaultDepositValue: company.defaultDepositValue != null ? String(Number(company.defaultDepositValue)) : "",
    reviewLink: company.reviewLink ?? "",
    timezone: company.timezone ?? "America/Chicago",
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
    setSaved(false);
  }

  useUnsavedWarning(dirty);

  async function uploadLogo(file: File) {
    setLogoError("");

    if (file.size > 15 * 1024 * 1024) {
      setLogoError("That file is over 15MB — please use a smaller image.");
      return;
    }

    setLogoBusy(true);
    try {
      // Animated GIFs pass through untouched (canvas would freeze the first
      // frame); everything else gets downscaled + compressed client-side.
      let payload: { blob: Blob; filename: string };
      if (file.type === "image/gif" && file.size <= 2 * 1024 * 1024) {
        payload = { blob: file, filename: file.name };
      } else if (file.type === "image/gif") {
        setLogoError("Animated GIFs must be under 2MB. Use a PNG or JPG for larger logos.");
        return;
      } else {
        payload = await resizeImageFile(file);
      }

      const fd = new FormData();
      fd.append("file", new File([payload.blob], payload.filename, { type: payload.blob.type }));
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
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business profile and configuration</p>
      </div>

      {/* AI setup assistant */}
      <Link
        href="/app/setup"
        className="flex items-center justify-between card-ledger p-5 mb-6 hover:shadow-sm transition-shadow"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Setup Assistant
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Draft your prices, hours, service area, and booking form from a few questions — run
            it anytime
          </p>
        </div>
        <span className="text-sm font-medium text-green-600">Run →</span>
      </Link>

      {/* Price book */}
      <Link
        href="/app/settings/products"
        className="flex items-center justify-between card-ledger p-5 mb-6 hover:shadow-sm transition-shadow"
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

      {/* Contract templates */}
      <Link
        href="/app/settings/contracts"
        className="flex items-center justify-between card-ledger p-5 mb-6 hover:shadow-sm transition-shadow"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Contract Templates
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Reusable service agreements clients e-sign from a link
          </p>
        </div>
        <span className="text-sm font-medium text-green-600">Manage →</span>
      </Link>

      {/* Booking form */}
      <Link
        href="/app/settings/booking"
        className="flex items-center justify-between card-ledger p-5 mb-6 hover:shadow-sm transition-shadow"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Booking Form
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Customize your request form and get the embed code for your website
          </p>
        </div>
        <span className="text-sm font-medium text-green-600">Manage →</span>
      </Link>

      <PortalLinkCard slug={company.slug} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business info */}
        <div className="card-ledger p-5 space-y-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <select value={INDUSTRIES.includes(form.industry as (typeof INDUSTRIES)[number]) ? form.industry : form.industry ? "Other" : ""}
              onChange={(e) => set("industry", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option value="">Not set</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Changing this doesn&apos;t touch your price book — edit that in Products &amp; Services.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              {!TIMEZONES.some((tz) => tz.value === form.timezone) && (
                <option value={form.timezone}>{form.timezone}</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Used for scheduling and recurring billing dates.
            </p>
          </div>
        </div>

        {/* Branding */}
        <div className="card-ledger p-5 space-y-4">
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
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50"
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
              Any PNG, JPG, WebP, or GIF up to 15MB — it&apos;s optimized automatically.
              Transparent-background PNG looks best.
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
        <div className="card-ledger p-5 space-y-4">
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

        {/* Default deposit */}
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Default Deposit</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Applied to quotes when a service has no deposit of its own. Set per-service deposits in
              Products &amp; Services.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit</label>
              <select
                value={form.defaultDepositType}
                onChange={(e) => set("defaultDepositType", e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="NONE">No default deposit</option>
                <option value="PERCENT">Percentage of total</option>
                <option value="FIXED">Fixed amount</option>
                <option value="FULL">Full payment upfront</option>
              </select>
            </div>
            {(form.defaultDepositType === "PERCENT" || form.defaultDepositType === "FIXED") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.defaultDepositType === "PERCENT" ? "Percent (0–100)" : "Amount ($)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step={form.defaultDepositType === "PERCENT" ? "1" : "0.01"}
                  max={form.defaultDepositType === "PERCENT" ? "100" : undefined}
                  value={form.defaultDepositValue}
                  onChange={(e) => set("defaultDepositValue", e.target.value)}
                  placeholder={form.defaultDepositType === "PERCENT" ? "25" : "100.00"}
                  className="w-28 px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">
            On approval, the deposit is billed to the client as its own invoice; the final invoice
            then subtracts what they&apos;ve already paid.
          </p>
        </div>

        {/* Review requests */}
        <div className="card-ledger p-5 space-y-4">
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

        <div>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
