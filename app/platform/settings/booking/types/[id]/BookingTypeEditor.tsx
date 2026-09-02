"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Trash2,
  Video,
  Wrench,
  X,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { ARRIVAL_WINDOW_CHOICES, arrivalWindowChoiceLabel } from "@/lib/arrival-window";
import { servicePriceLabel } from "@/lib/booking-form";
import {
  BUFFER_CHOICES,
  CUTOFF_CHOICES,
  HORIZON_CHOICES,
  KIND_META,
  LEAD_CHOICES,
  STEP_CHOICES,
  durationLabel,
  type BookingKind,
  type BookingTypeSettings,
} from "@/lib/booking-types";

/**
 * Booking type editor — one page per type, mirroring the form builder:
 * ledger sections, autosave (debounced PATCH with the Saving…/Saved header
 * the Settings page uses), and a live preview of what customers would see.
 */

type Draft = BookingTypeSettings & {
  id: string;
  slug: string;
  members: { userId: string; priority: number }[];
  services: string[];
};

type TeamRow = { id: string; name: string; role: string; bookable: boolean; hasMeetingLink: boolean };
type PriceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  priceDisplay: "FIXED" | "STARTING_AT" | "HOURLY" | "QUOTE";
  durationMinutes: number | null;
  depositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
  depositValue: number | null;
};

const KIND_ICON: Record<BookingKind, typeof Phone> = { PHONE_CALL: Phone, VIDEO_CALL: Video, IN_PERSON: MapPin, SERVICE: Wrench };

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const smallLabel = "block text-xs font-medium text-gray-500 mb-1";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card-ledger space-y-3 p-4">
      <p className="text-[13px] font-semibold text-gray-500">
        {title}
        {hint && <span className="font-normal normal-case text-gray-400"> — {hint}</span>}
      </p>
      {children}
    </div>
  );
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

