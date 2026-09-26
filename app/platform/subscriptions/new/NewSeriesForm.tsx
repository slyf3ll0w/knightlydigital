"use client";

import { useState } from "react";
import { inputCls } from "@/components/Input";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { InfoTip } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import ContactPicker from "@/components/ContactPicker";
import ServiceChips, { type ServiceLite } from "@/components/ServiceChips";
import { titleFromServices } from "@/lib/service-title";

/**
 * Create a recurring series directly — the "mow the lawn every 2 weeks"
 * button Jobber calls a recurring job. Visits are the default; billing is an
 * opt-in section so a series can be visits-only. Tapping a price-book
 * service names the series, sets the visit length and the price to bill —
 * typing a name is optional.
 */

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  addresses: {
    id: string;
    label: string | null;
    address: string;
    city: string | null;
    state: string | null;
    zip: string | null;
  }[];
};

const FREQUENCIES = [
  { value: "WEEKLY", label: "Every week" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "MONTHLY", label: "Every month" },
  { value: "QUARTERLY", label: "Every 3 months" },
  { value: "ANNUALLY", label: "Every year" },
];

// Reads as "Every …" next to the select ("Every month", "Every 3 months")
const INTERVALS = [
  { value: "MONTHLY", label: "Month" },
  { value: "QUARTERLY", label: "3 months" },
  { value: "SEMIANNUAL", label: "6 months" },
  { value: "ANNUAL", label: "Year" },
];

// 30-minute time-of-day options ("" = Anytime)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const mins = i * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value: String(mins), label };
});

const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "480", label: "8 hours" },
];


