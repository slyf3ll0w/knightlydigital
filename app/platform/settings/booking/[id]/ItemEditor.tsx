"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Code2, Copy, ExternalLink, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { ARRIVAL_WINDOW_CHOICES, arrivalWindowChoiceLabel } from "@/lib/arrival-window";
import {
  BUFFER_CHOICES,
  CUTOFF_CHOICES,
  HORIZON_CHOICES,
  KIND_META,
  LEAD_CHOICES,
  STEP_CHOICES,
  durationLabel,
  servicePriceLabel,
  type BookingTypeSettings,
} from "@/lib/booking-types";
import { defaultButtonLabel, type BookingIntake, type CustomField, type CustomFieldType, type FieldOption } from "@/lib/booking-intake";
import { KIND_ICON } from "@/lib/booking-icons";

/**
 * One item's editor: sections on the left, the real public page on the
 * right (an iframe of /book/[slug]/[item]?preview=1, which renders even
 * while the item is off). Autosaves with the Saving… / Saved header the rest
 * of Settings uses; the preview reloads after each save.
 */

type Draft = BookingTypeSettings & {
  id: string;
  slug: string;
  members: { userId: string; priority: number }[];
  services: string[];
  intake: BookingIntake;
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

const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const smallLabel = "mb-1 block text-xs font-medium text-gray-500";
const fieldTypeLabels: Record<CustomFieldType, string> = { text: "Short text", textarea: "Paragraph", select: "Dropdown", radio: "Multiple choice" };
const hoursLabel = (h: number) => (h === 0 ? "No minimum" : h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${h / 24} day${h === 24 ? "" : "s"}`);

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card-ledger space-y-3 p-4 lg:p-5">
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-green-500" : "bg-gray-300"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function Radio({ name, checked, onChange, label, hint, disabled }: { name: string; checked: boolean; onChange: () => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="mt-0.5 accent-green-600" />
      <span className="text-sm text-gray-800">
        {label}
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Choice list edited as rows — no syntax to learn. */
function OptionRows({ options, onChange, withDescriptions }: { options: FieldOption[]; onChange: (o: FieldOption[]) => void; withDescriptions: boolean }) {
  const set = (i: number, patch: Partial<FieldOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="text" value={o.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={`Choice ${i + 1}`} className={inputClass} />
            {withDescriptions && <input type="text" value={o.description ?? ""} onChange={(e) => set(i, { description: e.target.value || undefined })} placeholder="Description (optional)" className={inputClass} />}
          </div>
          <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="mt-2 text-gray-300 transition-colors hover:text-red-500" aria-label="Remove choice">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...options, { label: "" }])} className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline">
        <Plus size={12} />
        Add choice
      </button>
    </div>
  );
}

export default function ItemEditor({
  item: initial,
  team,
  priceBook,
  contactFieldDefs,
  company,
  baseUrl,
  previewMode,
}: {
  item: Draft;
  team: TeamRow[];
  priceBook: PriceRow[];
  contactFieldDefs: { id: string; label: string }[];
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
  const [previewKey, setPreviewKey] = useState(0);
  const [embedOpen, setEmbedOpen] = useState(false);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = KIND_META[draft.kind];
  const KindIcon = KIND_ICON[draft.kind];
  const scheduled = draft.mode === "SCHEDULE";
  const url = `${baseUrl}/book/${company.slug}/${draft.slug}`;
  const embedSrc = `${baseUrl}/embed/${company.slug}/${draft.slug}`;
  const previewSrc = `/book/${company.slug}/${draft.slug}?preview=1`;

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
    // The server clamps/derives (kind + mode invariants, slug) — sync those back
    if (data) {
      setDraft((d) => ({
        ...d,
        slug: data.slug ?? d.slug,
        mode: data.mode ?? d.mode,
        confirmation: data.confirmation ?? d.confirmation,
        paymentMode: data.paymentMode ?? d.paymentMode,
        arrivalWindowMinutes: data.arrivalWindowMinutes ?? d.arrivalWindowMinutes,
        clientCanReschedule: data.clientCanReschedule ?? d.clientCanReschedule,
        clientCanCancel: data.clientCanCancel ?? d.clientCanCancel,
      }));
    }
    setPreviewKey((k) => k + 1);
    router.refresh();
  }, [draft.id, router]);

  const update = useCallback(
    (patch: Partial<Draft>, extra: Record<string, unknown> = {}) => {
      setDraft((d) => ({ ...d, ...patch }));
      pending.current = { ...pending.current, ...patch, ...extra };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setMembers = (members: Draft["members"]) => update({ members }, { members });
  const setServices = (services: string[]) => update({ services }, { services });
  const setIntake = (patch: Partial<BookingIntake>) => {
    const intake = { ...draft.intake, ...patch };
    update({ intake }, { intake });
  };
  const setField = (key: keyof BookingIntake["fields"], patch: Partial<BookingIntake["fields"]["email"]>) =>
    setIntake({ fields: { ...draft.intake.fields, [key]: { ...draft.intake.fields[key], ...patch } } });
  const setCustom = (id: string, patch: Partial<CustomField>) => setIntake({ customFields: draft.intake.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const moveCustom = (id: string, dir: -1 | 1) => {
    const fields = [...draft.intake.customFields];
    const i = fields.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    setIntake({ customFields: fields });
  };

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
    if (!(await confirmSheet({ title: `Delete "${draft.name}"?`, message: "Bookings and requests it already produced stay. Its link and any embed of it stop working.", confirmLabel: "Delete", destructive: true }))) return;
    const { ok, data } = await postJson(`/api/app/booking-types/${draft.id}`, undefined, "DELETE");
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.push("/app/settings/booking");
  }

  // ── Open-times check (scheduled items) ─────────────────────────────────────
  type PreviewDay = { date: string; label: string; members: string[]; slots: { start: string; label: string; members: string[] }[] };
  const [times, setTimes] = useState<{ driveAware: boolean; days: PreviewDay[]; eligible: { name: string }[] } | null>(null);
  const [timesBusy, setTimesBusy] = useState(false);
  const [sampleAddress, setSampleAddress] = useState("");
  async function loadTimes() {
    setTimesBusy(true);
    try {
      const q = sampleAddress.trim() ? `?address=${encodeURIComponent(sampleAddress.trim())}` : "";
      const res = await fetch(`/api/app/booking-types/${draft.id}/preview${q}`);
      const data = await res.json();
      if (res.ok) setTimes(data);
      else setError(data?.error ?? GENERIC_ERROR);
    } finally {
      setTimesBusy(false);
    }
  }

  const eligibleTeam = team.filter((u) => u.bookable);
  const chosen = new Set(draft.members.map((m) => m.userId));
  const eligibleChosen = draft.members.filter((m) => team.find((u) => u.id === m.userId)?.bookable);
  const pickedServices = draft.services.map((id) => priceBook.find((p) => p.id === id)).filter((p): p is PriceRow => Boolean(p));
  const nonFixed = pickedServices.filter((p) => p.priceDisplay !== "FIXED");
  const totalDuration = pickedServices.reduce((s, p) => s + (p.durationMinutes ?? draft.durationMinutes), 0);
  const intake = draft.intake;
  const f = intake.fields;
  const sq = intake.serviceQuestion;

  const snippet = `<iframe src="${embedSrc}" data-jobflow="${company.slug}/${draft.slug}" style="width:100%;border:0;min-height:640px" title="${draft.name} — ${company.name}"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${baseUrl ? new URL(baseUrl).origin : ""}"&&d&&d.type==="jobflow:height"&&d.slug==="${company.slug}/${draft.slug}"){var f=document.querySelector('iframe[data-jobflow="${company.slug}/${draft.slug}"]');if(f)f.style.height=d.height+"px";}});</script>`;

  /** One standard question row: label, shown, required — with the rule the kind/mode forces. */
  const fieldRow = (key: keyof BookingIntake["fields"], title: string, lock?: { note: string; show?: boolean; required?: boolean }) => {
    const v = f[key];
    const show = lock?.show ?? v.show;
    const required = lock?.required ?? v.required;
    return (
      <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
        <span className="w-24 text-[13px] font-semibold text-gray-500">{title}</span>
        <input type="text" value={v.label} onChange={(e) => setField(key, { label: e.target.value })} className={`${inputClass} min-w-[140px] flex-1`} />
        <label className={`flex items-center gap-1.5 text-xs ${lock?.show !== undefined ? "text-gray-300" : "cursor-pointer text-gray-600"}`}>
          <input type="checkbox" checked={show} disabled={lock?.show !== undefined} onChange={(e) => setField(key, { show: e.target.checked })} className="accent-green-600" />
          Shown
        </label>
        <label className={`flex items-center gap-1.5 text-xs ${!show || lock?.required !== undefined ? "text-gray-300" : "cursor-pointer text-gray-600"}`}>
          <input type="checkbox" checked={required} disabled={!show || lock?.required !== undefined} onChange={(e) => setField(key, { required: e.target.checked })} className="accent-green-600" />
          Required
        </label>
        {lock && <span className="basis-full text-xs text-gray-400">{lock.note}</span>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/app/settings/booking" className="hidden rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 lg:block" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <input value={draft.name} onChange={(e) => update({ name: e.target.value })} className="numeral-ledger w-full min-w-0 border-b border-transparent bg-transparent text-2xl font-semibold text-gray-900 hover:border-gray-300 focus:border-green-500 focus:outline-none" aria-label="Name" />
          <p className="flex items-center gap-1.5 text-sm text-gray-500">
            <KindIcon size={14} className="text-gray-400" />
            {meta.label}
            {scheduled ? " · customer picks a time" : " · you follow up"}
          </p>
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
        <Toggle checked={draft.isActive} onChange={(v) => update({ isActive: v })} label={draft.isActive ? "On" : "Off"} />
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="space-y-4">
          {/* How it works */}
          {meta.schedulable && (
            <Card title="How it works">
              <div className="space-y-2">
                <Radio name="mode" checked={scheduled} onChange={() => update({ mode: "SCHEDULE" })} label="Customer picks a time" hint="Open times come from your team's schedule. Confirmed on the spot, or held for your approval." />
                <Radio name="mode" checked={!scheduled} onChange={() => update({ mode: "REQUEST" })} label="They ask, you follow up" hint={draft.kind === "SERVICE" ? "Their picks become a quote. You schedule the work." : "Lands in Requests with what they wrote. You set the time."} />
              </div>
              {!scheduled && draft.kind === "SERVICE" && (
                <div className="max-w-xs">
                  <label className={smallLabel}>The quote is</label>
                  <select value={intake.quoteMode} onChange={(e) => setIntake({ quoteMode: e.target.value as "draft" | "send" })} className={inputClass}>
                    <option value="draft">Saved as a draft for you to review</option>
                    <option value="send">Sent to them for approval right away</option>
                  </select>
                </div>
              )}
            </Card>
          )}

          {/* Services */}
          {draft.kind === "SERVICE" && (
            <Card title="Services" hint="From your price book. Price, time on site and deposit come from there.">
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
                      {scheduled && p.durationMinutes == null && (
                        <p className="mt-1 text-xs text-amber-700">
                          No time on site set — uses the fallback duration ({durationLabel(draft.durationMinutes)}).{" "}
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
                  <select value="" onChange={(e) => e.target.value && setServices([...draft.services, e.target.value])} className={inputClass}>
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
              </div>
              <Toggle checked={intake.allowMultiple} onChange={(v) => setIntake({ allowMultiple: v })} label="Customers can pick more than one" hint={scheduled && pickedServices.length > 0 ? `The visit length is the sum — ${durationLabel(totalDuration)} if they pick everything.` : undefined} />
            </Card>
          )}

          {/* Timing */}
          {scheduled && (
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
                    <select value={draft.arrivalWindowMinutes ?? ""} onChange={(e) => update({ arrivalWindowMinutes: e.target.value === "" ? null : Number(e.target.value) })} className={inputClass}>
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
                <p className="text-xs text-gray-500">
                  {company.geocoding
                    ? `Times only show when the assigned person can drive there from their previous stop and on to the next one${company.driveLimitMinutes > 0 ? `, with no leg over ${company.driveLimitMinutes} min` : ""}.`
                    : "Drive time isn't being checked (maps aren't configured) — buffers are the only spacing between visits."}{" "}
                  Hours, service area and the drive limit are under{" "}
                  <Link href="/app/settings/booking" className="underline">
                    Scheduling rules
                  </Link>
                  .
                </p>
              )}
            </Card>
          )}

          {/* Who takes these */}
          {scheduled && (
            <Card title="Who takes these" hint="Whoever is free, then the person who has waited longest.">
              {eligibleTeam.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Nobody on the team takes online bookings yet. Turn on <strong>Bookable online</strong> for someone on the{" "}
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
                      <input type="checkbox" checked={on} onChange={(e) => setMembers(e.target.checked ? [...draft.members, { userId: u.id, priority: 0 }] : draft.members.filter((m) => m.userId !== u.id))} className="h-4 w-4 accent-green-600" aria-label={`Include ${u.name}`} />
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
                          <select value={row?.priority ?? 0} onChange={(e) => setMembers(draft.members.map((m) => (m.userId === u.id ? { ...m, priority: Number(e.target.value) } : m)))} className="rounded-lg border border-gray-300 px-1.5 py-1 text-xs">
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
                    {eligibleChosen.length} {eligibleChosen.length === 1 ? "person takes" : "people take"} these.
                  </span>
                )}
              </div>
              {draft.kind === "VIDEO_CALL" && (
                <div>
                  <label className={smallLabel}>Fallback meeting link</label>
                  <input type="url" value={draft.meetingLink ?? ""} onChange={(e) => update({ meetingLink: e.target.value || null })} placeholder="https://meet.google.com/…" className={inputClass} />
                  <p className="mt-1 text-xs text-gray-400">Used when the assigned person has no meeting link of their own (set per person on the Team page).</p>
                </div>
              )}
            </Card>
          )}

          {/* Confirmation */}
          {scheduled && (
            <Card title="Confirmation">
              <div className="space-y-2">
                <Radio name="confirmation" checked={draft.confirmation === "INSTANT"} onChange={() => update({ confirmation: "INSTANT" })} label="Confirm instantly" hint="The booking lands on the schedule and the customer gets a confirmation right away." disabled={draft.paymentMode !== "NONE"} />
                <Radio name="confirmation" checked={draft.confirmation === "APPROVAL"} onChange={() => update({ confirmation: "APPROVAL" })} label="Hold for approval" hint={`Penciled in (dashed on the schedule) until someone accepts or declines it from the request. The slot stays held meanwhile.${draft.paymentMode !== "NONE" ? " Not available when payment is collected at booking." : ""}`} disabled={draft.paymentMode !== "NONE"} />
              </div>
            </Card>
          )}

          {/* Payment */}
          {scheduled && draft.kind === "SERVICE" && (
            <Card title="Payment at booking" hint="Fixed-price services only.">
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
                      <Radio key={mode} name="paymentMode" checked={draft.paymentMode === mode} onChange={() => update({ paymentMode: mode })} label={label} hint={hint} />
                    ))}
                  </div>
                  {nonFixed.length > 0 && (
                    <p className="text-xs text-amber-700">
                      {nonFixed.map((p) => p.name).join(", ")} {nonFixed.length === 1 ? "isn't" : "aren't"} fixed-price, so payment can&apos;t be turned on until they&apos;re removed or set to a fixed price.
                    </p>
                  )}
                  {draft.paymentMode !== "NONE" && (
                    <p className="text-xs text-gray-500">
                      Cards are entered through the same secure form as invoice payments — card numbers never touch WorkBench.
                      {company.surchargeEnabled ? " Your card surcharge applies." : ""} A declined card releases the time.
                    </p>
                  )}
                </>
              )}
            </Card>
          )}

          {/* Questions */}
          <Card title="Questions" hint="What the form asks. Name is always asked.">
            <div className="space-y-2">
              {fieldRow("email", "Email", scheduled ? { note: "Needed for the confirmation and calendar invite.", show: true, required: true } : undefined)}
              {fieldRow("phone", "Phone", draft.kind === "PHONE_CALL" ? { note: "The number you'll call.", show: true, required: true } : undefined)}
              {scheduled && meta.needsAddress ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                  <span className="w-24 text-[13px] font-semibold text-gray-500">Address</span>
                  <span className="text-xs text-gray-500">Asked on its own step — open times depend on it.</span>
                </div>
              ) : (
                fieldRow("address", "Address")
              )}
              {!scheduled && draft.kind !== "MESSAGE" && fieldRow("date", "Date")}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                <span className="w-24 text-[13px] font-semibold text-gray-500">Message</span>
                <input type="text" value={intake.message.label} onChange={(e) => setIntake({ message: { ...intake.message, label: e.target.value } })} className={`${inputClass} min-w-[140px] flex-1`} />
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={intake.message.show} onChange={(e) => setIntake({ message: { ...intake.message, show: e.target.checked } })} className="accent-green-600" />
                  Shown
                </label>
                <label className={`flex items-center gap-1.5 text-xs ${intake.message.show ? "cursor-pointer text-gray-600" : "text-gray-300"}`}>
                  <input type="checkbox" checked={intake.message.required} disabled={!intake.message.show} onChange={(e) => setIntake({ message: { ...intake.message, required: e.target.checked } })} className="accent-green-600" />
                  Required
                </label>
                {intake.message.show && <input type="text" value={intake.message.placeholder} onChange={(e) => setIntake({ message: { ...intake.message, placeholder: e.target.value } })} placeholder="Placeholder text (optional)" className={`${inputClass} basis-full`} />}
              </div>
            </div>

            {draft.kind !== "SERVICE" && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={sq.show} onChange={(e) => setIntake({ serviceQuestion: { ...sq, show: e.target.checked } })} className="accent-green-600" />
                  Ask what they need
                  <span className="text-xs text-gray-400">— the answer becomes the request title</span>
                </label>
                {sq.show && (
                  <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                      <div>
                        <label className={smallLabel}>Label</label>
                        <input type="text" value={sq.label} onChange={(e) => setIntake({ serviceQuestion: { ...sq, label: e.target.value } })} className={inputClass} />
                      </div>
                      <div>
                        <label className={smallLabel}>Type</label>
                        <select value={sq.type} onChange={(e) => setIntake({ serviceQuestion: { ...sq, type: e.target.value as "text" | "select" | "radio" } })} className={inputClass}>
                          <option value="text">Text</option>
                          <option value="select">Dropdown</option>
                          <option value="radio">Multiple choice</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600">
                        <input type="checkbox" checked={sq.required} onChange={(e) => setIntake({ serviceQuestion: { ...sq, required: e.target.checked } })} className="accent-green-600" />
                        Required
                      </label>
                    </div>
                    {sq.type === "text" ? (
                      <input type="text" value={sq.placeholder} onChange={(e) => setIntake({ serviceQuestion: { ...sq, placeholder: e.target.value } })} placeholder="Placeholder text (optional)" className={inputClass} />
                    ) : (
                      <OptionRows options={sq.options} onChange={(options) => setIntake({ serviceQuestion: { ...sq, options } })} withDescriptions={sq.type === "radio"} />
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-sm text-gray-700">Your own questions</p>
              {intake.customFields.map((c, i) => (
                <div key={c.id} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <input type="text" value={c.label} onChange={(e) => setCustom(c.id, { label: e.target.value })} placeholder="Question, e.g. Gate code" className={inputClass} />
                      <select value={c.type} onChange={(e) => setCustom(c.id, { type: e.target.value as CustomFieldType })} className={inputClass}>
                        {(Object.keys(fieldTypeLabels) as CustomFieldType[]).map((t) => (
                          <option key={t} value={t}>
                            {fieldTypeLabels[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-0.5 pt-1.5">
                      <button type="button" onClick={() => moveCustom(c.id, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Move up">
                        <ChevronUp size={15} />
                      </button>
                      <button type="button" onClick={() => moveCustom(c.id, 1)} disabled={i === intake.customFields.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Move down">
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  </div>
                  {c.type === "select" || c.type === "radio" ? (
                    <OptionRows options={c.options ?? []} onChange={(options) => setCustom(c.id, { options })} withDescriptions={c.type === "radio"} />
                  ) : (
                    <input type="text" value={c.placeholder ?? ""} onChange={(e) => setCustom(c.id, { placeholder: e.target.value || undefined })} placeholder="Placeholder text (optional)" className={inputClass} />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={c.required} onChange={(e) => setCustom(c.id, { required: e.target.checked })} className="accent-green-600" />
                        Required
                      </label>
                      {contactFieldDefs.length > 0 && (
                        <label className="flex items-center gap-2 text-xs text-gray-500">
                          Save to client field
                          <select value={c.contactFieldId ?? ""} onChange={(e) => setCustom(c.id, { contactFieldId: e.target.value || undefined })} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs">
                            <option value="">Request notes only</option>
                            {contactFieldDefs.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <button type="button" onClick={() => setIntake({ customFields: intake.customFields.filter((x) => x.id !== c.id) })} className="flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-red-500">
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setIntake({ customFields: [...intake.customFields, { id: `field-${Math.random().toString(36).slice(2, 8)}`, label: "", type: "text", required: false }] })}
                disabled={intake.customFields.length >= 10}
                className="flex items-center gap-1.5 rounded-[10px] border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus size={14} />
                Add a question
              </button>
            </div>
          </Card>

          {/* Words */}
          <Card title="Words">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={smallLabel}>Heading</label>
                <input value={intake.heading} onChange={(e) => setIntake({ heading: e.target.value })} placeholder={draft.name} className={inputClass} />
              </div>
              <div>
                <label className={smallLabel}>Button</label>
                <input value={intake.buttonLabel} onChange={(e) => setIntake({ buttonLabel: e.target.value })} placeholder={defaultButtonLabel(draft)} maxLength={40} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={smallLabel}>Line under the heading</label>
              <textarea value={draft.description ?? ""} onChange={(e) => update({ description: e.target.value || null })} rows={2} placeholder={meta.hint} className={`${inputClass} resize-none`} />
            </div>
          </Card>

          {/* Customer options */}
          {scheduled && draft.kind !== "SERVICE" && (
            <Card title="After they book">
              <Toggle checked={draft.clientCanReschedule} onChange={(v) => update({ clientCanReschedule: v })} label="They can reschedule from the confirmation email" hint="They pick another open time; the same person keeps it when free." />
              <Toggle checked={draft.clientCanCancel} onChange={(v) => update({ clientCanCancel: v })} label="They can cancel from the confirmation email" hint="You're notified; the time opens up again." />
              {(draft.clientCanReschedule || draft.clientCanCancel) && (
                <div className="max-w-xs">
                  <label className={smallLabel}>No changes within</label>
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
          )}

          {/* Open times check */}
          {scheduled && (
            <Card title="Open times" hint="The next 7 days as customers would see them, and who could take each one.">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {meta.needsAddress && <input value={sampleAddress} onChange={(e) => setSampleAddress(e.target.value)} placeholder="Sample customer address (with ZIP) to check drive time" className={`${inputClass} sm:flex-1`} />}
                <button type="button" onClick={loadTimes} disabled={timesBusy} className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-4 text-sm font-semibold text-gray-800 disabled:opacity-50">
                  {timesBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {times ? "Refresh" : "Check"}
                </button>
              </div>
              {times && (
                <div className="space-y-2">
                  {times.days.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No open times in the next week. {times.eligible.length === 0 ? "Nobody in the pool is bookable." : "Check business hours, working hours and the time blocks on the schedule."}
                    </p>
                  ) : (
                    times.days.map((d) => (
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
                  {meta.needsAddress && <p className="text-xs text-gray-400">{times.driveAware ? "Drive time was checked against the sample address." : "No address given (or it couldn't be located) — times shown without drive checks."}</p>}
                </div>
              )}
            </Card>
          )}

          {/* Sharing */}
          <Card title="Sharing">
            <Toggle checked={draft.showOnPage} onChange={(v) => update({ showOnPage: v })} label="Show on my booking page" hint={draft.showOnPage ? `Listed at ${baseUrl.replace(/^https?:\/\//, "")}/book/${company.slug}.` : "Reachable only by its own link or embed."} />
            <div>
              <label className={smallLabel}>Link</label>
              <div className="flex items-center gap-1">
                <span className="hidden truncate text-xs text-gray-400 sm:inline">…/book/{company.slug}/</span>
                <input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} onBlur={(e) => update({}, { slug: e.target.value })} className={inputClass} aria-label="Link slug" />
                {!previewMode && (
                  <>
                    <button type="button" onClick={() => copy(url, "url")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy link">
                      {copied === "url" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Open">
                      <ExternalLink size={14} />
                    </a>
                  </>
                )}
              </div>
            </div>
            {previewMode ? (
              <p className="text-xs text-gray-500">Links unlock once your account is approved.</p>
            ) : (
              <div>
                <button type="button" onClick={() => setEmbedOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Code2 size={13} /> Embed on your website
                  {embedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {embedOpen && (
                  <div className="mt-2 flex items-start gap-2">
                    <textarea readOnly value={snippet} rows={4} className="min-w-0 flex-1 rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700" />
                    <button type="button" onClick={() => copy(snippet, "snippet")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy snippet">
                      {copied === "snippet" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="flex justify-end">
            <button type="button" onClick={remove} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>

        {/* Live preview — the real page */}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[13px] font-semibold text-gray-500">What customers see</p>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-xs text-gray-500 hover:text-gray-800" title="Reload preview">
                <RefreshCw size={13} />
              </button>
              <a href={previewSrc} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-800" title="Open preview">
                <ExternalLink size={13} />
              </a>
            </span>
          </div>
          <iframe key={previewKey} src={previewSrc} title="Preview" className="h-[720px] w-full rounded-lg border border-gray-200 bg-white" />
        </aside>
      </div>
    </div>
  );
}
