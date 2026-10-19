"use client";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import { InfoTip } from "@/components/ds";
import { Loader2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { localInputToISO } from "@/lib/statuses";
import SlotTimePicker, { SlotTimeSelect } from "@/components/SlotTimePicker";
import ContactPicker from "@/components/ContactPicker";
import SuggestedTimes from "@/components/SuggestedTimes";
import DayChips from "@/components/DayChips";
import DurationChips, { durationChoiceFor } from "@/components/DurationChips";
import MoreDetails from "@/components/MoreDetails";
import { useRememberedDuration } from "@/lib/duration-pref";
import { saveNewServices } from "@/lib/save-new-services";
import { type PickerWorkItem } from "@/components/WorkItemPicker";
import LineItemsEditor, {
  type EditorLineItem,
  payloadRecurringInterval,
} from "@/components/LineItemsEditor";
import {
  DEFAULT_SLOT_INTERVAL_MINUTES,
  DEFAULT_JOB_DURATION_MINUTES,
  addMinutesToLocalDateTime,
  endFollowingStart,
  joinLocalDateTime,
  splitLocalDateTime,
} from "@/lib/scheduling";
import ScheduleHeadsUp, { useScheduleCheck } from "@/components/ScheduleHeadsUp";
import { ARRIVAL_WINDOW_CHOICES, arrivalWindowChoiceLabel } from "@/lib/arrival-window";
import { looksLikeAppointment } from "@/lib/appointment-hint";
import { titleFromServices } from "@/lib/service-title";
import { RecentTitleOptions, refreshRecentTitles, useRecentTitles } from "@/components/RecentTitles";

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

const inputCls =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

/** Whole minutes from one local `YYYY-MM-DDTHH:mm` to another (null when either is incomplete). */
function minutesBetween(start: string, end: string): number | null {
  const a = splitLocalDateTime(start);
  const b = splitLocalDateTime(end);
  if (!a.time || !b.time) return null;
  const toMs = (p: { date: string; time: string }) => {
    const [y, mo, d] = p.date.split("-").map(Number);
    const [h, mi] = p.time.split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi).getTime();
  };
  return Math.round((toMs(b) - toMs(a)) / 60_000);
}

/**
 * New Job, streamlined (David 2026-10-16: pen-and-paper people need three
 * fields, not fifteen). On top: who, what (the services), when — a day chip,
 * a start time and a length. Everything else (title, description, lead
 * source, arrival window, crew, job-site address) waits behind "More
 * details". The job is named after its services unless a title is typed,
 * the address comes from the customer, the crew defaults to the person
 * creating it, and the length chip remembers last time's pick.
 */
