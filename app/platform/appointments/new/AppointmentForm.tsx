"use client";

import { useEffect, useState } from "react";
import { inputCls } from "@/components/Input";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Phone, Video } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { alertSheet } from "@/components/ConfirmSheet";
import { localInputToISO } from "@/lib/statuses";
import SlotTimePicker from "@/components/SlotTimePicker";
import ContactPicker from "@/components/ContactPicker";
import SuggestedTimes from "@/components/SuggestedTimes";
import { endFollowingStart } from "@/lib/scheduling";
import PeoplePicker from "@/components/PeoplePicker";
import ScheduleHeadsUp, { useScheduleCheck } from "@/components/ScheduleHeadsUp";
import { ARRIVAL_WINDOW_CHOICES, arrivalWindowChoiceLabel } from "@/lib/arrival-window";
import { InfoTip } from "@/components/ds";
import { RecentTitleOptions, refreshRecentTitles, useRecentTitles } from "@/components/RecentTitles";

/**
 * Book a sales meeting / estimate. Type drives the extra field:
 * in-person → address (required, prefilled from the client),
 * video → optional meeting link, phone → nothing extra.
 */

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  addresses?: {
    id: string;
    label: string | null;
    address: string;
    city: string | null;
    state: string | null;
    zip: string | null;
  }[];
};

// In-person first and default — most appointments in the trades are a visit
// (David 2026-10-02).
const TYPES = [
  { value: "IN_PERSON", label: "In-person", hint: "Meet at the client's address", icon: MapPin },
  { value: "PHONE_CALL", label: "Phone Call", hint: "Call the client at their number", icon: Phone },
  { value: "VIDEO_CALL", label: "Video Call", hint: "Zoom, Meet, Teams — paste a link", icon: Video },
] as const;


function contactAddress(c: ContactOption | undefined): string {
  if (!c) return "";
  return [c.address, c.city, c.state].filter(Boolean).join(", ");
}

