"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Phone, Search, Video } from "lucide-react";
import Modal from "@/components/Modal";
import SuggestedTimes from "@/components/SuggestedTimes";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { slotTimeOptions } from "@/lib/scheduling";
import { durationLabel, pad, parseParam, type PaletteEntity } from "./schedule-lib";

/** What was dropped where — the sheet fills itself in from this. */
export type PlaceIntent = {
  entity: PaletteEntity;
  date: string; // YYYY-MM-DD
  minute: number | null; // null = Anytime
  userId?: string | null; // landed on a tech's column
  durationMin?: number; // from a drag-painted range
};

export type PlaceResult = {
  kind: "job" | "appointment";
  id: string;
  label: string;
  conflicts: string[];
  contactName: string;
};

type ContactHit = { id: string; name: string; address: string | null; phone: string | null; lead: boolean; sub: string };

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480];

function toISO(date: string, hhmm: string): string {
  const d = parseParam(date);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

/**
 * The one sheet behind every "put this person on the calendar" gesture.
 * Opens with the date, time, tech, and kind already decided by where the
 * card landed and who it was — a lead defaults to a phone call, a client to
 * a job at their address, a request to a job with the request attached, an
 * unscheduled job to a reschedule — so most of the time it's a glance and
 * one tap. Durations come from what this company's past jobs of the same
 * name actually took.
 */
export default function PlaceSheet({
  intent,
  users,
  meId,
  canCreateJob,
  canCreateAppointment,
  intervalMinutes,
  dayStartMinutes,
  onClose,
  onDone,
}: {
  intent: PlaceIntent | null;
  users: { id: string; name: string }[];
  meId: string;
  canCreateJob: boolean;
  canCreateAppointment: boolean;
  intervalMinutes: number;
  dayStartMinutes: number;
  onClose: () => void;
  onDone: (result: PlaceResult) => void;
}) {
  const e = intent?.entity ?? null;
  const existingJob = e?.type === "job" ? e.job : null;

  const [kind, setKind] = useState<"job" | "appointment">("job");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [anytime, setAnytime] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [durationTouched, setDurationTouched] = useState(false);
  const [hint, setHint] = useState<{ minutes: number; source: string; samples: number } | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [apptType, setApptType] = useState<"PHONE_CALL" | "VIDEO_CALL" | "IN_PERSON">("PHONE_CALL");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState<ContactHit | null>(null);
  const [contactQ, setContactQ] = useState("");
  const [contactHits, setContactHits] = useState<ContactHit[]>([]);
  const [newContact, setNewContact] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);

  // Seed the form from the intent every time a new one arrives
  useEffect(() => {
    if (!intent) return;
    const ent = intent.entity;
    setErr("");
    setDate(intent.date);
    setAnytime(intent.minute === null && ent.type !== "contact");
    const min = intent.minute ?? 9 * 60;
    setStartTime(`${pad(Math.floor(min / 60))}:${pad(min % 60)}`);
    setDurationTouched(Boolean(intent.durationMin));
    setHint(null);
    setContactQ("");
    setContactHits([]);
    const crew = intent.userId ? [intent.userId] : [];

    if (ent.type === "contact") {
      const lead = ent.lead && canCreateAppointment;
      setKind(lead ? "appointment" : canCreateJob ? "job" : "appointment");
      setTitle(lead ? "Phone call" : "");
      setApptType(lead ? "PHONE_CALL" : "IN_PERSON");
      setDuration(intent.durationMin ?? (lead ? 30 : 60));
      setAddress(ent.address ?? "");
      setContact({ id: ent.id, name: ent.name, address: ent.address, phone: ent.phone, lead: ent.lead, sub: ent.sub });
      setAssignees(crew.length ? crew : lead ? [meId] : []);
    } else if (ent.type === "request") {
      setKind(canCreateJob ? "job" : "appointment");
      setTitle(ent.title);
      setApptType("IN_PERSON");
      setDuration(intent.durationMin ?? 60);
      setAddress(ent.address ?? "");
      setContact({ id: ent.contactId, name: ent.name, address: ent.address, phone: ent.phone, lead: false, sub: ent.sub });
      setAssignees(crew);
    } else if (ent.type === "job") {
      setKind("job");
      setTitle(ent.job.title);
      setDuration(intent.durationMin ?? 60);
      setAddress(ent.job.address ?? "");
      setContact({ id: ent.job.contactId ?? "", name: ent.job.contactName, address: ent.job.address ?? null, phone: ent.job.phone ?? null, lead: false, sub: "" });
      // Keep the job's crew; a tech-column drop adds that tech
      const prev = ent.job.assigneeIds ?? [];
      setAssignees(intent.userId && !prev.includes(intent.userId) ? [...prev, intent.userId] : prev);
    } else if (ent.type === "new") {
      setKind(canCreateJob ? "job" : "appointment");
      setTitle("");
      setApptType("IN_PERSON");
      setDuration(intent.durationMin ?? 60);
      setAddress("");
      setContact(null);
      const parts = ent.name.split(/\s+/);
      setNewContact({ firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), phone: "", email: "" });
      setAssignees(crew);
    } else {
      // Painted a range on the grid first — who comes next
      setKind(ent.kind);
      setTitle(ent.kind === "appointment" ? "Phone call" : "");
      setApptType(ent.kind === "appointment" ? "PHONE_CALL" : "IN_PERSON");
      setDuration(intent.durationMin ?? (ent.kind === "appointment" ? 30 : 60));
      setAddress("");
      setContact(null);
      setContactQ(" ");
      setAssignees(crew.length ? crew : ent.kind === "appointment" ? [meId] : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  // Learned duration for the typed title (jobs only)
  useEffect(() => {
    if (!intent || kind !== "job" || existingJob || title.trim().length < 2) {
      setHint(null);
      return;
    }
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/app/schedule/duration-hint?title=${encodeURIComponent(title.trim())}`);
        const data = await res.json();
        if (my !== seq.current) return;
        if (res.ok && data.minutes) {
          setHint(data);
          if (!durationTouched) setDuration(data.minutes);
        } else setHint(null);
      } catch {
        /* hint is a nicety */
      }
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, kind]);

  // Contact search inside the sheet (change who, or pick one for a blank slot)
  useEffect(() => {
    if (contactQ.trim().length < 2) {
      setContactHits([]);
      return;
    }
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/app/schedule/palette?q=${encodeURIComponent(contactQ.trim())}`);
        const data = await res.json();
        if (my === seq.current && res.ok) setContactHits(data.contacts ?? []);
      } catch {
        /* ignore */
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [contactQ]);

  const timeOptions = useMemo(() => {
    const base = slotTimeOptions(intervalMinutes, dayStartMinutes);
    if (startTime && !base.some((o) => o.value === startTime)) {
      const [h, m] = startTime.split(":").map(Number);
      const d = new Date(2000, 0, 1, h, m);
      return [{ value: startTime, label: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) }, ...base];
    }
    return base;
  }, [intervalMinutes, dayStartMinutes, startTime]);

  const durationOptions = useMemo(
    () => (DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b)),
    [duration]
  );

  const endLabel = useMemo(() => {
    const [h, m] = startTime.split(":").map(Number);
    const d = new Date(2000, 0, 1, h || 0, (m || 0) + duration);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }, [startTime, duration]);

  async function submit() {
    if (!intent) return;
    setErr("");
    if (!date) return setErr("Pick a date.");
    if (!existingJob && !title.trim()) return setErr(kind === "job" ? "Give the job a title." : "Give the appointment a title.");
    if (kind === "appointment" && apptType === "IN_PERSON" && !address.trim()) return setErr("In-person appointments need an address.");

    setBusy(true);
    try {
      let contactId = contact?.id ?? "";
      let contactName = contact?.name ?? "";
      if (!contactId && e?.type === "new") {
        if (!newContact.firstName.trim()) {
          setErr("Enter at least a first name.");
          return;
        }
        const { ok, data } = await postJson<{ id: string }>("/api/app/contacts", {
          firstName: newContact.firstName.trim(),
          lastName: newContact.lastName.trim(),
          phone: newContact.phone.trim() || undefined,
          email: newContact.email.trim() || undefined,
          address: address.trim() || undefined,
          status: kind === "appointment" ? "LEAD" : "ACTIVE",
        });
        if (!ok || !data?.id) {
          setErr(data?.error ?? GENERIC_ERROR);
          return;
        }
        contactId = data.id;
        contactName = `${newContact.firstName} ${newContact.lastName}`.trim();
      }
      if (!contactId) {
        setErr("Pick who this is for.");
        return;
      }

      const scheduledAt = anytime ? toISO(date, "12:00") : toISO(date, startTime);
      const scheduledEnd = anytime
        ? null
        : new Date(new Date(scheduledAt).getTime() + duration * 60000).toISOString();
      const requestId = e?.type === "request" ? e.id : undefined;

      if (existingJob) {
        const body: Record<string, unknown> = { scheduledAt, scheduledEnd, scheduledAnytime: anytime };
        if (users.length > 0) body.assigneeIds = assignees;
        const { ok, data } = await postJson<{ conflicts?: string[] }>(`/api/app/jobs/${existingJob.id}`, body, "PATCH");
        if (!ok) return setErr(data?.error ?? GENERIC_ERROR);
        onDone({ kind: "job", id: existingJob.id, label: existingJob.title, conflicts: data?.conflicts ?? [], contactName: existingJob.contactName });
        return;
      }

      if (kind === "job") {
        const { ok, data } = await postJson<{ id: string; conflicts?: string[] }>("/api/app/jobs", {
          contactId,
          requestId,
          title: title.trim(),
          scheduledAt,
          scheduledEnd,
          scheduledAnytime: anytime,
          address: address.trim() || undefined,
          assigneeIds: assignees,
        });
        if (!ok || !data?.id) return setErr(data?.error ?? GENERIC_ERROR);
        onDone({ kind: "job", id: data.id, label: title.trim(), conflicts: data.conflicts ?? [], contactName });
      } else {
        const { ok, data } = await postJson<{ id: string; conflicts?: string[] }>("/api/app/appointments", {
          contactId,
          requestId,
          title: title.trim(),
          type: apptType,
          scheduledAt,
          scheduledEnd,
          scheduledAnytime: false,
          address: apptType === "IN_PERSON" ? address.trim() : undefined,
          assignedToId: assignees[0] ?? meId,
        });
        if (!ok || !data?.id) return setErr(data?.error ?? GENERIC_ERROR);
        onDone({ kind: "appointment", id: data.id, label: title.trim(), conflicts: data.conflicts ?? [], contactName });
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
  const heading = existingJob
    ? "Schedule Job"
    : kind === "job"
      ? "New Job"
      : "New Appointment";
  const sub = contact
    ? `${contact.name}${existingJob?.jobNumber ? ` · Job #${existingJob.jobNumber}` : contact.lead ? " · Lead" : ""}`
    : e?.type === "new"
      ? "New client"
      : e?.type === "pick"
        ? "Pick who it's for"
        : "";

  return (
    <Modal open={Boolean(intent)} onClose={() => !busy && onClose()} cardClassName="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-left shadow-xl">
      {intent && (
        <>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
              {existingJob && (
                <Link href={`/app/jobs/${existingJob.id}`} className="shrink-0 text-xs font-medium text-green-700 hover:underline">
                  View job
                </Link>
              )}
            </div>
            {sub && <p className="mt-0.5 truncate text-sm text-gray-500">{sub}</p>}
          </div>

          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

          {/* Kind: only when both are possible and it's a fresh record */}
          {!existingJob && canCreateJob && canCreateAppointment && (
            <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-gray-100 p-1">
              {(["job", "appointment"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    if (k === "appointment" && !durationTouched) setDuration(apptType === "IN_PERSON" ? 60 : 30);
                    if (k === "job" && !durationTouched) setDuration(hint?.minutes ?? 60);
                  }}
                  className={`rounded-[8px] py-1.5 text-sm font-semibold transition-colors ${
                    kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {k === "job" ? "Job" : "Appointment"}
                </button>
              ))}
            </div>
          )}

          {/* Who */}
          {e?.type === "new" && !contact ? (
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="First name" value={newContact.firstName} onChange={(ev) => setNewContact((c) => ({ ...c, firstName: ev.target.value }))} />
              <input className={inputCls} placeholder="Last name" value={newContact.lastName} onChange={(ev) => setNewContact((c) => ({ ...c, lastName: ev.target.value }))} />
              <input className={inputCls} placeholder="Phone" inputMode="tel" value={newContact.phone} onChange={(ev) => setNewContact((c) => ({ ...c, phone: ev.target.value }))} />
              <input className={inputCls} placeholder="Email" inputMode="email" value={newContact.email} onChange={(ev) => setNewContact((c) => ({ ...c, email: ev.target.value }))} />
            </div>
          ) : (
            !existingJob && (
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">Who</label>
                {contact && !contactQ ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-gray-900">{contact.name}</span>
                    <button type="button" onClick={() => setContactQ(" ")} className="shrink-0 text-xs font-medium text-green-700 hover:underline">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      className={`${inputCls} pl-9`}
                      placeholder="Search clients and leads…"
                      value={contactQ.trim()}
                      onChange={(ev) => setContactQ(ev.target.value)}
                    />
                    {contactHits.length > 0 && (
                      <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        {contactHits.map((h) => (
                          <li key={h.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setContact(h);
                                setContactQ("");
                                if (!address) setAddress(h.address ?? "");
                              }}
                              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                            >
                              <span className="truncate">{h.name}</span>
                              <span className="ml-2 shrink-0 text-xs text-gray-400">{h.lead ? "Lead" : h.sub}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* What */}
          {!existingJob && (
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">{kind === "job" ? "Job title" : "Title"}</label>
              <input
                className={inputCls}
                value={title}
                onChange={(ev) => setTitle(ev.target.value)}
                placeholder={kind === "job" ? "e.g. Gutter cleaning" : "e.g. Discovery call"}
              />
              {hint && kind === "job" && (
                <p className="mt-1 text-xs text-gray-500">
                  Usually about {durationLabel(hint.minutes)}
                  {hint.source === "actual" ? ` on the clock (${hint.samples} past jobs)` : hint.source === "scheduled" ? " when booked before" : " per your price book"}.
                </p>
              )}
            </div>
          )}

          {kind === "appointment" && !existingJob && (
            <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-gray-100 p-1">
              {(
                [
                  ["PHONE_CALL", "Phone", Phone],
                  ["VIDEO_CALL", "Video", Video],
                  ["IN_PERSON", "In person", MapPin],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setApptType(v);
                    if (!durationTouched) setDuration(v === "IN_PERSON" ? 60 : 30);
                  }}
                  className={`flex items-center justify-center gap-1 rounded-[8px] py-1.5 text-xs font-semibold transition-colors ${
                    apptType === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* When */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">Date</label>
              <input type="date" className={inputCls} value={date} onChange={(ev) => setDate(ev.target.value)} />
            </div>
            {!anytime && (
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">Start</label>
                <select className={`${inputCls} bg-white`} value={startTime} onChange={(ev) => setStartTime(ev.target.value)}>
                  {timeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {kind === "job" && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={anytime} onChange={(ev) => setAnytime(ev.target.checked)} className="rounded text-green-600 focus:ring-green-500" />
              Anytime that day (no set time)
            </label>
          )}
          {!anytime && (
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">Length</label>
              <div className="flex items-center gap-2">
                <select
                  className={`${inputCls} bg-white`}
                  value={duration}
                  onChange={(ev) => {
                    setDuration(Number(ev.target.value));
                    setDurationTouched(true);
                  }}
                >
                  {durationOptions.map((m) => (
                    <option key={m} value={m}>
                      {durationLabel(m)}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-xs text-gray-500">ends {endLabel}</span>
              </div>
            </div>
          )}

          {/* Find a time — drive-aware, for the first chosen tech */}
          {!anytime && assignees[0] && date && (
            <SuggestedTimes
              date={date}
              userId={assignees[0]}
              address={kind === "appointment" && apptType !== "IN_PERSON" ? null : address || contact?.address || null}
              durationMinutes={duration}
              excludeId={existingJob?.id}
              onPick={(startLocal) => setStartTime(startLocal.slice(11, 16))}
            />
          )}

          {/* Where */}
          {(kind === "job" || apptType === "IN_PERSON") && (
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">Address</label>
              <input className={inputCls} value={address} onChange={(ev) => setAddress(ev.target.value)} placeholder="Service address" />
            </div>
          )}

          {/* Crew */}
          {users.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{kind === "job" ? "Assign to" : "With"}</label>
              {kind === "job" ? (
                <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
                  {users.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={assignees.includes(u.id)}
                        onChange={(ev) =>
                          setAssignees((a) => (ev.target.checked ? [...a, u.id] : a.filter((id) => id !== u.id)))
                        }
                        className="rounded text-green-600 focus:ring-green-500"
                      />
                      {u.id === meId ? `${u.name} (me)` : u.name}
                    </label>
                  ))}
                </div>
              ) : (
                <select className={`${inputCls} bg-white`} value={assignees[0] ?? meId} onChange={(ev) => setAssignees([ev.target.value])}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === meId ? `${u.name} (me)` : u.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={submit}
              disabled={busy}
              className="flex items-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {existingJob ? "Schedule" : kind === "job" ? "Create & schedule" : "Book it"}
            </button>
            <button onClick={onClose} disabled={busy} className="rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
