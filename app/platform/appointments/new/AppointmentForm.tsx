"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin, Phone, Video } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";
import SlotTimePicker from "@/components/SlotTimePicker";
import { addMinutesToLocalDateTime } from "@/lib/scheduling";

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

const TYPES = [
  { value: "PHONE_CALL", label: "Phone Call", hint: "Call the client at their number", icon: Phone },
  { value: "VIDEO_CALL", label: "Video Call", hint: "Zoom, Meet, Teams — paste a link", icon: Video },
  { value: "IN_PERSON", label: "In-person", hint: "Meet at the client's address", icon: MapPin },
] as const;

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

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
  prefilledDate: string;
  intervalMinutes?: number;
  dayStartMinutes?: number;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState(prefilledContactId);
  const [title, setTitle] = useState(requestTitle ? `Estimate — ${requestTitle}` : "Estimate");
  const [type, setType] = useState<string>("PHONE_CALL");
  const [start, setStart] = useState(prefilledDate ? `${prefilledDate}T09:00` : "");
  const [end, setEnd] = useState("");
  const [anytime, setAnytime] = useState(false);
  const [address, setAddress] = useState("");
  const [addressTouched, setAddressTouched] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [assignedToId, setAssignedToId] = useState(actorId);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedContact = contacts.find((c) => c.id === contactId);
  const effectiveAddress = addressTouched ? address : address || contactAddress(selectedContact);

  function pickContact(id: string) {
    setContactId(id);
    if (!addressTouched) setAddress("");
  }

  function pickStart(v: string) {
    setStart(v);
    // Default the end 30 minutes later while it hasn't been customized —
    // appointments are quick touchpoints regardless of the job slot interval.
    if (v && v.length >= 16 && !end) {
      setEnd(addMinutesToLocalDateTime(v, 30));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!contactId) return setError("Pick a client.");
    if (!start) return setError("Pick a date and time.");
    if (type === "IN_PERSON" && !effectiveAddress.trim()) {
      return setError("In-person appointments need an address.");
    }

    setLoading(true);
    const { ok, data } = await postJson<{ id: string }>("/api/app/appointments", {
      contactId,
      requestId: requestId || null,
      title,
      type,
      scheduledAt: anytime ? localInputToISO(`${start.slice(0, 10)}T12:00`) : localInputToISO(start),
      scheduledEnd: anytime ? null : localInputToISO(end),
      scheduledAnytime: anytime,
      address: type === "IN_PERSON" ? effectiveAddress : null,
      meetingLink: type === "VIDEO_CALL" ? meetingLink : null,
      assignedToId,
      notes,
    });
    setLoading(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push(`/app/appointments/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/schedule" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">New Appointment</h1>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Who &amp; what</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client *</label>
            <select value={contactId} onChange={(e) => pickContact(e.target.value)} className={inputCls}>
              <option value="">Select a client...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
            <Link href="/app/contacts/new" className="text-xs text-green-600 hover:underline mt-1 inline-block">
              + Add new client
            </Link>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Purpose *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Estimate, Sales call, Walkthrough"
              className={inputCls}
            />
          </div>
          {requestId && (
            <p className="text-xs text-gray-500">
              Linked to request: <span className="font-medium text-gray-700">{requestTitle}</span>
            </p>
          )}
        </div>

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">How</h2>
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
                      ? "border-green-500 bg-green-50 ring-1 ring-green-500"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <t.icon size={16} className={active ? "text-green-600" : "text-gray-400"} />
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.hint}</p>
                </button>
              );
            })}
          </div>

          {type === "IN_PERSON" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Address *</label>
              {(selectedContact?.addresses?.length ?? 0) > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setAddressTouched(true);
                    setAddress(e.target.value);
                  }}
                  className={`${inputCls} mb-2 text-gray-600`}
                >
                  <option value="">Pick a saved address...</option>
                  {contactAddress(selectedContact) && (
                    <option value={contactAddress(selectedContact)}>
                      Primary: {contactAddress(selectedContact)}
                    </option>
                  )}
                  {selectedContact!.addresses!.map((a) => {
                    const l = [a.address, a.city, a.state, a.zip].filter(Boolean).join(", ");
                    return (
                      <option key={a.id} value={l}>
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
                }}
                placeholder="Defaults to the client's address"
                className={inputCls}
              />
            </div>
          )}
          {type === "VIDEO_CALL" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Meeting link (optional)</label>
              <input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/..."
                className={inputCls}
              />
            </div>
          )}
        </div>

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">When</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{anytime ? "Date *" : "Start *"}</label>
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
                <label className="block text-xs text-gray-500 mb-1">End</label>
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
              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Anytime (no set time)
          </label>
        </div>

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Details</h2>
          {users.length > 1 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Assigned to</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inputCls}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything to prepare, questions to ask..."
              className={inputCls}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Book Appointment
          </button>
          <Link
            href="/app/schedule"
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
