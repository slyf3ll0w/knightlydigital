"use client";

import { Fragment, useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Loader2,
  Check,
  Upload,
  Trash2,
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Package,
  Palette,
  FileSignature,
  Filter,
  Globe,
  Phone,
  PhoneCall,
  RefreshCw,
  Tags,
  Sparkles,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  ADDON_LINK,
  QUICKBOOKS_LINK,
  SETTINGS_LINK_GROUPS,
  SETTINGS_SECTIONS,
  normalizeSettingsSection,
  settingsHref,
  type SettingsLink,
  type SettingsSection,
  type SettingsSectionKey,
} from "@/lib/settings-nav";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { Input, Textarea, Select } from "@/components/Input";
import { FlashBanner, useVerifyIdentity, type SignInMethods } from "@/components/VerifyIdentity";
import { resizeImageFile } from "@/lib/resize-image";
import { INDUSTRIES } from "@/lib/pricebooks";
import { DEFAULT_ON_MY_WAY_TEMPLATE, ON_MY_WAY_PLACEHOLDERS } from "@/lib/messaging";
import { textOn } from "@/lib/branding";
import { GOOGLE_FONT_RE } from "@/lib/booking-page";
import { resolveWallpaper } from "@/lib/wallpapers";
import { confirmSheet } from "@/components/ConfirmSheet";
import PageTitle from "@/components/PageTitle";
import SmsNotificationsCard from "./SmsNotificationsCard";
import BusinessLineCard from "./BusinessLineCard";
import type { LineSummary } from "@/lib/business-line-shared";
import {
  SECTION_HUES,
  SECTION_HUE_DEFAULTS,
  SECTION_KEYS,
  SECTION_LABELS,
  hueInk,
  type SectionKey,
} from "@/lib/section-colors";

type Company = {
  id: string; name: string; slug: string; phone: string | null;
  email: string | null; address: string | null; city: string | null;
  state: string | null; zip: string | null; website: string | null;
  about: string | null;
  logoUrl: string | null; brandColor: string | null; brandColorSecondary: string | null;
  documentColor: string | null;
  brandFont: string | null;
  sectionColors: Record<string, string> | null;
  logoWallpaper: boolean; wallpaper: string | null;
  sidebarTheme: string; sidebarLogoColor: string | null;
  sidebarLogoSize: number | null;
  surchargeEnabled: boolean; surchargeRate: string | number | null;
  addonEnabled: boolean;
  defaultDepositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
  defaultDepositValue: string | number | null;
  defaultTaxRate: string | number | null;
  quoteNumberStart: number; invoiceNumberStart: number;
  reviewLink: string | null; industry: string | null;
  onMyWayTemplate: string | null;
  timezone: string;
  assistantName: string | null;
  schedulingIntervalMinutes: number | null;
  smsAcknowledgedAt: string | null;
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
            className="text-xs text-gray-500 hover:text-gray-600 underline"
          >
            Reset
          </button>
        )}
      </div>
      <p className={`text-xs mt-1 ${invalid ? "text-red-600" : "text-gray-400"}`}>
        {invalid ? "Use a 6-digit hex code like #0B57D8" : hint}
      </p>
    </div>
  );
}

/**
 * Phone drill-in row — the iOS grouped-list idiom the More sheet uses:
 * section-hue icon tile, label + hint, right chevron. Rows stack inside one
 * card-ledger group per bucket; desktop keeps the classic "Manage →" cards.
 */
function SettingsLinkRow({
  href,
  label,
  sub,
  hue,
  icon: Icon,
}: {
  href: string;
  label: string;
  sub: string;
  hue: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-gray-100"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: hue, color: hueInk(hue) }}
      >
        <Icon size={17} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-gray-900">{label}</span>
        <span className="block truncate text-xs text-gray-500">{sub}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-gray-300" />
    </Link>
  );
}

/**
 * Settings IA — the pattern every mature product settles on:
 *  - Desktop: a left nav rail (Stripe/Linear style) that switches one
 *    section panel at a time. No more "everything stacked" scroll.
 *  - Phones: an index screen of grouped rows (the iOS Settings idiom) that
 *    pushes into one section at a time, with an in-page back control.
 * The open section rides in the URL (?s=…) so browser/edge back works and
 * sections are linkable. The list itself (sections, link groups, labels)
 * lives in lib/settings-nav.ts so the shell and ⌘K name things the same way;
 * this file only maps icon names to components and renders.
 */
type SectionId = SettingsSectionKey;
type Section = SectionId | "home";

const SECTION_ICONS: Record<SettingsSection["icon"], LucideIcon> = {
  Building2,
  Palette,
  Phone,
  CreditCard,
  Zap,
};

const LINK_ICONS: Record<SettingsLink["icon"], LucideIcon> = {
  Package,
  FileSignature,
  Tags,
  Filter,
  Globe,
  Users,
  Upload,
  UserRound,
  RefreshCw,
  Sparkles,
};

