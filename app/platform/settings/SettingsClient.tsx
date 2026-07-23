"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Loader2, Check, Upload, Trash2, AlertTriangle, ChevronRight } from "lucide-react";
import { resizeImageFile } from "@/lib/resize-image";
import { INDUSTRIES } from "@/lib/pricebooks";
import { DEFAULT_ON_MY_WAY_TEMPLATE, ON_MY_WAY_PLACEHOLDERS } from "@/lib/messaging";
import { textOn } from "@/lib/branding";
import { resolveWallpaper } from "@/lib/wallpapers";
import { FilterChip } from "@/components/FilterChips";
import {
  SECTION_HUES,
  SECTION_HUE_DEFAULTS,
  SECTION_KEYS,
  SECTION_LABELS,
  type SectionKey,
} from "@/lib/section-colors";

type Company = {
  id: string; name: string; slug: string; phone: string | null;
  email: string | null; address: string | null; city: string | null;
  state: string | null; zip: string | null; website: string | null;
  logoUrl: string | null; brandColor: string | null; brandColorSecondary: string | null;
  documentColor: string | null;
  sectionColors: Record<string, string> | null;
  logoWallpaper: boolean; wallpaper: string | null;
  sidebarTheme: string; sidebarLogoColor: string | null;
  surchargeEnabled: boolean; surchargeRate: string | number | null;
  defaultDepositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
  defaultDepositValue: string | number | null;
  reviewLink: string | null; industry: string | null;
  onMyWayTemplate: string | null;
  timezone: string;
  assistantName: string | null;
  schedulingIntervalMinutes: number | null;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Wallpaper picker options (Company.wallpaper — see lib/wallpapers.ts).
// The logo options only render when a logo is uploaded.
const WALLPAPER_CHOICES: [string, string][] = [
  ["none", "None"],
  ["logo", "Logo — tilted"],
  ["logo-straight", "Logo — straight"],
  ["grid", "Graph paper"],
  ["dots", "Dot grid"],
];

/** Color picker + typed hex code, kept in sync. Empty = default. */
function ColorField({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = text !== "" && !HEX_RE.test(text);

  function commitText(raw: string) {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = `#${v}`;
    setText(v);
    if (v === "") onChange("");
    else if (HEX_RE.test(v)) onChange(v.toUpperCase());
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 shrink-0 rounded-lg border border-gray-300 cursor-pointer p-1"
        />
        <input
          type="text"
          value={text}
          onChange={(e) => commitText(e.target.value)}
          placeholder={fallback}
          maxLength={7}
          spellCheck={false}
          className={`w-28 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 ${
            invalid ? "border-red-400" : "border-gray-300"
          }`}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reset
          </button>
        )}
      </div>
      <p className={`text-xs mt-1 ${invalid ? "text-red-600" : "text-gray-400"}`}>
        {invalid ? "Use a 6-digit hex code like #16A34A" : hint}
      </p>
    </div>
  );
}

// Section filter for the settings page — every card belongs to one bucket
const SECTION_TABS = [
  ["all", "All"],
  ["business", "Business"],
  ["customization", "Customization"],
  ["payments", "Payments"],
  ["features", "Features"],
] as const;
type Section = (typeof SECTION_TABS)[number][0];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

/**
 * Online payments setup (Finix merchant onboarding). Status comes from
 * GET /api/app/settings/payments — which also re-syncs from Finix, so
 * loading this card is what keeps onboarding state fresh. Hidden entirely
 * while the platform processor isn't live (pre-launch).
 */