export default function AppointmentForm({
  actorId,
  contacts,
  users,
  prefilledContactId,
  requestId,
  requestTitle,
  prefilledTitle = "",
  prefilledDate,
  intervalMinutes = 30,
  dayStartMinutes,
}: {
  actorId: string;
  contacts: ContactOption[];
  users: { id: string; name: string }[];
  prefilledContactId: string;
  requestId: string;
  requestTitle: string;
  prefilledTitle?: string;
  prefilledDate: string;
  intervalMinutes?: number;
  dayStartMinutes?: number;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState(prefilledContactId);
  // From a request, the purpose names it; otherwise the box starts with the
  // last purpose this person typed (blank = "Estimate" on save).
  const linkedTitle = prefilledTitle || (requestTitle ? `Estimate — ${requestTitle}` : "");
  const [title, setTitle] = useState(linkedTitle);
  const [titleTyped, setTitleTyped] = useState(false);
  const recentTitles = useRecentTitles("appointment");
  useEffect(() => {
    if (!linkedTitle && !titleTyped && recentTitles?.[0]) setTitle(recentTitles[0]);
    // only when the list first arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentTitles]);
  const [type, setType] = useState<string>("IN_PERSON");
  const [start, setStart] = useState(prefilledDate ? `${prefilledDate}T09:00` : "");
  const [end, setEnd] = useState("");
  const [anytime, setAnytime] = useState(false);
  const [address, setAddress] = useState("");
  const [addressTouched, setAddressTouched] = useState(false);
  const [propertyId, setPropertyId] = useState(""); // saved-extra-address link
  const [meetingLink, setMeetingLink] = useState("");
  // Everyone going, lead first (David 2026-10-06: more than one person)
  const [assigneeIds, setAssigneeIds] = useState<string[]>([actorId]);
  const [notes, setNotes] = useState("");
  const [remindClient, setRemindClient] = useState(true);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [window_, setWindow] = useState(""); // "" = company default
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedContact = contacts.find((c) => c.id === contactId);
  const effectiveAddress = addressTouched ? address : address || contactAddress(selectedContact);

  function pickContact(id: string) {
    setContactId(id);
    if (!addressTouched) setAddress("");
    setPropertyId("");
  }

  function pickStart(v: string) {
    // The end keeps the length already picked (30 minutes to start with —
    // appointments are quick touchpoints): move a 1-hour visit to 1:00 and
    // it ends at 2:00 (David 2026-10-06)
    setEnd(endFollowingStart(start, end, v, 30));
    setStart(v);
  }

  // Live heads-up: anyone going already booked then, or can't drive there
  // (or on to their next stop) in time
  const check = useScheduleCheck(
    anytime
      ? null
      : {
          start,
          end,
          userIds: assigneeIds,
          onSite: type === "IN_PERSON",
          address: type === "IN_PERSON" ? effectiveAddress : null,
          propertyId: type === "IN_PERSON" ? propertyId || null : null,
          contactId: contactId || null,
        }
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!contactId) return setError("Pick a client.");
    if (!start) return setError("Pick a date and time.");
    // The picker holds a bare "YYYY-MM-DD" until a time is chosen — that's
    // not a booking yet, and it used to save as UTC midnight (the evening
    // before, in the Americas)
    if (!anytime && [start, end].some((v) => v && v.length < 16)) {
      return setError("Pick a time, or choose Anytime");
    }
    if (type === "IN_PERSON" && !effectiveAddress.trim()) {
      return setError("In-person appointments need an address.");
    }

    setLoading(true);
    const { ok, data } = await postJson<{
      id: string;
      conflicts?: string[];
      confirmation?: { text: boolean; email: boolean } | null;
    }>("/api/app/appointments", {
      contactId,
      requestId: requestId || null,
      title,
      rememberTitle: Boolean(title.trim()) && title.trim() !== linkedTitle,
      type,
      scheduledAt: anytime ? localInputToISO(`${start.slice(0, 10)}T12:00`) : localInputToISO(start),
      scheduledEnd: anytime ? null : localInputToISO(end),
      scheduledAnytime: anytime,
      address: type === "IN_PERSON" ? effectiveAddress : null,
      propertyId: type === "IN_PERSON" ? propertyId || null : null,
      meetingLink: type === "VIDEO_CALL" ? meetingLink : null,
      assigneeIds,
      notes,
      remindClient,
      sendConfirmation,
      arrivalWindowMinutes:
        type === "IN_PERSON" && window_ !== "" ? Number(window_) : null,
    });
    setLoading(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    // Overlaps and drive time were shown live under the time fields
    // (ScheduleHeadsUp) — no second pop-up after the save.
    // Asked for a confirmation and nothing could go out (no phone or email,
    // texts off for this client, texting not live on the line yet) — say so
    // here, not silently; the appointment page explains the why.
    if (sendConfirmation && data.confirmation && !data.confirmation.text && !data.confirmation.email) {
      await alertSheet({
        title: "Booked — no confirmation went out",
        message: "The client has no reachable phone or email, or texting isn't live on your line yet. Automatic reminders still apply.",
      });
    }

    refreshRecentTitles();
    router.push(`/app/appointments/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackLink href="/app/appointments" />
        <PageTitle>New Appointment</PageTitle>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Who &amp; what</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <ContactPicker contacts={contacts} value={contactId} onChange={pickContact} />
            <Link href="/app/contacts/new" className="text-xs text-[color:var(--ds-primary)] hover:underline mt-1 inline-block">
              + Add new client
            </Link>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              Purpose <span className="text-xs font-normal text-gray-400">(optional)</span>
              <InfoTip label="Who sees the purpose?">
                Your client sees this. It's in their reminder texts and emails and on their client portal. Leave it blank and it says "Estimate". WorkBench remembers what you type here for next time.
              </InfoTip>
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTyped(true);
              }}
              list="recent-appointment-titles"
              placeholder="Estimate"
              className={inputCls}
            />
            <RecentTitleOptions id="recent-appointment-titles" titles={recentTitles} />
          </div>
          {requestId && (
            <p className="text-xs text-gray-500">
              Linked to request: <span className="font-medium text-gray-700">{requestTitle}</span>
            </p>
          )}
        </div>

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">How</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] ring-1 ring-[color:var(--ds-primary)]"
                      : "border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-line-strong)]"
                  }`}
                >
                  <t.icon size={16} className={active ? "text-[color:var(--ds-primary)]" : "text-gray-400"} />
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.hint}</p>
                </button>
              );
            })}
          </div>

          {type === "IN_PERSON" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
              {(selectedContact?.addresses?.length ?? 0) > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setAddressTouched(true);
                    if (e.target.value === "primary") {
                      setAddress(contactAddress(selectedContact));
                      setPropertyId("");
                      return;
                    }
                    const a = selectedContact?.addresses?.find((x) => x.id === e.target.value);
                    if (a) {
                      // Saved extras link the appointment to that property
                      setAddress([a.address, a.city, a.state, a.zip].filter(Boolean).join(", "));
                      setPropertyId(a.id);
                    }
                  }}
                  className={`${inputCls} mb-2 text-gray-600`}
                >
                  <option value="">Pick a saved address...</option>
                  {contactAddress(selectedContact) && (
                    <option value="primary">Primary: {contactAddress(selectedContact)}</option>
                  )}
                  {selectedContact!.addresses!.map((a) => {
                    const l = [a.address, a.city, a.state, a.zip].filter(Boolean).join(", ");
                    return (
                      <option key={a.id} value={a.id}>
                        {a.label || "Additional"}: {l}
                      </option>
                    );
                  })}
                </select>
              )}
              <input
                value={effectiveAddress}
                onChange={(e) => {
                  setAddressTouched(true);
                  setAddress(e.target.value);
                  setPropertyId(""); // typing a custom address breaks the link
                }}
                placeholder="Defaults to the client's address"
                className={inputCls}
              />
            </div>
          )}
          {type === "VIDEO_CALL" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting link (optional)</label>
              <input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/..."
                className={inputCls}
              />
            </div>
          )}
        </div>

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">When</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{anytime ? "Date *" : "Start *"}</label>
              {anytime ? (
                <input
                  type="date"
                  value={start.slice(0, 10)}
                  onChange={(e) => setStart(`${e.target.value}T09:00`)}
                  className={inputCls}
                />
              ) : (
                <SlotTimePicker
                  value={start}
                  intervalMinutes={intervalMinutes}
                  dayStartMinutes={dayStartMinutes}
                  inputCls={inputCls}
                  ariaLabel="Start"
                  onChange={pickStart}
                />
              )}
            </div>
            {!anytime && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                <SlotTimePicker
                  value={end}
                  intervalMinutes={intervalMinutes}
                  dayStartMinutes={dayStartMinutes}
                  inputCls={inputCls}
                  ariaLabel="End"
                  onChange={setEnd}
                />
              </div>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={anytime}
              onChange={(e) => setAnytime(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
            />
            Anytime (no set time)
          </label>
          {!anytime && start.length >= 10 && (
            <SuggestedTimes
              date={start.slice(0, 10)}
              userId={assigneeIds[0]}
              address={type === "IN_PERSON" ? effectiveAddress : null}
              durationMinutes={30}
              onPick={(s, e) => {
                setStart(s);
                setEnd(e);
              }}
            />
          )}
          {!anytime && <ScheduleHeadsUp result={check} />}
          {type === "IN_PERSON" && !anytime && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arrival window <span className="text-gray-400">(what the client is promised)</span>
              </label>
              <select value={window_} onChange={(e) => setWindow(e.target.value)} className={inputCls}>
                <option value="">Company default</option>
                {ARRIVAL_WINDOW_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {arrivalWindowChoiceLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
          {users.length > 1 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                Team members
                <InfoTip>Tick everyone going. It shows on each person&apos;s schedule and calendar, and blocks their online-booking times.</InfoTip>
              </div>
              <PeoplePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything to prepare, questions to ask..."
              className={inputCls}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendConfirmation}
              onChange={(e) => setSendConfirmation(e.target.checked)}
              className="mt-0.5 accent-[color:var(--ds-primary)]"
            />
            <span>
              Send the client a confirmation now
              <span className="block text-xs text-gray-500">
                A &ldquo;you&apos;re booked&rdquo; text and email with the details, as soon as you save
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remindClient}
              onChange={(e) => setRemindClient(e.target.checked)}
              className="mt-0.5 accent-[color:var(--ds-primary)]"
            />
            <span>
              Send the client automatic reminders
              <span className="block text-xs text-gray-500">
                Email/text the day before and about an hour out
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Book Appointment
          </button>
          <Link
            href="/app/schedule"
            className="btn-tool-line rounded-[10px] bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