/** Desktop rail entry for a standalone page. */
function RailLink({ link }: { link: SettingsLink }) {
  const Icon = LINK_ICONS[link.icon];
  return (
    <Link
      href={link.href}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
    >
      <Icon size={16} style={{ color: SECTION_HUES[link.hueKey] }} />
      {link.label}
    </Link>
  );
}

/** Phone index / in-panel row for a standalone page. */
function LinkRow({ link }: { link: SettingsLink }) {
  return (
    <SettingsLinkRow
      href={link.href}
      label={link.label}
      sub={link.sub}
      hue={SECTION_HUES[link.hueKey]}
      icon={LINK_ICONS[link.icon]}
    />
  );
}

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
 * while the platform processor isn't live (pre-launch). Companies let in on
 * an invite code see a Coming-soon card instead of the application — online
 * payments open up for them once we switch them on (superadmin console).
 */
function PaymentsOnlineCard({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<{
    available: boolean;
    comingSoon?: boolean;
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

  // Pre-launch (processor not configured) — say nothing rather than tease
  if (!status || !status.available) return null;

  if (status.comingSoon) {
    return (
      <div className="card-ledger p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Online Payments</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Let clients pay invoices by card or bank transfer, straight from their pay link
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            Coming soon
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Card and bank payments aren&apos;t switched on for your account yet. Your invoices
          still send with a link the client can view and download, and you record payments
          you collect directly. We&apos;ll let you know the moment online payments open up
          for you.
        </p>
      </div>
    );
  }

  const state = status.state ?? null;
  const approved = state === "APPROVED";

  return (
    <div className="card-ledger p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            Online Payments
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Let clients pay invoices by card or bank transfer, straight from their pay link
          </p>
        </div>
        {status.environment === "sandbox" && (
          <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
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
              className="btn-primary"
            >
              {busy && <Loader2 size={11} className="animate-spin" />}
              {state === "UPDATE_REQUESTED" || status.started
                ? "Continue application"
                : "Set up payments"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Only the account owner can set up payments.
          </p>
        )
      )}
    </div>
  );
}

/**
 * Custom sending domain (send client emails from you@yourdomain.com instead of
 * the platform address). Backed by /api/app/settings/email-domain; that GET
 * returns { available: false } while EMAIL_DOMAINS_ENABLED is off, and the
 * card renders nothing — same hide-until-live pattern as PaymentsOnlineCard.
 */
function EmailDomainCard({ isOwner }: { isOwner: boolean }) {
  type DnsRecord = {
    record?: string;
    name: string;
    type: string;
    value: string;
    priority?: number;
    status?: string;
  };
  type DomainState = {
    available: boolean;
    domain?: string | null;
    status?: string | null;
    records?: DnsRecord[];
    fromLocal?: string;
    fromAddress?: string | null;
  };
  const [state, setState] = useState<DomainState | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [localInput, setLocalInput] = useState("notifications");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedValue, setCopiedValue] = useState("");

  useEffect(() => {
    fetch("/api/app/settings/email-domain")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
  }, []);

  async function call(init: RequestInit, fallbackError: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/settings/email-domain", init);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? fallbackError);
        return;
      }
      setState(data);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    call(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput, fromLocal: localInput }),
      },
      "Couldn't register the domain. Please try again."
    );
  const checkDns = () =>
    call(
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      },
      "Couldn't check the DNS records. Please try again."
    );
  async function remove() {
    if (
      !(await confirmSheet({
        title: "Remove this sending domain?",
        message: "Emails go back to the WorkBench address immediately.",
        confirmLabel: "Remove Domain",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/settings/email-domain", { method: "DELETE" });
      if (res.ok) setState((s) => (s ? { ...s, domain: null, status: null, records: [], fromAddress: null } : s));
      else setError("Couldn't remove the domain. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function copyValue(v: string) {
    await navigator.clipboard.writeText(v);
    setCopiedValue(v);
    setTimeout(() => setCopiedValue(""), 1500);
  }

  // Feature off (or still loading) — say nothing rather than tease
  if (!state?.available) return null;

  const verified = state.status === "verified";

  return (
    <div className="card-ledger p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            Email Sending Domain
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Send quotes, invoices, and reminders from your own email address instead of ours
          </p>
        </div>
        {state.domain && (
          <span
            className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
              verified
                ? "bg-green-100 text-green-700"
                : state.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {verified ? "Verified" : state.status === "failed" ? "Failed" : "Pending DNS"}
          </span>
        )}
      </div>

      {!state.domain ? (
        isOwner ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You&apos;ll add a few DNS records at your domain host to prove you own the domain —
              takes about 5 minutes. Emails keep sending from our address until it verifies, so
              nothing breaks in the meantime.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your domain</label>
                <Input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="summitplumbing.com"
                  className="w-full focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address prefix</label>
                <Input
                  type="text"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  placeholder="notifications"
                  className="w-full focus:ring-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {(localInput || "notifications").trim()}@{domainInput.trim() || "yourdomain.com"}
                </p>
              </div>
            </div>
            <button
              onClick={connect}
              disabled={busy || !domainInput.trim()}
              className="btn-primary"
            >
              {busy && <Loader2 size={11} className="animate-spin" />}
              Connect domain
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Only the account owner can set up a sending domain.</p>
        )
      ) : (
        <div className="space-y-3">
          {verified ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Check size={15} />
              <span>
                Client emails now send from{" "}
                <span className="font-mono font-semibold">{state.fromAddress}</span>
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Add these records at your domain host (GoDaddy, Cloudflare, Namecheap…), then check
              again. DNS changes can take up to an hour to propagate. Until it verifies, emails
              keep sending from the WorkBench address.
            </p>
          )}

          {!verified && (state.records?.length ?? 0) > 0 && (
            <>
              {/* Phones: each DNS record as a small stacked card */}
              <div className="lg:hidden space-y-2">
                {(state.records ?? []).map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border border-gray-200 p-3 ${
                      r.status === "verified" ? "text-green-700" : "text-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {r.type}
                      </span>
                      <button
                        onClick={() => copyValue(r.value)}
                        className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 transition-colors active:bg-gray-200"
                      >
                        {copiedValue === r.value ? (
                          <>
                            <Check size={12} className="text-green-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copy value
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Name
                    </p>
                    <p className="font-mono text-xs break-all">{r.name}</p>
                    <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Value
                    </p>
                    <p className="font-mono text-xs break-all">{r.value}</p>
                  </div>
                ))}
              </div>
              {/* Desktop keeps the table */}
              <div className="hidden lg:block overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] text-gray-500">
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Value</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(state.records ?? []).map((r, i) => (
                    <tr key={i} className={r.status === "verified" ? "text-green-700" : "text-gray-700"}>
                      <td className="px-3 py-2 font-mono">{r.type}</td>
                      <td className="px-3 py-2 font-mono break-all">{r.name}</td>
                      <td className="px-3 py-2 font-mono break-all max-w-[280px]">{r.value}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => copyValue(r.value)}
                          title="Copy value"
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {copiedValue === r.value ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {!verified && (
              <button
                onClick={checkDns}
                disabled={busy}
                className="btn-primary"
              >
                {busy && <Loader2 size={11} className="animate-spin" />}
                Check DNS now
              </button>
            )}
            {isOwner && (
              <button
                onClick={remove}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-red-600 hover:bg-red-50 text-xs font-semibold rounded-[10px] transition-colors disabled:opacity-40"
              >
                <Trash2 size={12} />
                Remove domain
              </button>
            )}
          </div>
        </div>
      )}
      {error && !state.domain && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PortalLinkCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 card-ledger p-5 mb-6">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-700">
          Client Portal Sign-In
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
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
 * retype the exact company name, verify it's you (password, or a fresh
 * Google sign-in for a login that has none — components/VerifyIdentity.tsx),
 * then confirm. The server re-checks all three — this UI is friction, not
 * the security.
 */
function DangerZone({ companyName, signInMethods }: { companyName: string; signInMethods: SignInMethods }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameMatches = confirmName === companyName;
  const { verify, flash, setFlash, pending, clearPending, dialog } = useVerifyIdentity(
    signInMethods,
    settingsHref("company")
  );
  // Back from a Google verification: reopen the card they were on.
  useEffect(() => {
    if (pending === "delete-account") {
      setOpen(true);
      clearPending();
    }
  }, [pending, clearPending]);

  async function deleteAccount() {
    if (!nameMatches || busy) return;
    setError("");
    if (!(await verify("delete-account"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/app/company/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Nothing was deleted.");
        return;
      }
      await signOut({ callbackUrl: "/" });
    } catch {
      setError("Couldn't reach the server. Nothing was deleted — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-lg border border-red-200 bg-red-50/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700">
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
          <FlashBanner flash={flash} onClose={() => setFlash(null)} />
          <p className="text-sm text-gray-700">
            To confirm, type the company name exactly —{" "}
            <span className="font-semibold">{companyName}</span>. You&apos;ll be asked to verify
            it&apos;s you before anything is deleted.
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
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={!nameMatches || busy}
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
                setError("");
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

export default function SettingsClient({
  company,
  isOwner = false,
  initialSection,
  signInMethods,
  line = null,
  lastNumbers = { quote: 0, invoice: 0 },
}: {
  company: Company;
  isOwner?: boolean;
  initialSection?: string;
  /** Business line state (lib/business-line.ts); null when Telnyx isn't configured on this server. */
  line?: LineSummary | null;
  /** Highest quote / invoice number used so far (Numbering card). */
  lastNumbers?: { quote: number; invoice: number };
  /** How the signed-in person can verify it's them (account deletion). */
  signInMethods: SignInMethods;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoDragOver, setLogoDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The open section mirrors the URL (?s=…) so back/edge-swipe and deep
  // links work; local state keeps the switch instant while the route settles.
  // Old keys (?s=features, ?s=customization, ?s=business) map to their new
  // homes — page.tsx already redirects them, this is the belt to its braces.
  const normalizedSection: Section = normalizeSettingsSection(initialSection) ?? "home";
  const [section, setSection] = useState<Section>(normalizedSection);
  useEffect(() => setSection(normalizedSection), [normalizedSection]);
  // Desktop always shows a panel — "home" (the phone index) reads as Company
  const active: SectionId = section === "home" ? "company" : section;
  const show = (s: SectionId) => active === s;
  function goSection(s: Section) {
    setSection(s);
    router.push(s === "home" ? settingsHref() : settingsHref(s));
  }
  const [form, setForm] = useState({
    name: company.name,
    phone: company.phone ?? "",
    email: company.email ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    zip: company.zip ?? "",
    website: company.website ?? "",
    about: company.about ?? "",
    industry: company.industry ?? "",
    logoUrl: company.logoUrl ?? "",
    wallpaper: resolveWallpaper(company.wallpaper, company.logoWallpaper ?? false),
    sidebarTheme: company.sidebarTheme ?? "black",
    sidebarLogoColor: company.sidebarLogoColor ?? "",
    sidebarLogoSize: company.sidebarLogoSize != null ? String(company.sidebarLogoSize) : "",
    brandColor: company.brandColor ?? "",
    brandColorSecondary: company.brandColorSecondary ?? "",
    documentColor: company.documentColor ?? "",
    brandFont: company.brandFont ?? "",
    // Kept as a JSON string so the flat string-diff auto-save machinery works
    sectionColors: JSON.stringify(company.sectionColors ?? {}),
    surchargeEnabled: company.surchargeEnabled,
    surchargeRate: company.surchargeRate ? (Number(company.surchargeRate) * 100).toFixed(2) : "3.00",
    defaultDepositType: company.defaultDepositType ?? "NONE",
    defaultDepositValue: company.defaultDepositValue != null ? String(Number(company.defaultDepositValue)) : "",
    // Stored as a fraction (0.0825); shown/edited as a percent ("8.25")
    defaultTaxRate:
      company.defaultTaxRate != null
        ? String(Math.round(Number(company.defaultTaxRate) * 100000) / 1000)
        : "",
    quoteNumberStart: String(company.quoteNumberStart ?? 1),
    invoiceNumberStart: String(company.invoiceNumberStart ?? 1),
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

  // Two fields the server refuses (400) rather than quietly fixing: an empty
  // business name and a surcharge rate outside 0–10%. While invalid they are
  // shown inline and kept OUT of the diff — never sent, never "Saved".
  const surchargePct = Number(form.surchargeRate);
  const surchargeRateOk =
    form.surchargeRate.trim() !== "" &&
    Number.isFinite(surchargePct) &&
    surchargePct >= 0 &&
    surchargePct <= 10;
  const nameError = form.name.trim() ? "" : "Business name can't be empty.";
  const surchargeError =
    form.surchargeEnabled && !surchargeRateOk ? "Enter a rate between 0% and 10%." : "";

  // The diff between what's typed and what the server last confirmed —
  // only these keys go over the wire (the PATCH route is partial-safe).
  function unsavedOf(f: typeof form): Partial<typeof form> {
    const changed: Partial<typeof form> = {};
    for (const key of Object.keys(f) as (keyof typeof f)[]) {
      if (f[key] === savedRef.current[key]) continue;
      if (key === "name" && !f.name.trim()) continue;
      if (key === "surchargeRate" && !surchargeRateOk) continue;
      (changed as Record<string, unknown>)[key] = f[key];
    }
    return changed;
  }

  // Auto-save bookkeeping (continued): pendingRef holds the diff waiting on
  // the debounce so an unmount can still flush it; saveChainRef serialises
  // requests so an older response can never land after a newer one and
  // overwrite savedRef with stale confirmation.
  const pendingRef = useRef<{ payload: Record<string, unknown>; changed: Partial<typeof form> } | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const hasUnsaved = Object.keys(unsavedOf(form)).length > 0;
  // Leaving with an edit still debouncing or a save in flight: the native
  // prompt on tab close, a confirm sheet on in-app links. (Unmount also
  // flushes the pending diff with keepalive below, so nothing is lost even
  // when they go.)
  useUnsavedWarning(hasUnsaved || saving);

  async function save(payload: Record<string, unknown>, changed: Partial<typeof form>) {
    setSaving(true);
    setSaveError("");
    let ok = false;
    try {
      const res = await fetch("/api/app/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Survive a navigation that unloads the page mid-request
        keepalive: true,
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
    if (Object.keys(unsavedOf(formRef.current)).length === 0) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    router.refresh();
  }

  // Debounced auto-save: edits land on the server ~800ms after the last
  // change — there is no Save button. router.refresh() re-renders the shell
  // so sidebar/branding changes apply immediately.
  useEffect(() => {
    const changed = unsavedOf(form);
    if (Object.keys(changed).length === 0) {
      pendingRef.current = null;
      return;
    }

    const payload: Record<string, unknown> = { ...changed };
    // Same transforms the old Save button applied
    if ("surchargeRate" in payload || "surchargeEnabled" in payload) {
      payload.surchargeEnabled = form.surchargeEnabled;
      // Percent → fraction (3.5 → 0.035); an invalid rate never goes out
      if (surchargeRateOk) payload.surchargeRate = Math.round(surchargePct * 100) / 10000;
      else delete payload.surchargeRate;
    }
    if ("defaultDepositType" in payload || "defaultDepositValue" in payload) {
      payload.defaultDepositType = form.defaultDepositType;
      payload.defaultDepositValue = form.defaultDepositValue;
    }
    if ("defaultTaxRate" in payload) {
      payload.defaultTaxRate = form.defaultTaxRate
        ? parseFloat(form.defaultTaxRate) / 100
        : null;
    }
    // Whole numbers only; a blank or half-typed box waits instead of saving
    for (const f of ["quoteNumberStart", "invoiceNumberStart"] as const) {
      if (f in payload) {
        const n = Number(form[f]);
        if (form[f].trim() && Number.isInteger(n) && n >= 1) payload[f] = n;
        else delete payload[f];
      }
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
    pendingRef.current = { payload, changed };

    const t = setTimeout(() => {
      pendingRef.current = null;
      saveChainRef.current = saveChainRef.current.then(() => save(payload, changed));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, router]);

  // Unmount inside the debounce window (they tapped a link right after
  // typing): the last edit must not die with the timer. keepalive lets the
  // request outlive the page.
  useEffect(
    () => () => {
      const p = pendingRef.current;
      pendingRef.current = null;
      if (!p) return;
      void fetch("/api/app/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.payload),
        keepalive: true,
      }).catch(() => {});
    },
    []
  );

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
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      {/* Header — on phones inside a section, the back control and the
          section's own title take the h1's place (the h1 belongs to the
          index screen and to desktop). */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={section === "home" ? "" : "hidden lg:block"}>
            <PageTitle info="Changes save automatically.">
              Settings
            </PageTitle>
          </div>
          {section !== "home" && (
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => goSection("home")}
                className="-ml-1.5 flex items-center gap-0.5 text-[15px] font-medium text-green-700"
              >
                <ChevronLeft size={19} />
                Settings
              </button>
              <h2 className="mt-1 text-[22px] font-bold text-gray-900">
                {SETTINGS_SECTIONS.find((s) => s.key === section)?.label}
              </h2>
            </div>
          )}
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

      <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Desktop: the settings nav rail. Workbench Plus rides with Phone &
            texting (the business line is what it unlocks). */}
        <nav className="sticky top-8 hidden lg:block">
          <div className="space-y-0.5">
            {SETTINGS_SECTIONS.map((s) => {
              const Icon = SECTION_ICONS[s.icon];
              return (
                <Fragment key={s.key}>
                  <button
                    type="button"
                    onClick={() => goSection(s.key)}
                    className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors ${
                      active === s.key
                        ? "bg-green-500/10 font-semibold text-green-700"
                        : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <Icon size={16} className={active === s.key ? undefined : "text-gray-400"} />
                    {s.label}
                  </button>
                  {s.key === "phone" && company.addonEnabled && <RailLink link={ADDON_LINK} />}
                </Fragment>
              );
            })}
          </div>
          {SETTINGS_LINK_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1 mt-6 px-3 text-xs font-semibold text-gray-400">{g.label}</p>
              <div className="space-y-0.5">
                {g.links.map((l) => (
                  <RailLink key={l.href} link={l} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Phones: the settings index — grouped rows, the iOS Settings idiom */}
        {section === "home" && (
          <div className="space-y-6 lg:hidden">
            <div className="card-ledger divide-y divide-gray-100 overflow-hidden">
              {SETTINGS_SECTIONS.map((s) => {
                const Icon = SECTION_ICONS[s.icon];
                return (
                  <Fragment key={s.key}>
                    <button
                      type="button"
                      onClick={() => goSection(s.key)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-gray-100"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-green-500/10 text-green-700">
                        <Icon size={17} strokeWidth={2.25} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium text-gray-900">{s.label}</span>
                        <span className="block truncate text-xs text-gray-500">{s.sub}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-gray-300" />
                    </button>
                    {s.key === "phone" && company.addonEnabled && <LinkRow link={ADDON_LINK} />}
                  </Fragment>
                );
              })}
            </div>
            {SETTINGS_LINK_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="mb-2 px-1 text-[13px] font-semibold text-gray-500">{g.label}</p>
                <div className="card-ledger divide-y divide-gray-100 overflow-hidden">
                  {g.links.map((l) => (
                    <LinkRow key={l.href} link={l} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* The open section's cards — hidden on phones while the index shows */}
        <div className={section === "home" ? "hidden lg:block" : ""}>
      {show("company") && <PortalLinkCard slug={company.slug} />}

      <div className="space-y-6">
        {/* Business info */}
        {show("company") && (
        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Business Info</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
            <Input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
              required
              aria-invalid={Boolean(nameError)}
              className={`w-full focus:ring-2 ${nameError ? "border-red-400" : ""}`} />
            {nameError && (
              <p className="text-xs text-red-600 mt-1">{nameError} Your last saved name stays until you enter one.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                className="w-full focus:ring-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                className="w-full focus:ring-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
            <Input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
              className="w-full focus:ring-2" />
          </div>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-6 sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <Input type="text" value={form.city} onChange={(e) => set("city", e.target.value)}
                className="w-full focus:ring-2" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <Input type="text" value={form.state} onChange={(e) => set("state", e.target.value)}
                maxLength={2}
                className="w-full focus:ring-2 uppercase" />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
              <Input type="text" value={form.zip} onChange={(e) => set("zip", e.target.value)}
                inputMode="numeric" maxLength={10} autoComplete="postal-code"
                className="w-full focus:ring-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <Input type="url" value={form.website} onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
              className="w-full focus:ring-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <Select value={INDUSTRIES.includes(form.industry as (typeof INDUSTRIES)[number]) ? form.industry : form.industry ? "Other" : ""}
              onChange={(e) => set("industry", e.target.value)}
              className="w-full focus:ring-2">
              <option value="">Not set</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Changing this doesn&apos;t touch your price book — edit that in Services.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About your business</label>
            <textarea value={form.about} onChange={(e) => set("about", e.target.value)}
              rows={3} maxLength={500}
              placeholder="What you do and for whom, in a sentence or two."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2" />
            <p className="text-xs text-gray-500 mt-1">
              Shown on your public booking page, and used to describe your business when you register your number for texting.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <Select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}
              className="w-full focus:ring-2">
              {!TIMEZONES.some((tz) => tz.value === form.timezone) && (
                <option value={form.timezone}>{form.timezone}</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Used for scheduling and recurring billing dates.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scheduling time slots
            </label>
            <Select
              value={form.schedulingIntervalMinutes}
              onChange={(e) => set("schedulingIntervalMinutes", e.target.value)}
              className="w-full focus:ring-2"
            >
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Time options offered when you schedule jobs and appointments.
            </p>
          </div>
        </div>
        )}

        {/* Custom sending domain — invisible until EMAIL_DOMAINS_ENABLED */}
        {show("company") && <EmailDomainCard isOwner={isOwner} />}

        {/* Per-device light/dark lives on My Profile (components/AppearanceCard.tsx)
            — it's a personal choice, not a company one. */}

        {/* Branding */}
        {show("branding") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Branding</h2>
            <p className="text-xs text-gray-500 mt-0.5">
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
              <span className="text-xs text-gray-500">…or drag &amp; drop an image here</span>
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={logoBusy}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              )}
            </div>
            {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
            <p className="text-xs text-gray-500 mt-1">
              Any PNG, JPG, WebP, or GIF up to 15MB — it&apos;s optimized automatically.
              Transparent-background PNG looks best.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wallpaper</label>
            <p className="text-xs text-gray-500 mb-2">
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
              fallback="#0B57D8"
              onChange={(v) => set("brandColor", v)}
            />
            <ColorField
              label="Secondary color"
              hint="Buttons, links, and accents — defaults to your primary color"
              value={form.brandColorSecondary}
              fallback={form.brandColor || "#F86808"}
              onChange={(v) => set("brandColorSecondary", v)}
            />
            <ColorField
              label="Quotes & invoices color"
              hint="Headers on client-facing pages and emails — quotes, invoices, the client hub. Defaults to your primary color."
              value={form.documentColor}
              fallback={form.brandColor || "#FFFFFF"}
              onChange={(v) => set("documentColor", v)}
            />
          </div>

          {/* App font — same free-text Google Font convention as the form
              builder; the shell refreshes with the new font as it saves */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">App font</label>
            <Input
              type="text"
              value={form.brandFont}
              onChange={(e) => set("brandFont", e.target.value)}
              placeholder="Default — or any Google Font name, e.g. Lexend"
              className="w-full focus:ring-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Changes the font across the whole app for your team. Ledger numerals
              keep their stamped look. Quotes and invoices are not affected.
            </p>
            {form.brandFont.trim() && GOOGLE_FONT_RE.test(form.brandFont.trim()) && (
              <>
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link
                  rel="stylesheet"
                  href={`https://fonts.googleapis.com/css2?family=${form.brandFont.trim().replace(/ /g, "+")}:wght@400;600&display=swap`}
                />
                <p
                  className="mt-2 text-sm text-gray-700"
                  style={{ fontFamily: `"${form.brandFont.trim()}", sans-serif` }}
                >
                  The quick brown fox jumps over the lazy dog —{" "}
                  <span className="font-semibold">{form.brandFont.trim()}</span>
                </p>
              </>
            )}
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
                <p className="mt-1.5 text-xs text-gray-500">
                  The app color-codes each area — nav tiles, page headings, active
                  filters. Override any of them here. Picks that are too light for
                  the light theme or too dark for the dark theme are automatically
                  adjusted so they always stay readable.
                </p>
                <div className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-3">
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
        {show("branding") && (
        <div className="hidden lg:block card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Sidebar</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              How the desktop navigation rail looks for your whole team
            </p>
          </div>
          {/* Rail color follows the app theme (light/dark) since the calm-
              stage pass — the old black/white/gray picker is retired.
              Company.sidebarTheme survives in the schema, unused. */}
          {form.logoUrl && (
            <ColorField
              label="Logo backdrop"
              hint="Panel color behind your logo at the top of the sidebar"
              value={form.sidebarLogoColor}
              fallback="#FFFFFF"
              onChange={(v) => set("sidebarLogoColor", v)}
            />
          )}
          {form.logoUrl && (
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium text-gray-700">Logo size</label>
                {form.sidebarLogoSize && form.sidebarLogoSize !== "56" && (
                  <button
                    type="button"
                    onClick={() => {
                      set("sidebarLogoSize", "");
                      document.documentElement.style.setProperty("--rail-logo-h", "56px");
                    }}
                    className="text-[11px] text-gray-400 underline hover:text-gray-600"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                How tall the logo panel stands in the sidebar — the sidebar itself
                stays the same width
              </p>
              {/* Live: the rail plate reads --rail-logo-h before the saved value,
                  so the real sidebar follows the thumb as it drags */}
              <input
                type="range"
                min={36}
                max={128}
                step={2}
                value={Number(form.sidebarLogoSize) || 56}
                onChange={(e) => {
                  set("sidebarLogoSize", e.target.value);
                  document.documentElement.style.setProperty(
                    "--rail-logo-h",
                    `${e.target.value}px`
                  );
                }}
                aria-label="Sidebar logo size"
                className="mt-2 w-full accent-green-600"
              />
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          )}
        </div>
        )}

        {/* What your clients see — live branding preview of the client-facing
            surfaces. Client pages are always light, so the mock pins its own
            colors (arbitrary values dodge the dark-theme utility remap). */}
        {show("branding") && (
        <div className="hidden lg:block card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              What Your Clients See
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Live preview of your branding on quotes, invoices, the client hub, and emails
            </p>
          </div>
          <div className="theme-fixed overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* Client page header — the document color wins, like the live pages */}
            <div
              className="flex items-center gap-3 px-5 py-4"
              style={{ backgroundColor: form.documentColor || form.brandColor || "#FFFFFF" }}
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
                style={{ color: textOn(form.documentColor || form.brandColor || "#FFFFFF") }}
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
                    backgroundColor: form.brandColorSecondary || form.brandColor || "#F86808",
                    color: textOn(form.brandColorSecondary || form.brandColor || "#F86808"),
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

        {/* Surcharging */}
        {show("payments") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Card Surcharging</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pass card processing fees to your customer</p>
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
                <Input type="number" value={form.surchargeRate} onChange={(e) => set("surchargeRate", e.target.value)}
                  onBlur={() => {
                    // Out-of-range but numeric → clamp into 0–10 on blur; a
                    // blank or non-number stays (with the error) until fixed.
                    const n = Number(form.surchargeRate);
                    if (form.surchargeRate.trim() === "" || !Number.isFinite(n)) return;
                    const clamped = Math.min(10, Math.max(0, n));
                    if (clamped !== n) set("surchargeRate", clamped.toFixed(2));
                  }}
                  min="0" max="10" step="0.01"
                  aria-invalid={Boolean(surchargeError)}
                  className={`w-24 focus:ring-2 ${surchargeError ? "border-red-400" : ""}`} />
                <span className="text-sm text-gray-500">% added to card payments</span>
              </div>
              {surchargeError && <p className="text-xs text-red-600 mt-1">{surchargeError}</p>}
              <p className="text-xs text-gray-500 mt-1">
                Example: on a $500 invoice, customer pays ${(500 * (1 + (surchargeRateOk ? surchargePct : 0) / 100)).toFixed(2)} by card
              </p>
            </div>
          )}
        </div>
        )}

        {/* Default deposit */}
        {show("payments") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Default Deposit</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Applied to quotes when a service has no deposit of its own. Set per-service deposits in
              Services.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit</label>
              <Select
                value={form.defaultDepositType}
                onChange={(e) => set("defaultDepositType", e.target.value)}
                className="focus:ring-2"
              >
                <option value="NONE">No default deposit</option>
                <option value="PERCENT">Percentage of total</option>
                <option value="FIXED">Fixed amount</option>
                <option value="FULL">Full payment upfront</option>
              </Select>
            </div>
            {(form.defaultDepositType === "PERCENT" || form.defaultDepositType === "FIXED") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.defaultDepositType === "PERCENT" ? "Percent (0–100)" : "Amount ($)"}
                </label>
                <Input
                  type="number"
                  min="0"
                  step={form.defaultDepositType === "PERCENT" ? "1" : "0.01"}
                  max={form.defaultDepositType === "PERCENT" ? "100" : undefined}
                  value={form.defaultDepositValue}
                  onChange={(e) => set("defaultDepositValue", e.target.value)}
                  placeholder={form.defaultDepositType === "PERCENT" ? "25" : "100.00"}
                  className="w-28 focus:ring-2"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            On approval, the deposit is billed to the client as its own invoice; the final invoice
            then subtracts what they&apos;ve already paid.
          </p>
        </div>
        )}

        {/* Default sales tax */}
        {show("payments") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Sales Tax</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Prefills new quotes and invoices and applies to recurring invoices. Each document can
              still change or remove its own rate.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default tax rate</label>
            <div className="flex items-center gap-2">
              <Input type="number" value={form.defaultTaxRate} onChange={(e) => set("defaultTaxRate", e.target.value)}
                min="0" max="99" step="0.001" placeholder="0"
                className="w-24 focus:ring-2" />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Leave blank if you don&apos;t charge sales tax.</p>
          </div>
        </div>
        )}

        {/* Starting quote / invoice numbers (lib/doc-numbers.ts) */}
        {show("payments") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Numbering</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Coming from another system? Pick up where your old quote and invoice numbers left off.
              Numbers only ever go up — existing quotes and invoices keep theirs.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["quoteNumberStart", "Quotes start at", lastNumbers.quote],
              ["invoiceNumberStart", "Invoices start at", lastNumbers.invoice],
            ] as const).map(([field, label, last]) => {
              const start = Number(form[field]);
              const next = Math.max(last + 1, Number.isInteger(start) && start >= 1 ? start : 1);
              return (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <Input type="number" inputMode="numeric" min="1" step="1" value={form[field]}
                    onChange={(e) => set(field, e.target.value)}
                    placeholder="1" className="w-36 focus:ring-2" />
                  <p className="text-xs text-gray-500 mt-1">
                    Next one will be #{next}
                    {last + 1 > start && start > 1 ? ` (you've already used #${last})` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Accounting — QuickBooks Online lives on its own page */}
        {show("payments") && (
        <div className="card-ledger overflow-hidden">
          <LinkRow link={QUICKBOOKS_LINK} />
        </div>
        )}

        {/* Automation rules — the Atlas-built "when this happens, do that"
            list has its own page; this is the one way in from Settings */}
        {show("automations") && (
        <div className="card-ledger overflow-hidden">
          <SettingsLinkRow
            href="/app/automations"
            label="Automations"
            sub="“When this happens, do that” rules — build them as cards or ask Atlas; run free, pause any time"
            hue={SECTION_HUES.business}
            icon={Zap}
          />
        </div>
        )}

        {/* AI assistant */}
        {show("automations") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">AI Assistant</h2>
            <p className="text-xs text-gray-500 mt-0.5">The chat helper in the corner of every page</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assistant name</label>
            <Input type="text" value={form.assistantName} onChange={(e) => set("assistantName", e.target.value)}
              placeholder="Atlas" maxLength={40}
              className="w-full max-w-xs focus:ring-2" />
            <p className="text-xs text-gray-500 mt-1">Give it a name that fits your business — leave blank for Atlas</p>
          </div>
        </div>
        )}

        {/* Business line — the company's own number: calls forward to a cell, texts go out from it once registered */}
        {show("phone") && line?.enabled && <BusinessLineCard initial={line} />}

        {/* Text notifications — the one-time consent attestation behind provider texts */}
        {show("phone") && <SmsNotificationsCard initialOnAt={company.smsAcknowledgedAt} hasLine={Boolean(line?.number)} />}

        {/* On my way texts */}
        {show("phone") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              &ldquo;On My Way&rdquo; Texts
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              The message behind the On My Way button on a job — it opens in your team
              member&apos;s own texting app, prefilled and editable, so it&apos;s free to send
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message template</label>
            <Textarea
              value={form.onMyWayTemplate}
              onChange={(e) => set("onMyWayTemplate", e.target.value)}
              placeholder={DEFAULT_ON_MY_WAY_TEMPLATE}
              rows={3}
              maxLength={320}
              className="w-full focus:ring-2"
            />
            <p className="text-xs text-gray-500 mt-1">
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

        {/* Call log — every call on the line, with voicemails */}
        {show("phone") && (
        <div className="card-ledger overflow-hidden">
          <SettingsLinkRow
            href="/app/calls"
            label="Call log"
            sub="Every call on your business line — answered, missed, and voicemails to play"
            hue={SECTION_HUES.chat}
            icon={PhoneCall}
          />
        </div>
        )}

        {/* Review requests — part of what clients experience after they pay */}
        {show("branding") && (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Review Requests</h2>
            <p className="text-xs text-gray-500 mt-0.5">Automatically ask for a Google review after payment</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google review link</label>
            <Input type="url" value={form.reviewLink} onChange={(e) => set("reviewLink", e.target.value)}
              placeholder="https://g.page/r/..."
              className="w-full focus:ring-2" />
            <p className="text-xs text-gray-500 mt-1">Find this in your Google Business Profile → Get more reviews</p>
          </div>
        </div>
        )}
      </div>

      {isOwner && show("company") && (
        <DangerZone companyName={company.name} signInMethods={signInMethods} />
      )}
        </div>
      </div>
    </div>
  );
}