function NewJobForm({ actorId }: { actorId: string }) {
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
  // Anything touched since the page opened: leaving asks first. Prefills
  // (the request's details, the client's address) land through effects,
  // not events, so they never count.
  const [dirty, setDirty] = useState(false);
  const touch = () => setDirty(true);
  useUnsavedWarning(dirty && !loading);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [workItems, setWorkItems] = useState<PickerWorkItem[]>([]);
  const [lineItems, setLineItems] = useState<EditorLineItem[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  // Outsourced = a subcontractor does it; the one legitimate empty crew
  const [outsourced, setOutsourced] = useState(false);
  const [outsourcedTo, setOutsourcedTo] = useState("");
  // Typed a title → stop auto-naming the job after its services
  const [titleTouched, setTitleTouched] = useState(false);
  const recentTitles = useRecentTitles("job");
  const [interval, setInterval] = useState(DEFAULT_SLOT_INTERVAL_MINUTES);
  const [dayStart, setDayStart] = useState(8 * 60);
  // Day-first scheduling: a date handed in from the schedule starts as
  // "Anytime that day" — the route plan gives it a time later
  const [anytime, setAnytime] = useState(Boolean(prefilledDate));
  const [window_, setWindow] = useState(""); // arrival window: "" = company default
  // How long: a chip (minutes) or Custom (null → an End time shows)
  const [duration, setDuration] = useRememberedDuration("job", DEFAULT_JOB_DURATION_MINUTES);
  const [more, setMore] = useState(false);
  const [addressNudged, setAddressNudged] = useState(false);
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
    // A 401/403 body isn't a list — `contacts.find` used to throw on it
    fetch("/api/app/contacts")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Contact[]) => setContacts(Array.isArray(list) ? list : []))
      .catch(() => {});
    // Team list is manager-only; non-managers just don't see the assign section
    fetch("/api/app/team")
      .then((r) => (r.ok ? r.json() : []))
      .then((users: TeamUser[]) => {
        const active = Array.isArray(users) ? users.filter((u) => u.isActive) : [];
        setTeam(active);
        // A one-person company never picks a crew — it's them. With a team,
        // the job lands on whoever is creating it (David 2026-10-16); the
        // crew can be changed under More details.
        if (active.length === 1) setAssigneeIds([active[0].id]);
        else if (active.some((u) => u.id === actorId)) setAssigneeIds([actorId]);
      })
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
  }, [actorId]);

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
        if (req.title) setTitleTouched(true);
      })
      .catch(() => {});
  }, [requestId]);

  // Picking a customer fills the job-site address from their record — but
  // never over one the user typed or picked: the contacts fetch can land
  // after they've already started on the address, and switching customers
  // only replaces an address we filled in ourselves. The saved-property link
  // always resets on a switch (it belonged to the previous customer).
  const [addressTouched, setAddressTouched] = useState(false);
  useEffect(() => {
    if (!form.contactId) return;
    const c = contacts.find((c) => c.id === form.contactId);
    setForm((f) => ({
      ...f,
      propertyId: "",
      ...(addressTouched ? {} : { address: c?.address ?? "" }),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contactId, contacts]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const { date: pickedDate, time: pickedTime } = splitLocalDateTime(form.scheduledAt);

  /** A new start: the end follows it by the chosen length (or keeps its old length on Custom). */
  function applyStart(nextStart: string) {
    setForm((f) => ({
      ...f,
      scheduledAt: nextStart,
      scheduledEnd:
        duration != null && nextStart.length >= 16
          ? addMinutesToLocalDateTime(nextStart, duration)
          : endFollowingStart(f.scheduledAt, f.scheduledEnd, nextStart, DEFAULT_JOB_DURATION_MINUTES),
    }));
    touch();
  }

  function applyDuration(minutes: number | null) {
    setDuration(minutes);
    if (minutes != null && form.scheduledAt.length >= 16) {
      set("scheduledEnd", addMinutesToLocalDateTime(form.scheduledAt, minutes));
    }
    touch();
  }

  function pickDay(d: string) {
    if (anytime) {
      set("scheduledAt", d ? `${d}T12:00` : "");
      touch();
      return;
    }
    applyStart(joinLocalDateTime(d, pickedTime));
  }

  function toggleAnytime(on: boolean) {
    setAnytime(on);
    // Anytime anchors at noon; a timed job starts from a bare day until a
    // time is picked (the old noon default read as a real 12:00 booking)
    if (on) set("scheduledAt", pickedDate ? `${pickedDate}T12:00` : "");
    else set("scheduledAt", pickedDate);
    set("scheduledEnd", "");
    touch();
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

  // Live heads-up: anyone on it already booked then, or unable to drive
  // there / on to their next stop in time (David 2026-10-06)
  const check = useScheduleCheck(
    anytime || outsourced
      ? null
      : {
          start: form.scheduledAt,
          end: form.scheduledEnd,
          userIds: assigneeIds,
          onSite: true,
          address: form.address || null,
          propertyId: form.propertyId || null,
          contactId: form.contactId || null,
        }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactId) {
      setError("Please select a contact.");
      return;
    }
    // A scheduled job needs somebody on it (or a subcontractor) — otherwise
    // it's on nobody's schedule, calendar sync, or booking availability
    if (form.scheduledAt && team.length > 0 && assigneeIds.length === 0 && !outsourced) {
      setError("Pick who's doing this job, or mark it outsourced.");
      setMore(true);
      return;
    }
    // The picker holds a bare "YYYY-MM-DD" until a time is chosen — that's
    // not a schedule yet, and it used to save as UTC midnight (the evening
    // before, in the Americas)
    if (!anytime && [form.scheduledAt, form.scheduledEnd].some((v) => v && v.length < 16)) {
      setError("Pick a time, or choose Anytime");
      return;
    }
    // A job with no address is no stop on the map or a route: say so once
    // and wait; the second press creates it anyway (a nudge, not a wall)
    if (!form.address.trim() && !form.propertyId && !addressNudged) {
      setAddressNudged(true);
      setMore(true);
      setError("This job has no address, so it won't show on the map or a route. Add one under More details, or press Create job again to go without.");
      return;
    }
    setError("");
    setLoading(true);

    const typedTitle = form.title.trim();
    const { ok, data } = await postJson<{ id: string; conflicts?: string[] }>("/api/app/jobs", {
      ...form,
      // Optional: blank → named after the services (or a generic label) server-side
      title: typedTitle || undefined,
      rememberTitle: titleTouched && Boolean(typedTitle),
      outsourced,
      outsourcedTo: outsourced ? outsourcedTo.trim() || undefined : undefined,
      // date-only scheduling anchors at noon (same convention as ScheduleJob)
      scheduledAt: anytime
        ? form.scheduledAt
          ? localInputToISO(`${form.scheduledAt.slice(0, 10)}T12:00`)
          : ""
        : localInputToISO(form.scheduledAt),
      scheduledEnd: anytime ? "" : localInputToISO(form.scheduledEnd),
      scheduledAnytime: anytime && Boolean(form.scheduledAt),
      arrivalWindowMinutes: window_ === "" ? null : Number(window_),
      assigneeIds: outsourced ? [] : assigneeIds,
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

    if (!ok || !data?.id) {
      setLoading(false);
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    // Typed, priced services join the price book for next time
    await saveNewServices(lineItems, workItems);
    setLoading(false);

    // Overlaps and drive time were shown live under the time fields
    // (ScheduleHeadsUp) — no second pop-up after the save.

    refreshRecentTitles();
    // Saved — the leave guard must not fire on the redirect
    setDirty(false);
    router.push(`/app/jobs/${data.id}`);
  }

  const timed = !anytime && Boolean(pickedDate);

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackLink href="/app/jobs" />
        <PageTitle>New Job</PageTitle>
      </div>

      <form onSubmit={handleSubmit} onChange={touch} className="space-y-5">
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="ds-card p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
            <ContactPicker
              contacts={contacts}
              value={form.contactId}
              onChange={(id) => {
                set("contactId", id);
                touch();
              }}
              // A client added from the sheet joins the list with the address
              // they were saved with, so the job site fills in like any other pick
              onCreated={(c) =>
                setContacts((cur) => [
                  ...cur,
                  { id: c.id, firstName: c.firstName, lastName: c.lastName, address: c.address ?? null, city: null, state: null, zip: null, addresses: [] },
                ])
              }
              placeholder="Select a customer…"
              title="Select a customer"
            />
            {/* Where the job is, without a field: it comes from the customer */}
            {selectedContact && !more && (
              <p className="mt-1.5 text-xs text-gray-500">
                {form.address ? <>Job site: {form.address}</> : "No address on file for them yet"}{" "}
                <button type="button" onClick={() => setMore(true)} className="ds-link font-medium">
                  Change
                </button>
              </p>
            )}
          </div>
          {/* Estimates and meetings aren't billable work: steer them to the
              record that ends with an optional quote instead of an invoice */}
          {looksLikeAppointment(form.title) && (
            <p className="text-xs text-[color:var(--ds-warn)]">
              Sounds like an appointment (an estimate or a meeting) rather than billable work.
              Appointments end with an optional quote, never an invoice.{" "}
              <Link
                href={`/app/appointments/new?${new URLSearchParams({
                  ...(form.contactId ? { contactId: form.contactId } : {}),
                  title: form.title.trim(),
                }).toString()}`}
                className="font-semibold underline"
              >
                Book it as an appointment
              </Link>
            </p>
          )}
        </div>

        {/* Services from the price book — the whole point of doing jobs is to
            get paid: picking them here prices the job, builds its close-out
            checklist, and (for recurring services) can start the client's
            plan. No overflow-hidden: the picker dropdown must spill past the
            card edge. */}
        <div className="ds-card">
          <div className="px-5 py-4 border-b border-gray-100">
            <SectionHeader
              title="What"
              hint="The services — they price the job and name it. Typed ones are saved to your Services for next time."
            />
          </div>
          <LineItemsEditor
            items={lineItems}
            onChange={(items) => {
              setLineItems(items);
              touch();
              // Picking services names the job until a title is typed
              if (!titleTouched) set("title", titleFromServices(items.map((li) => li.name.trim()).filter(Boolean)));
            }}
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

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">When</h2>

          <DayChips value={pickedDate} onChange={pickDay} ariaLabel="Day" />

          {timed && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <SlotTimeSelect
                  time={pickedTime}
                  onChange={(t) => applyStart(joinLocalDateTime(pickedDate, t))}
                  intervalMinutes={interval}
                  dayStartMinutes={dayStart}
                  className={inputCls}
                  ariaLabel="Start time"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">How long</label>
                <DurationChips value={duration} onChange={applyDuration} />
              </div>
            </div>
          )}
          {timed && duration === null && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <SlotTimePicker
                value={form.scheduledEnd}
                intervalMinutes={interval}
                dayStartMinutes={dayStart}
                inputCls={inputCls}
                ariaLabel="End"
                onChange={(next) => {
                  set("scheduledEnd", next);
                  touch();
                }}
              />
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={anytime}
              onChange={(e) => toggleAnytime(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
            />
            Anytime (no set time)
          </label>
          {!anytime && <ScheduleHeadsUp result={check} />}
          {timed && assigneeIds.length > 0 && (
            <SuggestedTimes
              date={pickedDate}
              userId={assigneeIds[0]}
              address={form.address}
              durationMinutes={duration ?? DEFAULT_JOB_DURATION_MINUTES}
              onPick={(s, e) => {
                set("scheduledAt", s);
                set("scheduledEnd", e);
                const mins = minutesBetween(s, e);
                if (mins != null) setDuration(durationChoiceFor(mins));
                touch();
              }}
            />
          )}
        </div>

        <MoreDetails
          open={more}
          onOpenChange={setMore}
          hint="title, notes, lead source, arrival window, crew, job site"
        >
          <div className="ds-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">More details</h2>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                Job title <span className="text-xs font-normal text-gray-400">(optional)</span>
                <InfoTip label="Who sees the job title?">
                  Your client sees this. It&apos;s in their visit reminders and on their client portal. Leave it blank and the job is named after the services you pick. WorkBench remembers what you type here and offers it next time.
                </InfoTip>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  set("title", e.target.value);
                  setTitleTouched(e.target.value.trim().length > 0);
                }}
                list="recent-job-titles"
                className={inputCls}
                placeholder="Defaults to the services picked above"
              />
              <RecentTitleOptions id="recent-job-titles" titles={recentTitles} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="Details about the job, scope, special instructions…"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                Lead source
                <InfoTip>Used in Insights to show which sources bring in the most revenue.</InfoTip>
              </div>
              <input
                type="text"
                list="lead-sources"
                value={form.leadSource}
                onChange={(e) => set("leadSource", e.target.value)}
                className={inputCls}
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
            </div>

            {!anytime && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Arrival window <span className="text-xs font-normal text-gray-400">(what the client is promised)</span>
                </label>
                <select
                  value={window_}
                  onChange={(e) => setWindow(e.target.value)}
                  className="w-full sm:w-64 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
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
                <div className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                  Assign to
                  <InfoTip>
                    {team.length === 1
                      ? "It's just you, so your jobs land on your schedule and calendar sync automatically."
                      : "Starts on you. Assigned techs see this job on their schedule, get it in their calendar sync, and their online-booking availability blocks off this time. A scheduled job needs someone on it unless it's outsourced."}
                  </InfoTip>
                </div>
                <div className={`space-y-1.5 ${outsourced ? "opacity-50" : ""}`}>
                  {team.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 text-sm text-gray-700 select-none w-fit"
                    >
                      <input
                        type="checkbox"
                        checked={!outsourced && assigneeIds.includes(u.id)}
                        disabled={outsourced}
                        onChange={() =>
                          setAssigneeIds((ids) =>
                            ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]
                          )
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 accent-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
                      />
                      {u.name}
                      {u.id === actorId && <span className="text-xs text-gray-400">(you)</span>}
                    </label>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 select-none w-fit">
                  <input
                    type="checkbox"
                    checked={outsourced}
                    onChange={(e) => setOutsourced(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
                  />
                  Outsourced to a subcontractor
                </label>
                {outsourced && (
                  <input
                    type="text"
                    value={outsourcedTo}
                    onChange={(e) => setOutsourcedTo(e.target.value)}
                    className="mt-2 w-full sm:w-64 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                    placeholder="Who's doing it (optional)"
                  />
                )}
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
                      setAddressTouched(true);
                      setForm((f) => ({
                        ...f,
                        address: choice.line,
                        propertyId: choice.key === "primary" ? "" : choice.key,
                      }));
                    }
                  }}
                  className={`${inputCls} mb-2 text-gray-600`}
                >
                  <option value="">Pick a saved address…</option>
                  {addressChoices.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}: {a.line}
                    </option>
                  ))}
                </select>
              )}
              <AddressAutocomplete
                endpoint="/api/app/geocode/suggest"
                value={form.address}
                onChange={(v) => {
                  // Typing a custom address breaks the saved-property link
                  setAddressTouched(true);
                  setForm((f) => ({ ...f, address: v, propertyId: "" }));
                  if (v.trim() && addressNudged) {
                    setAddressNudged(false);
                    setError("");
                  }
                }}
                onPick={(a) => {
                  setAddressTouched(true);
                  setForm((f) => ({ ...f, address: a.label, propertyId: "" }));
                  setAddressNudged(false);
                  setError("");
                }}
                className={inputCls}
                placeholder="Defaults to customer address"
              />
            </div>
          </div>
        </MoreDetails>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create job
          </button>
          <Link
            href="/app/jobs"
            className="ds-btn ds-btn-outline"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

// Rendered by the server page.tsx next door, which gates the role first
export default function NewJobClient({ actorId }: { actorId: string }) {
  return (
    <Suspense>
      <NewJobForm actorId={actorId} />
    </Suspense>
  );
}
