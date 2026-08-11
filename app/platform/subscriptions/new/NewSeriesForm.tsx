"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import ContactPicker from "@/components/ContactPicker";

/**
 * Create a recurring series directly — the "mow the lawn every 2 weeks"
 * button Jobber calls a recurring job. Visits are the default; billing is an
 * opt-in section so a series can be visits-only, and the price book isn't
 * involved at all.
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

const INTERVALS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMIANNUAL", label: "Every 6 months" },
  { value: "ANNUAL", label: "Annually" },
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

const inputCls =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function NewSeriesForm({
  contacts,
  team,
  prefilledContactId,
}: {
  contacts: Contact[];
  team: { id: string; name: string }[];
  prefilledContactId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactId, setContactId] = useState(prefilledContactId);
  const [propertyId, setPropertyId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("BIWEEKLY");
  const [firstVisit, setFirstVisit] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [visitDuration, setVisitDuration] = useState("60");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [billing, setBilling] = useState<"none" | "visit" | "monthly" | "schedule">("none");
  const [unitPrice, setUnitPrice] = useState("");
  const [interval, setInterval] = useState("MONTHLY");
  const [invoiceMode, setInvoiceMode] = useState<"SEND" | "DRAFT">("SEND");

  const savedAddresses = contacts.find((c) => c.id === contactId)?.addresses ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) return setError("Pick a client.");
    if (!name.trim()) return setError("Give the series a name (e.g. Lawn mowing).");
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
        name: name.trim(),
        description,
        propertyId: propertyId || null,
        visitFrequency: frequency,
        nextVisitDate: firstVisit,
        visitStartMinutes: visitTime === "" ? null : Number(visitTime),
        visitDurationMinutes: Number(visitDuration) || 60,
        visitAssigneeIds: assignees,
        ...(billing === "schedule" && { interval, unitPrice: parseFloat(unitPrice) || 0 }),
        ...(billing === "visit" && { billPerVisit: true, unitPrice: parseFloat(unitPrice) || 0 }),
        ...(billing === "monthly" && {
          billPerVisit: true,
          consolidateMonthly: true,
          unitPrice: parseFloat(unitPrice) || 0,
        }),
        ...(billing !== "none" && { invoiceMode }),
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
        <Link href="/app/subscriptions" className="hidden lg:block text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">New Recurring Series</h1>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">Series name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lawn mowing, Pool service"
              maxLength={150}
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">Each visit lands on the schedule as a job with this title.</p>
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

        <div className="card-ledger p-5 space-y-4">
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
                {DURATION_OPTIONS.map((d) => (
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
                        ? "border-green-500 bg-green-50 text-green-700"
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
              <p className="text-xs text-gray-400 mt-1.5">
                Copied onto every generated visit — individual visits can still be reassigned.
              </p>
            </div>
          )}
        </div>

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Billing</h2>
          <div className="space-y-2">
            {(
              [
                {
                  value: "none",
                  label: "No automatic billing",
                  hint: "A repeating job with no automatic invoices — invoice each visit yourself (or not at all).",
                },
                {
                  value: "visit",
                  label: "Bill after each visit",
                  hint: "Completing a visit generates its invoice on the spot — per-cut mows, per-clean pricing.",
                },
                {
                  value: "monthly",
                  label: "Bill monthly for completed visits",
                  hint: "Per-visit pricing, one invoice on the 1st listing the month's visits — the cleaning-service norm.",
                },
                {
                  value: "schedule",
                  label: "Bill a flat amount on a schedule",
                  hint: "One recurring invoice regardless of visits — the classic pool-service / membership model.",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  billing === opt.value
                    ? "border-green-500 bg-green-50/50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="billing"
                  checked={billing === opt.value}
                  onChange={() => setBilling(opt.value)}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{opt.label}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {billing !== "none" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {billing === "schedule" ? "Price per cycle *" : "Price per visit *"}
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
              {billing === "schedule" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bills</label>
                  <select value={interval} onChange={(e) => setInterval(e.target.value)} className={inputCls}>
                    {INTERVALS.map((iv) => (
                      <option key={iv.value} value={iv.value}>
                        {iv.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={billing === "schedule" ? "col-span-2" : ""}>
                <label className="block text-xs text-gray-500 mb-1">Invoices are</label>
                <select
                  value={invoiceMode}
                  onChange={(e) => setInvoiceMode(e.target.value as "SEND" | "DRAFT")}
                  className={inputCls}
                >
                  <option value="SEND">Sent automatically</option>
                  <option value="DRAFT">Drafted for my review</option>
                </select>
              </div>
              <p className="col-span-2 text-xs text-gray-400">
                {billing === "visit"
                  ? invoiceMode === "SEND"
                    ? "Each completed visit's invoice is emailed right away — and charged to the client's card on file automatically when payments are live."
                    : "Each completed visit leaves a draft invoice to review and send."
                  : billing === "monthly"
                    ? invoiceMode === "SEND"
                      ? "On the 1st, the month's completed visits go out as one itemized invoice — charged to the card on file automatically when payments are live."
                      : "On the 1st, the month's completed visits become one itemized draft invoice to review and send."
                    : "The first invoice goes out one billing cycle from today; each cycle auto-generates the next."}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Start Series
          </button>
          <Link href="/app/subscriptions" className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
