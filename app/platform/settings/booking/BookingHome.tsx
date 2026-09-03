"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ChevronUp, Copy, ExternalLink, Globe, Link2, Loader2, MoreHorizontal, Plus, Power, Trash2, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import Modal from "@/components/Modal";
import { confirmSheet } from "@/components/ConfirmSheet";
import BusinessHoursEditor from "@/components/BusinessHoursEditor";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { DAY_KEYS, type BusinessHours } from "@/lib/business-hours";
import { arrivalWindowChoiceLabel } from "@/lib/arrival-window";
import { BOOKING_KINDS, KIND_META, itemMetaLine, type BookingKind, type BookingMode, type BookingConfirmation, type BookingPayment } from "@/lib/booking-types";
import type { BookingPageLook } from "@/lib/booking-page";

/**
 * Settings → Online booking. Two ideas: the company's booking page (its link,
 * its look, the scheduling rules every item shares) and the list of things
 * people can book — calls, visits, services, and plain message forms — each
 * with its own link and embed. Ledger rows, sentence-case headings, one New
 * button; the state of a row reads as quiet text, not a badge.
 */

export type ItemRow = {
  id: string;
  name: string;
  slug: string;
  kind: BookingKind;
  mode: BookingMode;
  isActive: boolean;
  showOnPage: boolean;
  durationMinutes: number;
  stepMinutes: number;
  confirmation: BookingConfirmation;
  paymentMode: BookingPayment;
  serviceCount: number;
  questionCount: number;
  takers: string[];
};

export type RulesProps = {
  hours: BusinessHours;
  serviceZips: string[];
  arrivalWindowMinutes: number;
  /** 0 = off */
  bookingDriveLimitMinutes: number;
  timezone: string;
  bookableCount: number;
};

const WINDOW_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
];
const DRIVE_LIMIT_OPTIONS = [
  { value: 0, label: "No limit" },
  { value: 15, label: "15 min out of the way" },
  { value: 20, label: "20 min out of the way" },
  { value: 30, label: "30 min out of the way" },
  { value: 45, label: "45 min out of the way" },
  { value: 60, label: "1 hour out of the way" },
];