export default function NewSeriesForm({
  contacts,
  team,
  services,
  prefilledContactId,
}: {
  contacts: Contact[];
  team: { id: string; name: string }[];
  services: ServiceLite[];
  prefilledContactId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactId, setContactId] = useState(prefilledContactId);
  const [propertyId, setPropertyId] = useState("");
  const [name, setName] = useState("");
  // Typed a name → stop auto-naming after the picked service
  const [nameTouched, setNameTouched] = useState(false);
  const [service, setService] = useState<ServiceLite | null>(null);
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("BIWEEKLY");
  const [firstVisit, setFirstVisit] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [visitDuration, setVisitDuration] = useState("60");
  // A one-person company never picks a crew — it's them (the visit generator
  // lands on them regardless; this just shows it)
  const [assignees, setAssignees] = useState<string[]>(team.length === 1 ? [team[0].id] : []);
  const [billing, setBilling] = useState<"none" | "perjob" | "plan">("none");
  const [unitPrice, setUnitPrice] = useState("");
  const [interval, setInterval] = useState("MONTHLY");
  const [autoBillJobs, setAutoBillJobs] = useState(false);

  const savedAddresses = contacts.find((c) => c.id === contactId)?.addresses ?? [];

  /** One tap: the service names the series, sets the visit length and the price. */
  function pickService(w: ServiceLite) {
    const next = service?.id === w.id ? null : w;
    setService(next);
    if (!nameTouched) setName(next ? next.name : "");
    if (next) {
      if (next.durationMinutes && next.durationMinutes > 0) setVisitDuration(String(next.durationMinutes));
      const price = Number(next.unitPrice) || 0;
      if (price > 0) setUnitPrice(String(price));
    }
  }

  const durationOptions =
    visitDuration && !DURATION_OPTIONS.some((d) => d.value === visitDuration)
      ? [...DURATION_OPTIONS, { value: visitDuration, label: `${Number(visitDuration)} min` }].sort((a, b) => Number(a.value) - Number(b.value))
      : DURATION_OPTIONS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) return setError("Pick a client.");
    const finalName = name.trim() || titleFromServices([service?.name]);
    if (!finalName) return setError("Pick a service, or give the series a name (e.g. Lawn mowing).");
    if (!firstVisit) return setError("Pick the first visit date.");
    if (billing !== "none" && !(parseFloat(unitPrice) > 0)) {
      return setError("Enter the price to bill, or turn billing off.");
    }
    setError("");
    setLoading(true);
    const { ok, data } = await postJson<{ id: string; visitsCreated?: number }>(
      "/api/app/subscriptions",
      {
        contactId,
        name: finalName,
        description,
        propertyId: propertyId || null,
        visitFrequency: frequency,
        nextVisitDate: firstVisit,
        visitStartMinutes: visitTime === "" ? null : Number(visitTime),
        visitDurationMinutes: Number(visitDuration) || 60,
        visitAssigneeIds: assignees,
        ...(billing === "plan" && { interval, unitPrice: parseFloat(unitPrice) || 0 }),
        ...(billing === "perjob" && {
          billPerVisit: true,
          unitPrice: parseFloat(unitPrice) || 0,
          ...(autoBillJobs ? {} : { holdForReview: true }),
        }),
      }
    );
    setLoading(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/subscriptions");
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackLink href="/app/subscriptions" />
        <PageTitle>New recurring plan</PageTitle>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">What repeats</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client *</label>
            <ContactPicker
              contacts={contacts}
              value={contactId}
              onChange={(id) => {
                setContactId(id);
                setPropertyId("");
              }}
            />
          </div>
          <ServiceChips items={services} selectedIds={service ? [service.id] : []} onToggle={pickService} />
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Plan name{services.length > 0 ? " (optional)" : " *"}
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(e.target.value.trim().length > 0);
              }}
              placeholder={services.length > 0 ? "Defaults to the service picked" : "e.g. Lawn mowing, Pool service"}
              maxLength={150}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">Each visit lands on the schedule as a job with this title.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes for the crew (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Gate code, where the equipment lives, ..."
              className={`${inputCls} resize-none`}
            />
          </div>
          {savedAddresses.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Service address</label>
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={inputCls}>
                <option value="">Primary address</option>
                {savedAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ? `${a.label}: ` : ""}
                    {[a.address, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Visit schedule</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Repeats *</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls}>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">First visit *</label>
              <input
                type="date"
                value={firstVisit}
                onChange={(e) => setFirstVisit(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time</label>
              <select value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className={inputCls}>
                <option value="">Anytime</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Length</label>
              <select
                value={visitDuration}
                onChange={(e) => setVisitDuration(e.target.value)}
                className={inputCls}
              >
                {durationOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {team.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Default crew</label>
              <div className="flex flex-wrap gap-2">
                {team.map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
                      assignees.includes(u.id)
                        ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={assignees.includes(u.id)}
                      onChange={(e) =>
                        setAssignees((list) =>
                          e.target.checked ? [...list, u.id] : list.filter((x) => x !== u.id)
                        )
                      }
                      className="sr-only"
                    />
                    {u.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                {team.length === 1
                  ? "It's just you — every visit lands on your schedule."
                  : "Copied onto every generated visit — individual visits can still be reassigned."}
              </p>
            </div>
          )}
        </div>

        <div className="ds-card p-5 space-y-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            Billing
            {billing !== "none" && (
              <InfoTip>
                {billing === "plan"
                  ? "The first invoice goes out (and the card on file is charged) as soon as you start the plan. Billing then repeats on the day that first payment succeeds — sign up on the 14th, get paid every month on the 14th."
                  : autoBillJobs
                    ? "Each completed visit's invoice is emailed right away — and charged to the card on file automatically when payments are live."
                    : "Bill the queue daily for per-visit invoices, or on the 1st for one itemized monthly invoice — your call, one click either way."}
              </InfoTip>
            )}
          </h2>
          <div className="space-y-2">
            {(
              [
                {
                  value: "perjob",
                  label: "Bill for completed work",
                  hint: "Priced per visit. Finished visits stack up in the Ready-to-bill queue — one click invoices and charges them all, or bill each automatically on completion.",
                },
                {
                  value: "plan",
                  label: "Monthly plan — auto-charge",
                  hint: "A flat amount charged to the card on file. First charge runs when the plan starts; it then repeats on the day that first payment lands.",
                },
                {
                  value: "none",
                  label: "No automatic billing",
                  hint: "A repeating job with no invoices — bill it yourself (or not at all).",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  billing === opt.value
                    ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="billing"
                  checked={billing === opt.value}
                  onChange={() => setBilling(opt.value)}
                  className="mt-0.5 h-4 w-4 accent-[color:var(--ds-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{opt.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {billing !== "none" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {billing === "plan" ? "Price *" : "Price per visit *"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>
              {billing === "plan" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Every</label>
                  <select value={interval} onChange={(e) => setInterval(e.target.value)} className={inputCls}>
                    {INTERVALS.map((iv) => (
                      <option key={iv.value} value={iv.value}>
                        {iv.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {billing === "perjob" && (
                <label className="col-span-2 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoBillJobs}
                    onChange={(e) => setAutoBillJobs(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[color:var(--ds-primary)]"
                  />
                  <span className="text-sm text-gray-700">
                    Bill each job automatically the moment it&apos;s completed
                    <span className="block text-xs text-gray-500">
                      Off = completed work waits in the Ready-to-bill queue until you bill it.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Start plan
          </button>
          <Link href="/app/subscriptions" className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