const hoursLabel = (h: number) => (h === 0 ? "No minimum" : h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${h / 24} day${h === 24 ? "" : "s"}`);

export default function BookingTypeEditor({
  type: initial,
  team,
  priceBook,
  company,
  baseUrl,
  previewMode,
}: {
  type: Draft;
  team: TeamRow[];
  priceBook: PriceRow[];
  company: {
    name: string;
    slug: string;
    timezone: string;
    arrivalWindowMinutes: number;
    driveLimitMinutes: number;
    geocoding: boolean;
    shopPinned: boolean;
    paymentsReady: boolean;
    surchargeEnabled: boolean;
  };
  baseUrl: string;
  previewMode: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = KIND_META[draft.kind];
  const Icon = KIND_ICON[draft.kind];
  const url = `${baseUrl}/book/${company.slug}/schedule/${draft.slug}`;
  const embedSrc = `${baseUrl}/embed/${company.slug}/schedule/${draft.slug}`;

  const flush = useCallback(async () => {
    const body = pending.current;
    pending.current = {};
    if (Object.keys(body).length === 0) return;
    setState("saving");
    const { ok, data } = await postJson<Draft & { error?: string }>(`/api/app/booking-types/${draft.id}`, body, "PATCH");
    if (!ok) {
      setState("error");
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setError("");
    setState("saved");
    // The server clamps/derives (kind invariants, slug) — sync those back
    if (data) {
      setDraft((d) => ({
        ...d,
        slug: data.slug ?? d.slug,
        confirmation: data.confirmation ?? d.confirmation,
        paymentMode: data.paymentMode ?? d.paymentMode,
        arrivalWindowMinutes: data.arrivalWindowMinutes ?? d.arrivalWindowMinutes,
      }));
    }
    router.refresh();
  }, [draft.id, router]);

  const update = useCallback(
    (patch: Partial<Draft>, extra: Record<string, unknown> = {}) => {
      setDraft((d) => ({ ...d, ...patch }));
      pending.current = { ...pending.current, ...patch, ...extra };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [flush]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setMembers = (members: Draft["members"]) => update({ members }, { members });
  const setServices = (services: string[]) => update({ services }, { services });

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setError("Couldn't copy — select the text and copy it manually.");
    }
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: `Delete "${draft.name}"?`,
        message: "Bookings it already produced stay on the schedule. Links to this booking page stop working.",
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    const { ok, data } = await postJson(`/api/app/booking-types/${draft.id}`, undefined, "DELETE");
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.push("/app/settings/booking");
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  type PreviewDay = { date: string; label: string; members: string[]; slots: { start: string; label: string; members: string[] }[] };
  const [preview, setPreview] = useState<{ driveAware: boolean; days: PreviewDay[]; eligible: { name: string }[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewAddress, setPreviewAddress] = useState("");
  async function loadPreview() {
    setPreviewBusy(true);
    try {
      const q = previewAddress.trim() ? `?address=${encodeURIComponent(previewAddress.trim())}` : "";
      const res = await fetch(`/api/app/booking-types/${draft.id}/preview${q}`);
      const data = await res.json();
      if (res.ok) setPreview(data);
      else setError(data?.error ?? GENERIC_ERROR);
    } finally {
      setPreviewBusy(false);
    }
  }

  const eligibleTeam = team.filter((u) => u.bookable);
  const chosen = new Set(draft.members.map((m) => m.userId));
  const eligibleChosen = draft.members.filter((m) => team.find((u) => u.id === m.userId)?.bookable);
  const pickedServices = draft.services.map((id) => priceBook.find((p) => p.id === id)).filter((p): p is PriceRow => Boolean(p));
  const nonFixed = pickedServices.filter((p) => p.priceDisplay !== "FIXED");
  const noDuration = pickedServices.filter((p) => p.durationMinutes == null);
  const totalDuration = pickedServices.reduce((s, p) => s + (p.durationMinutes ?? draft.durationMinutes), 0);

  const snippet = `<iframe src="${embedSrc}" style="width:100%;border:0;min-height:640px" id="wb-schedule-${draft.slug}" title="Book ${draft.name}"></iframe>
<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="jobflow:height"&&e.data.slug==="${company.slug}/schedule/${draft.slug}"){var f=document.getElementById("wb-schedule-${draft.slug}");if(f)f.style.height=e.data.height+"px";}});</script>`;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/app/settings/booking" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <span className="chip-tool flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-900 text-white" aria-hidden>
          <Icon size={17} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-gray-900 numeral-ledger">{draft.name}</h1>
          <p className="text-xs text-gray-500">{meta.label}</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-gray-500" aria-live="polite">
          {state === "saving" && (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving…
            </>
          )}
          {state === "saved" && (
            <>
              <Check size={12} className="text-green-600" /> Saved
            </>
          )}
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="space-y-4">
        <Card title="Basics">
          <Toggle
            checked={draft.isActive}
            onChange={(v) => update({ isActive: v })}
            label="Customers can book this"
            hint={draft.isActive ? "Shown on your booking page and at its own link." : "Hidden from customers — the link stops working."}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={smallLabel}>Name</label>
              <input value={draft.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={smallLabel}>Link</label>
              <div className="flex items-center gap-1">
                <span className="hidden truncate text-xs text-gray-400 sm:inline">…/schedule/</span>
                <input
                  value={draft.slug}
                  onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                  onBlur={(e) => update({}, { slug: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          <div>
            <label className={smallLabel}>Description (shown to customers)</label>
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => update({ description: e.target.value || null })}
              rows={2}
              placeholder={meta.hint}
              className={`${inputClass} resize-none`}
            />
          </div>
        </Card>

        {draft.kind === "SERVICE" && (
          <Card title="Services customers can pick" hint="from your price book — price, time on site and deposit come from there">
            <div className="space-y-2">
              {pickedServices.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {servicePriceLabel({ price: p.price, priceDisplay: p.priceDisplay })}
                      {p.durationMinutes != null ? ` · ${durationLabel(p.durationMinutes)} on site` : ""}
                      {p.depositType !== "NONE" ? ` · deposit ${p.depositType === "FULL" ? "in full" : p.depositType === "PERCENT" ? `${p.depositValue}%` : `$${p.depositValue}`}` : ""}
                    </p>
                    {p.durationMinutes == null && (
                      <p className="mt-1 text-xs text-amber-700">
                        No time on site set — uses this type&apos;s duration ({durationLabel(draft.durationMinutes)}).{" "}
                        <a href="/app/settings/products" target="_blank" rel="noreferrer" className="underline">
                          Set it in the price book
                        </a>
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setServices(draft.services.filter((id) => id !== p.id))} className="text-gray-400 hover:text-red-500" aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {priceBook.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Your price book is empty — add the services you offer there first.{" "}
                  <a href="/app/settings/products" target="_blank" rel="noreferrer" className="font-semibold underline">
                    Open price book
                  </a>
                </div>
              ) : (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setServices([...draft.services, e.target.value]);
                  }}
                  className={inputClass}
                >
                  <option value="">+ Add a service…</option>
                  {priceBook
                    .filter((p) => !draft.services.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {servicePriceLabel({ price: p.price, priceDisplay: p.priceDisplay })}
                        {p.durationMinutes == null ? " (no duration)" : ""}
                      </option>
                    ))}
                </select>
              )}
              {pickedServices.length > 0 && (
                <p className="text-xs text-gray-400">
                  Customers can pick more than one; the visit length is the sum ({durationLabel(totalDuration)} if they pick everything).
                </p>
              )}
            </div>
          </Card>
        )}

        <Card title="Timing">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div>
              <label className={smallLabel}>{draft.kind === "SERVICE" ? "Fallback duration" : "Duration"}</label>
              <select value={draft.durationMinutes} onChange={(e) => update({ durationMinutes: Number(e.target.value) })} className={inputClass}>
                {[15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480].map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            {meta.exactTime ? (
              <div>
                <label className={smallLabel}>Start times every</label>
                <select value={draft.stepMinutes} onChange={(e) => update({ stepMinutes: Number(e.target.value) })} className={inputClass}>
                  {STEP_CHOICES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={smallLabel}>Arrival window</label>
                <select
                  value={draft.arrivalWindowMinutes ?? ""}
                  onChange={(e) => update({ arrivalWindowMinutes: e.target.value === "" ? null : Number(e.target.value) })}
                  className={inputClass}
                >
                  <option value="">Company default ({arrivalWindowChoiceLabel(company.arrivalWindowMinutes)})</option>
                  {ARRIVAL_WINDOW_CHOICES.map((m) => (
                    <option key={m} value={m}>
                      {arrivalWindowChoiceLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={smallLabel}>Buffer before</label>
              <select value={draft.bufferBeforeMinutes} onChange={(e) => update({ bufferBeforeMinutes: Number(e.target.value) })} className={inputClass}>
                {BUFFER_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "None" : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={smallLabel}>Buffer after</label>
              <select value={draft.bufferAfterMinutes} onChange={(e) => update({ bufferAfterMinutes: Number(e.target.value) })} className={inputClass}>
                {BUFFER_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "None" : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={smallLabel}>Earliest booking</label>
              <select value={draft.leadHours} onChange={(e) => update({ leadHours: Number(e.target.value) })} className={inputClass}>
                {LEAD_CHOICES.map((h) => (
                  <option key={h} value={h}>
                    {h === 0 ? "Right away" : `${hoursLabel(h)} from now`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={smallLabel}>How far out</label>
              <select value={draft.horizonDays} onChange={(e) => update({ horizonDays: Number(e.target.value) })} className={inputClass}>
                {HORIZON_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d === 7 ? "1 week" : d === 14 ? "2 weeks" : `${d} days`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={smallLabel}>Per person, per day</label>
              <select value={draft.maxPerDay ?? ""} onChange={(e) => update({ maxPerDay: e.target.value === "" ? null : Number(e.target.value) })} className={inputClass}>
                <option value="">No limit</option>
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    Up to {n}
                  </option>
                ))}
              </select>
            </div>
            {!meta.exactTime && (
              <div>
                <label className={smallLabel}>Times shown per day</label>
                <select value={draft.maxShownPerDay} onChange={(e) => update({ maxShownPerDay: Number(e.target.value) })} className={inputClass}>
                  {[3, 4, 6, 8, 12, 48].map((n) => (
                    <option key={n} value={n}>
                      {n === 48 ? "All of them" : n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {meta.needsAddress && (
            <p className="text-xs text-gray-400">
              {company.geocoding
                ? `Times only show when the assigned person can drive there from their previous stop and on to the next one${
                    company.driveLimitMinutes > 0 ? `, with no leg over ${company.driveLimitMinutes} min` : ""
                  }.`
                : "Drive time isn't being checked (maps aren't configured) — buffers are the only spacing between visits."}{" "}
              Business hours, service area and the drive limit live under{" "}
              <Link href="/app/settings/booking" className="underline">
                Scheduling rules
              </Link>
              .
            </p>
          )}
        </Card>

        <Card title="Who takes these" hint="whoever is free, then the person who has waited longest">
          {eligibleTeam.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Nobody on the team accepts online bookings yet. Turn on <strong>Bookable online</strong> for at least one person on the{" "}
              <Link href="/app/settings/team" className="font-semibold underline">
                Team page
              </Link>
              .
            </div>
          )}
          <div className="divide-y divide-gray-100">
            {team.map((u) => {
              const on = chosen.has(u.id);
              const row = draft.members.find((m) => m.userId === u.id);
              return (
                <div key={u.id} className={`flex items-center gap-3 py-2 ${u.bookable ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setMembers(e.target.checked ? [...draft.members, { userId: u.id, priority: 0 }] : draft.members.filter((m) => m.userId !== u.id))
                    }
                    className="h-4 w-4 accent-green-600"
                    aria-label={`Include ${u.name}`}
                  />
                  <Avatar name={u.name} userId={u.id} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">
                      {!u.bookable ? "Not bookable online — turn it on from the Team page" : draft.kind === "VIDEO_CALL" && !u.hasMeetingLink ? "No personal meeting link — the fallback below is used" : u.role.replace("USER", "Sales + Tech").toLowerCase()}
                    </p>
                  </div>
                  {on && draft.assignment === "PRIORITY" && (
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      Priority
                      <select
                        value={row?.priority ?? 0}
                        onChange={(e) => setMembers(draft.members.map((m) => (m.userId === u.id ? { ...m, priority: Number(e.target.value) } : m)))}
                        className="rounded-lg border border-gray-300 px-1.5 py-1 text-xs"
                      >
                        {[0, 1, 2, 3, 4, 5].map((p) => (
                          <option key={p} value={p}>
                            {p === 0 ? "Normal" : p === 5 ? "Highest" : `+${p}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="assignment" checked={draft.assignment === "ROUND_ROBIN"} onChange={() => update({ assignment: "ROUND_ROBIN" })} className="accent-green-600" />
              Round robin
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="assignment" checked={draft.assignment === "PRIORITY"} onChange={() => update({ assignment: "PRIORITY" })} className="accent-green-600" />
              Priority first, then round robin
            </label>
            {eligibleChosen.length > 0 && (
              <span className="text-xs text-gray-400">
                {eligibleChosen.length} {eligibleChosen.length === 1 ? "person takes" : "people take"} these bookings.
              </span>
            )}
          </div>
          {draft.kind === "VIDEO_CALL" && (
            <div>
              <label className={smallLabel}>Fallback meeting link</label>
              <input
                type="url"
                value={draft.meetingLink ?? ""}
                onChange={(e) => update({ meetingLink: e.target.value || null })}
                placeholder="https://meet.google.com/…"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-400">Used when the assigned person has no meeting link of their own (set per person on the Team page).</p>
            </div>
          )}
        </Card>

        <Card title="Confirmation">
          <div className="space-y-2">
            <label className="flex items-start gap-2.5">
              <input type="radio" name="confirmation" checked={draft.confirmation === "INSTANT"} onChange={() => update({ confirmation: "INSTANT" })} className="mt-0.5 accent-green-600" disabled={draft.paymentMode !== "NONE"} />
              <span className="text-sm text-gray-800">
                Confirm instantly
                <span className="block text-xs text-gray-500">The booking lands on the schedule and the customer gets a confirmation right away.</span>
              </span>
            </label>
            <label className={`flex items-start gap-2.5 ${draft.paymentMode !== "NONE" ? "opacity-50" : ""}`}>
              <input type="radio" name="confirmation" checked={draft.confirmation === "APPROVAL"} onChange={() => update({ confirmation: "APPROVAL" })} className="mt-0.5 accent-green-600" disabled={draft.paymentMode !== "NONE"} />
              <span className="text-sm text-gray-800">
                Hold for approval
                <span className="block text-xs text-gray-500">
                  Penciled in (dashed on the schedule) until someone accepts or declines it from the request. The slot stays held meanwhile.
                  {draft.paymentMode !== "NONE" ? " Not available when payment is collected at booking." : ""}
                </span>
              </span>
            </label>
          </div>
        </Card>

        {draft.kind === "SERVICE" && (
          <Card title="Payment at booking" hint="fixed-price services only">
            {!company.paymentsReady ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                Online payments aren&apos;t live for your account yet — finish payment setup under{" "}
                <Link href="/app/settings?s=payments" className="font-semibold underline">
                  Settings → Online Payments
                </Link>{" "}
                and this turns on.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {(
                    [
                      ["NONE", "Nothing at booking", "The job is scheduled; you invoice after the work like any other job."],
                      ["DEPOSIT", "Each service's deposit", "Uses the deposit rule on each price-book item (company default when an item has none)."],
                      ["FULL", "Pay in full", "The whole price is charged when they book. The final invoice nets to zero."],
                    ] as const
                  ).map(([mode, label, hint]) => (
                    <label key={mode} className="flex items-start gap-2.5">
                      <input type="radio" name="paymentMode" checked={draft.paymentMode === mode} onChange={() => update({ paymentMode: mode })} className="mt-0.5 accent-green-600" />
                      <span className="text-sm text-gray-800">
                        {label}
                        <span className="block text-xs text-gray-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {nonFixed.length > 0 && (
                  <p className="text-xs text-amber-700">
                    {nonFixed.map((p) => p.name).join(", ")} {nonFixed.length === 1 ? "isn't" : "aren't"} fixed-price, so payment can&apos;t be turned on until they&apos;re removed or set to a fixed price.
                  </p>
                )}
                {draft.paymentMode !== "NONE" && (
                  <p className="text-xs text-gray-400">
                    Cards are entered on your booking page through the same secure form as invoice payments — card numbers never touch WorkBench.
                    {company.surchargeEnabled ? " Your card surcharge applies." : ""} A declined card releases the time.
                  </p>
                )}
              </>
            )}
          </Card>
        )}

        <Card title="Customer options">
          <Toggle
            checked={draft.clientCanReschedule}
            onChange={(v) => update({ clientCanReschedule: v })}
            label="Customers can reschedule from their confirmation email"
            hint={draft.paymentMode !== "NONE" ? "Paid bookings: they move it to another open time; the payment stays." : "They pick another open time; the same person keeps it when free."}
          />
          <Toggle
            checked={draft.clientCanCancel}
            onChange={(v) => update({ clientCanCancel: v })}
            label="Customers can cancel from their confirmation email"
            hint={draft.paymentMode !== "NONE" ? "Not available for paid bookings — refunds stay your call." : "You're notified; the time opens up again."}
            disabled={draft.paymentMode !== "NONE"}
          />
          {(draft.clientCanReschedule || draft.clientCanCancel) && (
            <div className="max-w-xs">
              <label className={smallLabel}>Cutoff — no changes within</label>
              <select value={draft.cutoffHours} onChange={(e) => update({ cutoffHours: Number(e.target.value) })} className={inputClass}>
                {CUTOFF_CHOICES.map((h) => (
                  <option key={h} value={h}>
                    {h === 0 ? "No cutoff" : hoursLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Card>

        <Card title="Preview" hint="what customers see over the next 7 days, and who could take each time">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {meta.needsAddress && (
              <input
                value={previewAddress}
                onChange={(e) => setPreviewAddress(e.target.value)}
                placeholder="Sample customer address (with ZIP) to check drive time"
                className={`${inputClass} sm:flex-1`}
              />
            )}
            <button type="button" onClick={loadPreview} disabled={previewBusy} className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-4 text-sm font-semibold text-gray-800 disabled:opacity-50">
              {previewBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {preview ? "Refresh" : "Show open times"}
            </button>
          </div>
          {preview && (
            <div className="space-y-2">
              {preview.days.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No open times in the next week.{" "}
                  {preview.eligible.length === 0 ? "Nobody in the pool is bookable." : "Check business hours, working hours and the time blocks on the schedule."}
                </p>
              ) : (
                preview.days.map((d) => (
                  <div key={d.date} className="rounded-lg border border-gray-100 p-2.5">
                    <p className="text-xs font-semibold text-gray-700">
                      {d.label} <span className="font-normal text-gray-400">· {d.members.join(", ")}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {d.slots.map((s) => (
                        <span key={s.start} className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700" title={s.members.join(", ")}>
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
              {meta.needsAddress && (
                <p className="text-xs text-gray-400">{preview.driveAware ? "Drive time was checked against the sample address." : "No address given (or it couldn't be located) — times shown without drive checks."}</p>
              )}
            </div>
          )}
        </Card>

        <Card title="Sharing">
          {previewMode ? (
            <p className="text-sm text-gray-500">Links unlock once your account is approved.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{url}</code>
                <button type="button" onClick={() => copy(url, "url")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy link">
                  {copied === "url" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Open">
                  <ExternalLink size={14} />
                </a>
              </div>
              <details className="text-sm">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Code2 size={13} /> Embed on your website
                </summary>
                <div className="mt-2 flex items-start gap-2">
                  <textarea readOnly value={snippet} rows={4} className="min-w-0 flex-1 rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700" />
                  <button type="button" onClick={() => copy(snippet, "snippet")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy snippet">
                    {copied === "snippet" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </details>
              <p className="text-xs text-gray-400">
                Your booking menu lists every active type at{" "}
                <a href={`${baseUrl}/book/${company.slug}/schedule`} target="_blank" rel="noopener noreferrer" className="underline">
                  {baseUrl.replace(/^https?:\/\//, "")}/book/{company.slug}/schedule
                </a>
                .
              </p>
            </>
          )}
        </Card>

        <div className="flex justify-end">
          <button type="button" onClick={remove} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
            <Trash2 size={13} /> Delete booking type
          </button>
        </div>
      </div>
    </div>
  );
}