const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const smallLabel = "mb-1 block text-xs font-medium text-gray-500";

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${ampm}` : `${hh} ${ampm}`;
}

/** "Mon–Fri 8 AM–5 PM", "6 days a week", "Closed". */
export function hoursSummary(hours: BusinessHours): string {
  const open = DAY_KEYS.filter((d) => hours[d].length > 0);
  if (open.length === 0) return "Closed";
  const week = ["mon", "tue", "wed", "thu", "fri"] as const;
  const sig = (d: (typeof DAY_KEYS)[number]) => hours[d].map((r) => `${r.start}-${r.end}`).join(",");
  const weekdaysSame = week.every((d) => hours[d].length > 0 && sig(d) === sig("mon"));
  if (weekdaysSame && open.length === 5) {
    const r = hours.mon;
    return `Mon–Fri ${fmtTime(r[0].start)}–${fmtTime(r[r.length - 1].end)}`;
  }
  return `${open.length} day${open.length === 1 ? "" : "s"} a week`;
}

function lookSummary(look: BookingPageLook): string {
  const theme = look.theme === "dark" ? "Dark" : look.theme === "transparent" ? "Transparent" : "Light";
  const size = look.fontSize === "sm" ? "small text" : look.fontSize === "lg" ? "large text" : "normal text";
  return [theme, look.font ?? "default font", size, look.accent ? `accent ${look.accent}` : "brand accent"].join(" · ");
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-green-500" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

export default function BookingHome({
  companySlug,
  baseUrl,
  previewMode,
  look: initialLook,
  brandAccent,
  rules: initialRules,
  items,
}: {
  companySlug: string;
  baseUrl: string;
  previewMode: boolean;
  look: BookingPageLook;
  brandAccent: string;
  rules: RulesProps;
  items: ItemRow[];
}) {
  const router = useRouter();
  const pageUrl = `${baseUrl}/book/${companySlug}`;
  const itemUrl = (t: ItemRow) => `${pageUrl}/${t.slug}`;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [open, setOpen] = useState<"look" | "rules" | "embed" | null>(null);

  // ── Booking page: look ────────────────────────────────────────────────────
  const [look, setLook] = useState<BookingPageLook>(initialLook);
  const [lookSaved, setLookSaved] = useState<BookingPageLook>(initialLook);
  const [lookSaving, setLookSaving] = useState(false);
  const lookDirty = JSON.stringify(look) !== JSON.stringify(lookSaved);
  async function saveLook() {
    setLookSaving(true);
    setError("");
    const { ok, data } = await postJson("/api/app/settings", { bookingPage: look }, "PATCH");
    setLookSaving(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setLookSaved(look);
    router.refresh();
  }

  // ── Booking page: rules ───────────────────────────────────────────────────
  const [hours, setHours] = useState<BusinessHours>(initialRules.hours);
  const [zipsText, setZipsText] = useState(initialRules.serviceZips.join(", "));
  const [window_, setWindow] = useState(initialRules.arrivalWindowMinutes);
  const [driveLimit, setDriveLimit] = useState(initialRules.bookingDriveLimitMinutes);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSavedAt, setRulesSavedAt] = useState(0);
  async function saveRules() {
    setRulesSaving(true);
    setError("");
    const serviceZips = zipsText.split(/[\s,;]+/).map((z) => z.trim()).filter(Boolean);
    const { ok, data } = await postJson("/api/app/settings", { businessHours: hours, serviceZips, arrivalWindowMinutes: window_, bookingDriveLimitMinutes: driveLimit }, "PATCH");
    setRulesSaving(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setRulesSavedAt(Date.now());
    setTimeout(() => setRulesSavedAt(0), 2500);
    router.refresh();
  }
  const zipCount = zipsText.split(/[\s,;]+/).filter(Boolean).length;
  const rulesSummary = [
    hoursSummary(hours),
    `${arrivalWindowChoiceLabel(window_)} arrival window`,
    driveLimit > 0 ? `drive limit ${driveLimit} min` : "no drive limit",
    zipCount > 0 ? `${zipCount} ZIP${zipCount === 1 ? "" : "s"}` : "any address",
  ].join(" · ");

  // ── Items ─────────────────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<BookingKind>("PHONE_CALL");
  const [newMode, setNewMode] = useState<BookingMode>("SCHEDULE");
  const [newName, setNewName] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ id: string }>("/api/app/booking-types", { name: newName.trim() || KIND_META[newKind].defaultName, kind: newKind, mode: newMode }, "POST");
    setBusy(false);
    if (!ok || !data?.id) return setError(data?.error ?? GENERIC_ERROR);
    router.push(`/app/settings/booking/${data.id}`);
  }
  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/booking-types/${id}`, body, "PATCH");
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setMenuFor(null);
    router.refresh();
  }
  async function remove(t: ItemRow) {
    if (!(await confirmSheet({ title: `Delete "${t.name}"?`, message: "Bookings and requests it already produced stay. Its link and any embed of it stop working.", confirmLabel: "Delete", destructive: true }))) return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/booking-types/${t.id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setMenuFor(null);
    router.refresh();
  }
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setError("Couldn't copy — select the text and copy it manually.");
    }
  }

  const embedKey = companySlug;
  const embedSnippet = `<iframe src="${baseUrl}/embed/${companySlug}" data-jobflow="${embedKey}" style="width:100%;max-width:640px;height:760px;border:0;" title="Book online"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${baseUrl ? new URL(baseUrl).origin : ""}"&&d&&d.type==="jobflow:height"&&d.slug==="${embedKey}"){var f=document.querySelector('iframe[data-jobflow="${embedKey}"]');if(f)f.style.height=d.height+"px";}});</script>`;

  const stateText = (t: ItemRow) => (!t.isActive ? "Off" : t.showOnPage ? "On your page" : "Link only");

  const actionRow = (key: string, Icon: typeof Power, label: string, onClick: () => void, danger = false) => (
    <button key={key} type="button" onClick={onClick} disabled={busy} className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium transition-colors active:bg-gray-50 disabled:opacity-50 ${danger ? "text-red-600" : "text-gray-800"}`}>
      <Icon size={17} className={danger ? "text-red-500" : "text-gray-400"} />
      {label}
    </button>
  );

  const themeBtn = (value: BookingPageLook["theme"], label: string) => (
    <button type="button" onClick={() => setLook({ ...look, theme: value })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${look.theme === value ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
      {label}
    </button>
  );
  const sizeBtn = (value: BookingPageLook["fontSize"], label: string) => (
    <button type="button" onClick={() => setLook({ ...look, fontSize: value })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${look.fontSize === value ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
      {label}
    </button>
  );

  const disclosureRow = (key: "look" | "rules" | "embed", title: string, meta: string) => (
    <button type="button" onClick={() => setOpen(open === key ? null : key)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left lg:px-5" aria-expanded={open === key}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{meta}</span>
      </span>
      {open === key ? <ChevronUp size={16} className="shrink-0 text-gray-400" /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <div className="flex items-center justify-between gap-3">
        <PageTitle section="forms" icon={Globe}>
          Online booking
        </PageTitle>
        <button onClick={() => setCreating(true)} aria-label="New" className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 sm:px-4">
          <Plus size={16} />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>
      <p className="mb-6 mt-2 text-sm text-gray-500">Where customers book a time or send you a request.</p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Your booking page ─────────────────────────────────────────────── */}
      <h2 className="mb-2 text-[17px] font-bold text-gray-900">Your booking page</h2>
      <div className="card-ledger mb-8 divide-y divide-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 lg:px-5">
          <span className="min-w-0 flex-1">
            {previewMode ? (
              <span className="block text-sm text-gray-500">Your link unlocks once your account is approved.</span>
            ) : (
              <span className="block truncate text-sm text-gray-900">{pageUrl.replace(/^https?:\/\//, "")}</span>
            )}
            <span className="mt-0.5 block text-xs text-gray-500">
              {items.filter((t) => t.isActive && t.showOnPage).length === 1
                ? "Shows the one item on it."
                : `Lists ${items.filter((t) => t.isActive && t.showOnPage).length} items.`}
            </span>
          </span>
          {!previewMode && (
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => copy(pageUrl, "page")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy link">
                {copied === "page" ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />}
              </button>
              <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Open">
                <ExternalLink size={14} />
              </a>
            </span>
          )}
        </div>

        {!previewMode && (
          <div>
            {disclosureRow("embed", "Embed on your website", "One snippet for the whole page; each item has its own too")}
            {open === "embed" && (
              <div className="space-y-2 px-4 pb-4 lg:px-5">
                <div className="flex items-start gap-2">
                  <textarea readOnly value={embedSnippet} rows={4} className="min-w-0 flex-1 rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700" />
                  <button type="button" onClick={() => copy(embedSnippet, "embed")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy snippet">
                    {copied === "embed" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">Paste it into your site&apos;s HTML. It resizes itself and carries your saved look; add ?theme=dark or ?transparent=1 to the src to override per placement.</p>
              </div>
            )}
          </div>
        )}

        <div>
          {disclosureRow("look", "Look", lookSummary(look))}
          {open === "look" && (
            <div className="space-y-4 px-4 pb-4 lg:px-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <p className={smallLabel}>Style</p>
                  <div className="flex items-center gap-1">
                    {themeBtn("light", "Light")}
                    {themeBtn("dark", "Dark")}
                    {themeBtn("transparent", "Transparent")}
                  </div>
                </div>
                <div>
                  <p className={smallLabel}>Text size</p>
                  <div className="flex items-center gap-1">
                    {sizeBtn("sm", "Small")}
                    {sizeBtn("md", "Normal")}
                    {sizeBtn("lg", "Large")}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={smallLabel}>Font</label>
                  <input value={look.font ?? ""} onChange={(e) => setLook({ ...look, font: e.target.value || undefined })} placeholder="Default — or any Google Font, e.g. Oxanium" className={inputCls} />
                </div>
                <div>
                  <label className={smallLabel}>Accent color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={look.accent ?? brandAccent} onChange={(e) => setLook({ ...look, accent: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-gray-300 p-1" />
                    <span className="font-mono text-xs text-gray-500">{look.accent ?? "Brand color"}</span>
                    {look.accent && (
                      <button type="button" onClick={() => setLook({ ...look, accent: undefined })} className="text-xs text-gray-400 underline hover:text-gray-600">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className={smallLabel}>Page heading</label>
                  <input value={look.title} onChange={(e) => setLook({ ...look, title: e.target.value })} placeholder="Your company name" className={inputCls} />
                </div>
                <div>
                  <label className={smallLabel}>Line under it</label>
                  <input value={look.description} onChange={(e) => setLook({ ...look, description: e.target.value })} placeholder="Pick what you'd like to book" className={inputCls} />
                </div>
              </div>
              <p className="text-xs text-gray-500">Transparent has no background of its own — it sits directly on your website.</p>
              <button type="button" onClick={saveLook} disabled={lookSaving || !lookDirty} className="flex h-10 items-center justify-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50">
                {lookSaving && <Loader2 size={13} className="animate-spin" />}
                {lookDirty ? "Save look" : "Saved"}
              </button>
            </div>
          )}
        </div>

        <div>
          {disclosureRow("rules", "Scheduling rules", rulesSummary)}
          {open === "rules" && (
            <div className="space-y-5 px-4 pb-4 lg:px-5">
              {initialRules.bookableCount === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Nobody on your team takes online bookings yet. Turn on <strong>Bookable online</strong> for someone on the{" "}
                  <Link href="/app/settings/team" className="font-semibold underline">
                    Team page
                  </Link>
                  .
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">
                  Business hours
                  <span className="font-normal text-gray-400"> — {initialRules.timezone.replace(/_/g, " ")}</span>
                </p>
                <BusinessHoursEditor hours={hours} onChange={setHours} />
                <p className="mt-2 text-xs text-gray-400">
                  Each person can have their own hours on the{" "}
                  <Link href="/app/settings/team" className="underline">
                    Team page
                  </Link>
                  .
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={smallLabel}>Arrival window</label>
                  <select value={window_} onChange={(e) => setWindow(Number(e.target.value))} className={inputCls}>
                    {WINDOW_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">What visits promise: &quot;we&apos;ll arrive between 8 and 10&quot;.</p>
                </div>
                <div>
                  <label className={smallLabel}>Max drive to a booked visit</label>
                  <select value={driveLimit} onChange={(e) => setDriveLimit(Number(e.target.value))} className={inputCls}>
                    {DRIVE_LIMIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Visits only offer times the assigned person can reach from their previous stop and on to the next.</p>
                </div>
              </div>
              <div>
                <label className={smallLabel}>Service area ZIP codes</label>
                <textarea value={zipsText} onChange={(e) => setZipsText(e.target.value)} rows={2} placeholder="75002, 75013, 75025…" className={`${inputCls} font-mono`} />
                <p className="mt-1 text-xs text-gray-500">Addresses outside these are turned away before they pick a time. Empty = anywhere.</p>
              </div>
              <button type="button" onClick={saveRules} disabled={rulesSaving} className="flex h-10 items-center justify-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50">
                {rulesSaving ? <Loader2 size={13} className="animate-spin" /> : rulesSavedAt ? <Check size={13} /> : null}
                {rulesSavedAt ? "Saved" : "Save rules"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── What people can book ──────────────────────────────────────────── */}
      <h2 className="mb-2 text-[17px] font-bold text-gray-900">What people can book</h2>
      <div className="card-ledger overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">
            Nothing yet.{" "}
            <button type="button" onClick={() => setCreating(true)} className="font-medium text-green-600 hover:underline">
              Add a phone call, a visit, a service or a contact form.
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((t) => {
              const url = itemUrl(t);
              const open = menuFor === t.id;
              const meta = itemMetaLine(t);
              const takers = t.mode === "SCHEDULE" ? (t.takers.length ? t.takers.slice(0, 3).join(", ") + (t.takers.length > 3 ? ` +${t.takers.length - 3}` : "") : "") : "";
              const warn = t.mode === "SCHEDULE" && t.takers.length === 0 ? "Nobody can take these — add a bookable team member" : t.kind === "SERVICE" && t.serviceCount === 0 ? "No services yet" : null;
              return (
                <div key={t.id} className={t.isActive ? "" : "opacity-60"}>
                  <div className="flex items-center gap-3 px-4 py-3.5 lg:px-5">
                    <Link href={`/app/settings/booking/${t.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-gray-900 lg:text-sm">{t.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500">
                        {meta}
                        {takers ? ` · ${takers}` : ""}
                      </span>
                      {warn && <span className="mt-0.5 block text-xs text-amber-700">{warn}</span>}
                    </Link>
                    <span className="hidden shrink-0 text-xs text-gray-500 sm:block">{stateText(t)}</span>
                    <div className="hidden shrink-0 items-center gap-1 lg:flex">
                      {!previewMode && t.isActive && (
                        <>
                          <button onClick={() => copy(url, t.id)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy link">
                            {copied === t.id ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />}
                          </button>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Open">
                            <ExternalLink size={14} />
                          </a>
                        </>
                      )}
                      <button onClick={() => patch(t.id, { isActive: !t.isActive })} disabled={busy} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={t.isActive ? "Turn off" : "Turn on"}>
                        <Power size={14} />
                      </button>
                      <button onClick={() => remove(t)} disabled={busy} className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <Link href={`/app/settings/booking/${t.id}`} className="lg:hidden" aria-label={`Edit ${t.name}`}>
                      <ChevronRight size={16} className="shrink-0 text-gray-300" />
                    </Link>
                    <button onClick={() => setMenuFor(open ? null : t.id)} aria-label={`Actions for ${t.name}`} aria-expanded={open} className={`-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-gray-100 lg:hidden ${open ? "bg-gray-100 text-gray-700" : "text-gray-400"}`}>
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                  {open && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100 lg:hidden">
                      {!previewMode && t.isActive && actionRow("copy", copied === t.id ? Check : Link2, copied === t.id ? "Link copied" : "Copy link", () => copy(url, t.id))}
                      {!previewMode && t.isActive && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-gray-800 transition-colors active:bg-gray-50">
                          <ExternalLink size={17} className="text-gray-400" />
                          Open
                        </a>
                      )}
                      {actionRow("toggle", Power, t.isActive ? "Turn off" : "Turn on", () => patch(t.id, { isActive: !t.isActive }))}
                      {actionRow("del", Trash2, "Delete", () => remove(t), true)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New item ──────────────────────────────────────────────────────── */}
      <Modal open={creating} onClose={() => !busy && setCreating(false)} cardClassName="w-full max-w-lg rounded-lg bg-white p-5 text-left shadow-xl">
        {creating && (
          <>
            <h2 className="mb-3 text-base font-semibold text-gray-900">What can people book?</h2>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {BOOKING_KINDS.map((k) => {
                const meta = KIND_META[k];
                const active = newKind === k;
                return (
                  <label key={k} className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${active ? "bg-green-50/60" : ""}`}>
                    <input type="radio" name="kind" checked={active} onChange={() => setNewKind(k)} className="mt-1 accent-green-600" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{meta.label}</span>
                      <span className="block text-xs text-gray-500">{meta.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {KIND_META[newKind].schedulable && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="mode" checked={newMode === "SCHEDULE"} onChange={() => setNewMode("SCHEDULE")} className="accent-green-600" />
                  Customer picks a time
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="mode" checked={newMode === "REQUEST"} onChange={() => setNewMode("REQUEST")} className="accent-green-600" />
                  They ask, you follow up
                </label>
              </div>
            )}
            <label className="mb-1 mt-4 block text-xs font-medium text-gray-500">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={KIND_META[newKind].defaultName} className={inputCls} />
            <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <button onClick={create} disabled={busy} className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50 lg:h-10">
                {busy && <Loader2 size={14} className="animate-spin" />}
                Create
              </button>
              <button onClick={() => setCreating(false)} disabled={busy} className="flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 lg:h-10">
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
