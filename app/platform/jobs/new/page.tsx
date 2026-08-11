"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";
import SlotTimePicker from "@/components/SlotTimePicker";
import ContactPicker from "@/components/ContactPicker";
import SuggestedTimes from "@/components/SuggestedTimes";
import { type PickerWorkItem } from "@/components/WorkItemPicker";
import LineItemsEditor, {
  type EditorLineItem,
  payloadRecurringInterval,
} from "@/components/LineItemsEditor";
import {
  addMinutesToLocalDateTime,
  DEFAULT_SLOT_INTERVAL_MINUTES,
  DEFAULT_JOB_DURATION_MINUTES,
} from "@/lib/scheduling";
import { ARRIVAL_WINDOW_CHOICES, arrivalWindowChoiceLabel } from "@/lib/arrival-window";

type ContactAddress = {
  id: string;
  label: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
};
type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  addresses?: ContactAddress[];
};
type TeamUser = { id: string; name: string; isActive: boolean };

function NewJobForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams.get("contactId") ?? "";
  const requestId = searchParams.get("requestId") ?? "";
  // Coming from the schedule: the day the dispatcher was looking at
  const prefilledDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") ?? "")
    ? searchParams.get("date")!
    : "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [workItems, setWorkItems] = useState<PickerWorkItem[]>([]);
  const [lineItems, setLineItems] = useState<EditorLineItem[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [interval, setInterval] = useState(DEFAULT_SLOT_INTERVAL_MINUTES);
  const [dayStart, setDayStart] = useState(8 * 60);
  // Day-first scheduling: a date handed in from the schedule starts as
  // "Anytime that day" — the route plan gives it a time later
  const [anytime, setAnytime] = useState(Boolean(prefilledDate));
  const [window_, setWindow] = useState(""); // arrival window: "" = company default
  const [form, setForm] = useState({
    contactId: prefilledContactId,
    requestId,
    title: "",
    description: "",
    leadSource: "",
    scheduledAt: prefilledDate ? `${prefilledDate}T12:00` : "",
    scheduledEnd: "",
    address: "",
    propertyId: "", // ContactAddress id when a saved extra address is picked
  });

  useEffect(() => {
    fetch("/api/app/contacts")
      .then((r) => r.json())
      .then(setContacts)
      .catch(() => {});
    // Team list is manager-only; non-managers just don't see the assign section
    fetch("/api/app/team")
      .then((r) => (r.ok ? r.json() : []))
      .then((users: TeamUser[]) =>
        setTeam(Array.isArray(users) ? users.filter((u) => u.isActive) : [])
      )
      .catch(() => {});
    // Price book for the services section
    fetch("/api/app/work-items")
      .then((r) => (r.ok ? r.json() : []))
      .then((items: PickerWorkItem[]) => setWorkItems(Array.isArray(items) ? items : []))
      .catch(() => {});
    fetch("/api/app/scheduling")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.intervalMinutes) setInterval(d.intervalMinutes);
        if (d?.dayStartMinutes) setDayStart(d.dayStartMinutes);
      })
      .catch(() => {});
  }, []);

  // Converting a request: carry its title and details into the job instead of
  // making the user retype what the client already wrote
  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/app/requests/${requestId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((req: { title?: string; details?: string | null } | null) => {
        if (!req) return;
        setForm((f) => ({
          ...f,
          title: f.title || req.title || "",
          description: f.description || req.details || "",
        }));
      })
      .catch(() => {});
  }, [requestId]);

  useEffect(() => {
    if (form.contactId) {
      const c = contacts.find((c) => c.id === form.contactId);
      setForm((f) => ({ ...f, propertyId: "", ...(c?.address ? { address: c.address } : {}) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contactId, contacts]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Saved-address quick pick — shown when the customer has more than one
  // address on file (primary + extras managed on their contact page)
  const selectedContact = contacts.find((c) => c.id === form.contactId);
  const line = (a: { address: string | null; city: string | null; state: string | null; zip: string | null }) =>
    [a.address, a.city, a.state, a.zip].filter(Boolean).join(", ");
  const addressChoices = selectedContact
    ? [
        ...(selectedContact.address
          ? [{ key: "primary", label: "Primary", line: line(selectedContact) }]
          : []),
        ...(selectedContact.addresses ?? []).map((a) => ({
          key: a.id,
          label: a.label || "Additional",
          line: line(a),
        })),
      ]
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactId) {
      setError("Please select a contact.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson<{ id: string }>("/api/app/jobs", {
      ...form,
      // date-only scheduling anchors at noon (same convention as ScheduleJob)
      scheduledAt: anytime
        ? form.scheduledAt
          ? localInputToISO(`${form.scheduledAt.slice(0, 10)}T12:00`)
          : ""
        : localInputToISO(form.scheduledAt),
      scheduledEnd: anytime ? "" : localInputToISO(form.scheduledEnd),
      scheduledAnytime: anytime && Boolean(form.scheduledAt),
      arrivalWindowMinutes: window_ === "" ? null : Number(window_),
      assigneeIds,
      lineItems: lineItems
        .filter((li) => li.name.trim())
        .map((li, i) => ({
          name: li.name,
          description: li.description,
          quantity: parseFloat(li.quantity) || 1,
          unitPrice: parseFloat(li.unitPrice) || 0,
          unitCost: !li.unitCost ? null : parseFloat(li.unitCost) || 0,
          workItemId: li.workItemId || null,
          // One-time sale of a recurring-capable service sends null — no
          // subscription starts for it
          recurringInterval: payloadRecurringInterval(li),
          sortOrder: i,
        })),
    });
    setLoading(false);

    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    router.push(`/app/jobs/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/jobs" className="hidden lg:block text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">New Job</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Job Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
            <ContactPicker
              contacts={contacts}
              value={form.contactId}
              onChange={(id) => set("contactId", id)}
              placeholder="Select a customer..."
              title="Select a customer"
            />
            <Link href="/app/contacts/new" className="text-xs text-green-600 hover:underline mt-1 inline-block">
              + Add new customer
            </Link>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. AC tune-up, Lawn maintenance, Roof inspection"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Details about the job, scope, special instructions..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
            <input
              type="text"
              list="lead-sources"
              value={form.leadSource}
              onChange={(e) => set("leadSource", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Where did this job come from?"
            />
            <datalist id="lead-sources">
              <option value="Google" />
              <option value="Referral" />
              <option value="Online booking" />
              <option value="Facebook" />
              <option value="Nextdoor" />
              <option value="Yard sign" />
              <option value="Repeat client" />
              <option value="Door hanger" />
            </datalist>
            <p className="text-xs text-gray-400 mt-1">
              Used in Insights to show which sources bring in the most revenue.
            </p>
          </div>
        </div>

        {/* Services from the price book — the whole point of doing jobs is to
            get paid: picking them here prices the job, builds its close-out
            checklist, and (for recurring services) can start the client's
            plan. No overflow-hidden: the picker dropdown must spill past the
            card edge. */}
        <div className="card-ledger">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Product / Service</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              What this job is for — used for the invoice and the job&apos;s checklist.
            </p>
          </div>
          <LineItemsEditor
            items={lineItems}
            onChange={setLineItems}
            workItems={workItems}
            allowEmpty
          />
          {lineItems.some((li) => li.name.trim()) && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-[7px] max-lg:rounded-b-[13px]">
              <div className="ml-auto w-56 flex justify-between text-sm font-bold">
                <span className="text-gray-900">Total price</span>
                <span className="text-gray-900">
                  $
                  {lineItems
                    .reduce(
                      (s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unitPrice) || 0),
                      0
                    )
                    .toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Scheduling</h2>

          {anytime ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.scheduledAt.slice(0, 10)}
                onChange={(e) => set("scheduledAt", e.target.value ? `${e.target.value}T12:00` : "")}
                className="w-full sm:w-56 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <SlotTimePicker
                  value={form.scheduledAt}
                  intervalMinutes={interval}
                  dayStartMinutes={dayStart}
                  inputCls="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  ariaLabel="Start"
                  onChange={(next) => {
                    set("scheduledAt", next);
                    if (!form.scheduledEnd && next.length >= 16) {
                      set(
                        "scheduledEnd",
                        addMinutesToLocalDateTime(next, DEFAULT_JOB_DURATION_MINUTES)
                      );
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                <SlotTimePicker
                  value={form.scheduledEnd}
                  intervalMinutes={interval}
                  dayStartMinutes={dayStart}
                  inputCls="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  ariaLabel="End"
                  onChange={(next) => set("scheduledEnd", next)}
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={anytime}
              onChange={(e) => setAnytime(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Anytime (no set time)
          </label>
          {!anytime && form.scheduledAt.length >= 10 && assigneeIds.length > 0 && (
            <SuggestedTimes
              date={form.scheduledAt.slice(0, 10)}
              userId={assigneeIds[0]}
              address={form.address}
              durationMinutes={DEFAULT_JOB_DURATION_MINUTES}
              onPick={(s, e) => {
                set("scheduledAt", s);
                set("scheduledEnd", e);
              }}
            />
          )}
          {!anytime && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arrival window <span className="text-xs font-normal text-gray-400">(what the client is promised)</span>
              </label>
              <select
                value={window_}
                onChange={(e) => setWindow(e.target.value)}
                className="w-full sm:w-64 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Company default</option>
                {ARRIVAL_WINDOW_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {arrivalWindowChoiceLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {team.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
              <div className="space-y-1.5">
                {team.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 text-sm text-gray-700 select-none w-fit"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(u.id)}
                      onChange={() =>
                        setAssigneeIds((ids) =>
                          ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    {u.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Assigned techs see this job on their schedule, and their online-booking
                availability blocks off this time.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job site address</label>
            {addressChoices.length > 1 && (
              <select
                value=""
                onChange={(e) => {
                  const choice = addressChoices.find((a) => a.key === e.target.value);
                  if (choice) {
                    // Saved EXTRA addresses link the job to that property so
                    // its history groups; the primary stays an unlinked string
                    setForm((f) => ({
                      ...f,
                      address: choice.line,
                      propertyId: choice.key === "primary" ? "" : choice.key,
                    }));
                  }
                }}
                className="w-full mb-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Pick a saved address...</option>
                {addressChoices.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}: {a.line}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={form.address}
              onChange={(e) =>
                // Typing a custom address breaks the saved-property link
                setForm((f) => ({ ...f, address: e.target.value, propertyId: "" }))
              }
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Defaults to customer address"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create Job
          </button>
          <Link
            href="/app/jobs"
            className="px-5 py-2.5 btn-tool-line bg-white text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense>
      <NewJobForm />
    </Suspense>
  );
}