function PaymentsOnlineCard({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<{
    available: boolean;
    environment?: "sandbox" | "live";
    started?: boolean;
    state?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/app/settings/payments")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setStatus(d);
        })
        .catch(() => {});
    load();
    // While underwriting runs (sandbox auto-approves in ~2 min), keep
    // checking so the card flips to "enabled" without a reload.
    const t = setInterval(() => {
      setStatus((s) => {
        if (s?.state === "PROVISIONING") load();
        return s;
      });
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function openSetup() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/settings/payments", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't start payment setup. Please try again.");
        return;
      }
      window.open(data.url, "_blank", "noopener");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Sandbox-only: provision a test merchant from canned data, skipping the
  // application form entirely. The server refuses this outside sandbox.
  async function testApprove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/settings/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-approve" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Test approval failed. Please try again.");
        return;
      }
      setStatus((s) => (s ? { ...s, started: true, state: data?.state ?? "PROVISIONING" } : s));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Pre-launch (processor not configured) — say nothing rather than tease
  if (!status || !status.available) return null;

  const state = status.state ?? null;
  const approved = state === "APPROVED";

  return (
    <div className="card-ledger p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Online Payments
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Let clients pay invoices by card or bank transfer, straight from their pay link
          </p>
        </div>
        {status.environment === "sandbox" && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            Test mode
          </span>
        )}
      </div>

      {approved ? (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <Check size={15} />
          <span>
            Online payments are <span className="font-semibold">enabled</span> — payouts go to
            the bank account from your application.
          </span>
        </div>
      ) : state === "PROVISIONING" ? (
        <p className="text-sm text-gray-600">
          Your application is <span className="font-medium">under review</span> — most are
          approved within 1–2 business days. We&apos;ll notify you the moment it clears.
        </p>
      ) : state === "REJECTED" ? (
        <p className="text-sm text-red-600">
          Your application couldn&apos;t be approved. Contact support and we&apos;ll help sort
          it out.
        </p>
      ) : state === "UPDATE_REQUESTED" ? (
        <p className="text-sm text-amber-700">
          The underwriter needs a little more information — reopen your application to finish
          up.
        </p>
      ) : status.started ? (
        <p className="text-sm text-gray-600">
          Your application is <span className="font-medium">started but not submitted</span> —
          pick up where you left off.
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          A short application (business details + the bank account for payouts). Most
          businesses are approved within 1–2 days.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!approved && state !== "PROVISIONING" && state !== "REJECTED" && (
        isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openSetup}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-40"
            >
              {busy && <Loader2 size={11} className="animate-spin" />}
              {state === "UPDATE_REQUESTED" || status.started
                ? "Continue application"
                : "Set up payments"}
            </button>
            {status.environment === "sandbox" && (
              <button
                onClick={testApprove}
                disabled={busy}
                title="Sandbox only: provisions a merchant from canned test data — no form"
                className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-full transition-colors disabled:opacity-40"
              >
                {busy && <Loader2 size={11} className="animate-spin" />}
                Skip form — instant test approval
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            Only the account owner can set up payments.
          </p>
        )
      )}
    </div>
  );
}

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

/**
 * Owner-only, deliberately slow path to account deletion: expand the card,
 * retype the exact company name, re-enter the password, then confirm. The
 * server re-checks all three — this UI is friction, not the security.
 */
function DangerZone({ companyName }: { companyName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameMatches = confirmName === companyName;

  async function deleteAccount() {
    if (!nameMatches || !password || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/app/company/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName, password }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      setError(data?.error ?? "Something went wrong. Nothing was deleted.");
      return;
    }
    await signOut({ callbackUrl: "/" });
  }

  return (
    <div className="mt-10 rounded-lg border border-red-200 bg-red-50/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-700">
            <AlertTriangle size={14} />
            Danger Zone
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Permanently delete this account — every client, job, quote, invoice, payment record,
            and team member. There is no undo and no recovery.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Delete account…
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-red-200 pt-4">
          <p className="text-sm text-gray-700">
            To confirm, type the company name exactly —{" "}
            <span className="font-semibold">{companyName}</span> — and enter your password.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Company name</label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={companyName}
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {confirmName && !nameMatches && (
              <p className="mt-1 text-xs text-red-600">Doesn&apos;t match yet — it&apos;s case-sensitive.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Your password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={!nameMatches || !password || busy}
              className="flex items-center gap-2 rounded-[10px] bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Permanently delete everything
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmName("");
                setPassword("");
                setError("");
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsClient({
  company,
  isOwner = false,
}: {
  company: Company;
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoDragOver, setLogoDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>("all");
  const show = (s: Section) => section === "all" || section === s;
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
    wallpaper: resolveWallpaper(company.wallpaper, company.logoWallpaper ?? false),
    sidebarTheme: company.sidebarTheme ?? "black",
    sidebarLogoColor: company.sidebarLogoColor ?? "",
    brandColor: company.brandColor ?? "",
    brandColorSecondary: company.brandColorSecondary ?? "",
    documentColor: company.documentColor ?? "",
    // Kept as a JSON string so the flat string-diff auto-save machinery works
    sectionColors: JSON.stringify(company.sectionColors ?? {}),
    surchargeEnabled: company.surchargeEnabled,
    surchargeRate: company.surchargeRate ? (Number(company.surchargeRate) * 100).toFixed(2) : "3.00",
    defaultDepositType: company.defaultDepositType ?? "NONE",
    defaultDepositValue: company.defaultDepositValue != null ? String(Number(company.defaultDepositValue)) : "",
    reviewLink: company.reviewLink ?? "",
    onMyWayTemplate: company.onMyWayTemplate ?? "",
    timezone: company.timezone ?? "America/Chicago",
    assistantName: company.assistantName ?? "",
    schedulingIntervalMinutes: String(company.schedulingIntervalMinutes ?? 30),
  });
  // Auto-save bookkeeping: savedRef is the last snapshot the server confirmed
  // (diffed against form so only changed fields go over the wire — the PATCH
  // route is partial-safe); formRef mirrors form for use inside async closures.
  const savedRef = useRef(form);
  const formRef = useRef(form);
  formRef.current = form;

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  // Advanced per-section hue overrides (Company.sectionColors) — the form
  // holds them as a JSON string; this is the parsed working copy.
  const [showSectionColors, setShowSectionColors] = useState(false);
  const sectionColorMap = useMemo(() => {
    try {
      const parsed = JSON.parse(form.sectionColors);
      return parsed && typeof parsed === "object"
        ? (parsed as Partial<Record<SectionKey, string>>)
        : {};
    } catch {
      return {} as Partial<Record<SectionKey, string>>;
    }
  }, [form.sectionColors]);
  function setSectionColor(key: SectionKey, hex: string) {
    const next = { ...sectionColorMap };
    if (hex) next[key] = hex;
    else delete next[key];
    set("sectionColors", JSON.stringify(next));
  }

  // Appearance is a per-DEVICE preference (localStorage, not the database):
  // field phones want their own light/dark choice, and it must apply with no
  // network round-trip. The head script in app/layout.tsx owns the stamping;
  // applyHubTheme() re-reads localStorage + system setting.
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("hub-theme");
      if (t === "light" || t === "dark") setAppearance(t);
    } catch {}
  }, []);
  function pickAppearance(v: "system" | "light" | "dark") {
    setAppearance(v);
    try {
      if (v === "system") localStorage.removeItem("hub-theme");
      else localStorage.setItem("hub-theme", v);
    } catch {}
    (window as unknown as { applyHubTheme?: () => void }).applyHubTheme?.();
  }

  // Debounced auto-save: edits land on the server ~800ms after the last
  // change — there is no Save button. router.refresh() re-renders the shell
  // so sidebar/branding changes apply immediately.
  useEffect(() => {
    const changed: Partial<typeof form> = {};
    for (const key of Object.keys(form) as (keyof typeof form)[]) {
      if (form[key] !== savedRef.current[key]) {
        (changed as Record<string, unknown>)[key] = form[key];
      }
    }
    if (Object.keys(changed).length === 0) return;

    const t = setTimeout(async () => {
      const payload: Record<string, unknown> = { ...changed };
      // Same transforms the old Save button applied
      if ("surchargeRate" in payload || "surchargeEnabled" in payload) {
        payload.surchargeEnabled = form.surchargeEnabled;
        payload.surchargeRate = parseFloat(form.surchargeRate) / 100;
      }
      if ("defaultDepositType" in payload || "defaultDepositValue" in payload) {
        payload.defaultDepositType = form.defaultDepositType;
        payload.defaultDepositValue = form.defaultDepositValue;
      }
      // Stored as a JSON string in the form (string diffing) — the API wants
      // the object
      if ("sectionColors" in payload) {
        try {
          payload.sectionColors = JSON.parse(form.sectionColors);
        } catch {
          delete payload.sectionColors;
        }
      }

      setSaving(true);
      setSaveError("");
      let ok = false;
      try {
        const res = await fetch("/api/app/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        ok = res.ok;
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setSaveError(data?.error ?? "Couldn't save your changes. Please try again.");
        }
      } catch {
        setSaveError("Couldn't reach the server. Check your connection and try again.");
      }
      setSaving(false);
      if (!ok) return;

      savedRef.current = { ...savedRef.current, ...changed };
      // Edits made while the request was in flight reschedule themselves;
      // otherwise flash the Saved indicator.
      const settled = (Object.keys(formRef.current) as (keyof typeof form)[]).every(
        (k) => formRef.current[k] === savedRef.current[k]
      );
      if (settled) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
      router.refresh();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, router]);

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

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">
            Manage your business profile — changes save automatically
          </p>
          {saveError && <p className="mt-1 text-sm text-red-600">{saveError}</p>}
        </div>
        <span
          className="flex shrink-0 items-center gap-1.5 pt-2 text-xs font-medium text-gray-400"
          aria-live="polite"
        >
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving…
            </>
          ) : saved ? (
            <>
              <Check size={12} className="text-green-600" /> Saved
            </>
          ) : null}
        </span>
      </div>

      {/* Section filter — the page got crowded; pills narrow it down */}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
        {SECTION_TABS.map(([key, label]) => (
          <FilterChip
            key={key}
            hue={SECTION_HUES.business}
            active={section === key}
            onClick={() => setSection(key)}
          >
            {label}
          </FilterChip>
        ))}
      </div>

      {show("features") && (
      <>
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

      {/* Lead pipeline */}
      <Link
        href="/app/settings/pipeline"
        className="flex items-center justify-between card-ledger p-5 mb-6 hover:shadow-sm transition-shadow"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Lead Pipeline
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Customize your Leads board stages and connect ad platforms via the lead webhook
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
      </>
      )}

      {show("business") && <PortalLinkCard slug={company.slug} />}

      <div className="space-y-6">
        {/* Business info */}
        {show("business") && (
        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Business Info</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
            <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" value={form.city} onChange={(e) => set("city", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input type="text" value={form.state} onChange={(e) => set("state", e.target.value)}
                maxLength={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 uppercase" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input type="url" value={form.website} onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <select value={INDUSTRIES.includes(form.industry as (typeof INDUSTRIES)[number]) ? form.industry : form.industry ? "Other" : ""}
              onChange={(e) => set("industry", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
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
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scheduling time slots
            </label>
            <select
              value={form.schedulingIntervalMinutes}
              onChange={(e) => set("schedulingIntervalMinutes", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Time options offered when you schedule jobs and appointments.
            </p>
          </div>
        </div>
        )}

        {/* Appearance — per-device light/dark (phones AND desktop; Automatic
            follows the OS setting either way) */}
        {show("customization") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Appearance</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Light or dark for this device — Automatic follows your device&apos;s setting
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["system", "Automatic"],
                ["light", "Light"],
                ["dark", "Dark"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => pickAppearance(value)}
                className={`rounded-[10px] border px-3.5 py-2 text-sm font-medium transition-colors ${
                  appearance === value
                    ? "border-green-500 ring-2 ring-green-500/30 text-gray-900"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Branding */}
        {show("customization") && (
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
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setLogoDragOver(true);
              }}
              onDragLeave={() => setLogoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setLogoDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  setLogoError("That doesn't look like an image — use a PNG, JPG, WebP, or GIF.");
                  return;
                }
                uploadLogo(file);
              }}
              className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
                logoDragOver ? "border-green-500 bg-green-50" : "border-gray-300"
              }`}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoBusy}
                className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {logoBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {form.logoUrl ? "Replace Logo" : "Upload Logo"}
              </button>
              <span className="text-xs text-gray-400">…or drag &amp; drop an image here</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Wallpaper</label>
            <p className="text-xs text-gray-400 mb-2">
              A subtle backdrop behind every page of the app — your team sees it, clients never do
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2">
              {WALLPAPER_CHOICES.map(([value, label]) =>
                value.startsWith("logo") && !form.logoUrl ? null : (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("wallpaper", value)}
                    className={`rounded-lg border p-1.5 transition-colors ${
                      form.wallpaper === value
                        ? "border-green-500 ring-2 ring-green-500/30"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="relative h-12 overflow-hidden rounded-md border border-gray-100 bg-white">
                      {value.startsWith("logo") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.logoUrl}
                          alt=""
                          className={`h-full w-full object-contain opacity-30 ${
                            value === "logo" ? "rotate-45 scale-125" : "scale-90"
                          }`}
                        />
                      ) : value !== "none" ? (
                        <div className={`wp-preview wp-${value} absolute inset-0`} />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-center text-[11px] font-medium text-gray-600">
                      {label}
                    </p>
                  </button>
                )
              )}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <ColorField
              label="Primary color"
              hint="Your main brand color — the app's outlines, frame, and surfaces"
              value={form.brandColor}
              fallback="#0C0F0C"
              onChange={(v) => set("brandColor", v)}
            />
            <ColorField
              label="Secondary color"
              hint="Buttons, links, and accents — defaults to your primary color"
              value={form.brandColorSecondary}
              fallback={form.brandColor || "#16A34A"}
              onChange={(v) => set("brandColorSecondary", v)}
            />
            <ColorField
              label="Quotes & invoices color"
              hint="Headers on client-facing pages and emails — quotes, invoices, the client hub. Defaults to your primary color."
              value={form.documentColor}
              fallback={form.brandColor || "#0C0F0C"}
              onChange={(v) => set("documentColor", v)}
            />
          </div>

          {/* Advanced: the app's per-section color language */}
          <div className="border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setShowSectionColors((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${showSectionColors ? "rotate-90" : ""}`}
              />
              Section colors
              <span className="text-xs font-normal text-gray-400">Advanced</span>
            </button>
            {showSectionColors && (
              <>
                <p className="mt-1.5 text-xs text-gray-400">
                  The app color-codes each area — nav tiles, page headings, active
                  filters. Override any of them here. Picks that are too light for
                  the light theme or too dark for the dark theme are automatically
                  adjusted so they always stay readable.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                  {SECTION_KEYS.map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={sectionColorMap[k] ?? SECTION_HUE_DEFAULTS[k]}
                        onChange={(e) => setSectionColor(k, e.target.value.toUpperCase())}
                        aria-label={`${SECTION_LABELS[k]} color`}
                        className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-gray-300 p-0.5"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
                        {SECTION_LABELS[k]}
                      </span>
                      {sectionColorMap[k] && (
                        <button
                          type="button"
                          onClick={() => setSectionColor(k, "")}
                          className="text-[11px] text-gray-400 underline hover:text-gray-600"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {Object.keys(sectionColorMap).length > 0 && (
                  <button
                    type="button"
                    onClick={() => set("sectionColors", "{}")}
                    className="mt-3 text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Reset all to defaults
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        )}

        {/* Sidebar — desktop-only chrome, so the card hides on phones */}
        {show("customization") && (
        <div className="hidden lg:block card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Sidebar</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              How the desktop navigation rail looks for your whole team
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sidebar color</label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["black", "Black", "#0C0F0C"],
                  ["white", "White", "#FFFFFF"],
                  ["gray", "Gray", "#F1F2F4"],
                ] as const
              ).map(([value, label, hex]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("sidebarTheme", value)}
                  className={`flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-sm font-medium transition-colors ${
                    form.sidebarTheme === value
                      ? "border-green-500 ring-2 ring-green-500/30 text-gray-900"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-gray-300"
                    style={{ backgroundColor: hex }}
                  />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              A neutral rail keeps buttons and your brand accents standing out.
            </p>
          </div>
          {form.logoUrl && (
            <ColorField
              label="Logo backdrop"
              hint="Panel color behind your logo at the top of the sidebar"
              value={form.sidebarLogoColor}
              fallback="#FFFFFF"
              onChange={(v) => set("sidebarLogoColor", v)}
            />
          )}
        </div>
        )}

        {/* What your clients see — live branding preview of the client-facing
            surfaces. Client pages are always light, so the mock pins its own
            colors (arbitrary values dodge the dark-theme utility remap). */}
        {show("customization") && (
        <div className="hidden lg:block card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              What Your Clients See
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Live preview of your branding on quotes, invoices, the client hub, and emails
            </p>
          </div>
          <div className="theme-fixed overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* Client page header — the document color wins, like the live pages */}
            <div
              className="flex items-center gap-3 px-5 py-4"
              style={{ backgroundColor: form.documentColor || form.brandColor || "#0C0F0C" }}
            >
              {form.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoUrl}
                  alt=""
                  className="h-10 w-auto max-w-[150px] object-contain"
                />
              )}
              <span
                className="font-display font-bold text-[15px]"
                style={{ color: textOn(form.documentColor || form.brandColor || "#0C0F0C") }}
              >
                {form.name}
              </span>
            </div>
            {/* Quote body */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Quote #1042
                </p>
                <p className="text-lg font-semibold text-[#111827]">$1,250.00</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-4 py-2 text-xs font-semibold"
                  style={{
                    backgroundColor: form.brandColorSecondary || form.brandColor || "#16A34A",
                    color: textOn(form.brandColorSecondary || form.brandColor || "#16A34A"),
                  }}
                >
                  Approve Quote
                </span>
                <span className="rounded-full border border-[#D1D5DB] px-4 py-2 text-xs font-semibold text-[#374151]">
                  Ask a Question
                </span>
              </div>
            </div>
            {/* Email sender */}
            <div className="border-t border-[#F3F4F6] bg-[#FAFAFA] px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                Email
              </p>
              <p className="text-sm font-medium text-[#111827]">
                {form.name}{" "}
                <span className="font-normal text-[#9CA3AF]">
                  &lt;notifications@workbenchfsm.com&gt;
                </span>
              </p>
              <p className="text-xs text-[#6B7280]">
                Your quote from {form.name} is ready — Quote #1042
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Online payments (Finix) */}
        {show("payments") && <PaymentsOnlineCard isOwner={isOwner} />}

        {/* QuickBooks */}
        {show("payments") && (
        <Link
          href="/app/settings/quickbooks"
          className="flex items-center justify-between card-ledger p-5 hover:shadow-sm transition-shadow"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              QuickBooks Online
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Sync clients, invoices, and payments into QuickBooks automatically
            </p>
          </div>
          <span className="text-sm font-medium text-green-600">Manage →</span>
        </Link>
        )}

        {/* Surcharging */}
        {show("payments") && (
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
                  className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <span className="text-sm text-gray-500">% added to card payments</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Example: on a $500 invoice, customer pays ${(500 * (1 + parseFloat(form.surchargeRate || "0") / 100)).toFixed(2)} by card
              </p>
            </div>
          )}
        </div>
        )}

        {/* Default deposit */}
        {show("payments") && (
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
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  className="w-28 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">
            On approval, the deposit is billed to the client as its own invoice; the final invoice
            then subtracts what they&apos;ve already paid.
          </p>
        </div>
        )}

        {/* AI assistant */}
        {show("features") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">AI Assistant</h2>
            <p className="text-xs text-gray-400 mt-0.5">The chat helper in the corner of every page</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assistant name</label>
            <input type="text" value={form.assistantName} onChange={(e) => set("assistantName", e.target.value)}
              placeholder="Atlas" maxLength={40}
              className="w-full max-w-xs px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-gray-400 mt-1">Give it a name that fits your business — leave blank for Atlas</p>
          </div>
        </div>
        )}

        {/* On my way texts */}
        {show("features") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              &ldquo;On My Way&rdquo; Texts
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              The message behind the On My Way button on a job — it opens in your team
              member&apos;s own texting app, prefilled and editable, so it&apos;s free to send
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message template</label>
            <textarea
              value={form.onMyWayTemplate}
              onChange={(e) => set("onMyWayTemplate", e.target.value)}
              placeholder={DEFAULT_ON_MY_WAY_TEMPLATE}
              rows={3}
              maxLength={320}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank to use the default. Placeholders fill in automatically:{" "}
              {ON_MY_WAY_PLACEHOLDERS.map(([tag], i) => (
                <span key={tag}>
                  {i > 0 && ", "}
                  <code className="font-mono text-gray-500">{tag}</code>
                </span>
              ))}
            </p>
          </div>
        </div>
        )}

        {/* Review requests */}
        {show("features") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Review Requests</h2>
            <p className="text-xs text-gray-400 mt-0.5">Automatically ask for a Google review after payment</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google review link</label>
            <input type="url" value={form.reviewLink} onChange={(e) => set("reviewLink", e.target.value)}
              placeholder="https://g.page/r/..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-gray-400 mt-1">Find this in your Google Business Profile → Get more reviews</p>
          </div>
        </div>
        )}
      </div>

      {isOwner && show("business") && <DangerZone companyName={company.name} />}
    </div>
  );
}
