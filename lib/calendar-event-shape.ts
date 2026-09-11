/**
 * The shape of a calendar event and the pure mappers that turn a Job /
 * Appointment / TimeBlock into one — no database, so the .ics builder
 * (lib/ics.ts) and the unit test (scripts/test-calendar-sync.ts) can import
 * it freely. The loaders live in lib/calendar-events.ts. Design:
 * docs/plans/google-calendar-sync-2026-09-11.md.
 */

import { createHash } from "crypto";
import { appointmentTypeLabel } from "@/lib/statuses";

export const APP_ORIGIN = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");

/** Stable UID domain — the same record always renders the same UID. */
const UID_DOMAIN = "workbenchfsm.com";

export type CalendarEventKind = "JOB" | "APPOINTMENT" | "BLOCK";

export type CalendarEvent = {
  kind: CalendarEventKind;
  /** Local row id (Job / Appointment / TimeBlock). */
  id: string;
  /** `wb-<kind>-<id>@workbenchfsm.com` — stable across renders. */
  uid: string;
  title: string;
  start: Date;
  end: Date;
  /**
   * All-day on the company-timezone date(s) of start..end. Anytime jobs and
   * appointments (anchored at noon) and all-day blocks (00:00 → 23:59:59).
   */
  allDay: boolean;
  /** IANA zone used to resolve all-day dates. */
  tz: string;
  description: string;
  location: string | null;
  url: string;
  /** TENTATIVE = online booking awaiting approval. */
  status: "CONFIRMED" | "TENTATIVE";
};

const HOUR = 3_600_000;
const JOB_DEFAULT_MS = 1 * HOUR;
const APPOINTMENT_DEFAULT_MS = 30 * 60_000;

// ─── Pure mappers ────────────────────────────────────────────────────────────

export type JobForCalendar = {
  id: string;
  jobNumber: number;
  title: string;
  description: string | null;
  scheduledAt: Date | null;
  scheduledEnd: Date | null;
  scheduledAnytime: boolean;
  address: string | null;
  bookedOnlineAt?: Date | null;
  contact: { firstName: string; lastName: string; phone: string | null; address: string | null };
};

export type AppointmentForCalendar = {
  id: string;
  title: string;
  type: string;
  scheduledAt: Date;
  scheduledEnd: Date | null;
  scheduledAnytime: boolean;
  tentative: boolean;
  address: string | null;
  meetingLink: string | null;
  notes: string | null;
  contact: { firstName: string; lastName: string; phone: string | null; address: string | null };
};

export type TimeBlockForCalendar = {
  id: string;
  userId: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  address: string | null;
};

const clientName = (c: { firstName: string; lastName: string }) =>
  `${c.firstName} ${c.lastName}`.trim();

function lines(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join("\n");
}

export function toCalendarEventFromJob(job: JobForCalendar, tz: string): CalendarEvent | null {
  if (!job.scheduledAt) return null;
  const start = job.scheduledAt;
  const end =
    job.scheduledEnd && job.scheduledEnd > start
      ? job.scheduledEnd
      : new Date(start.getTime() + JOB_DEFAULT_MS);
  const name = clientName(job.contact);
  const location = job.address ?? job.contact.address ?? null;
  return {
    kind: "JOB",
    id: job.id,
    uid: `wb-job-${job.id}@${UID_DOMAIN}`,
    title: [job.title, name].filter(Boolean).join(" · "),
    start,
    end,
    allDay: job.scheduledAnytime,
    tz,
    description: lines(
      `Job #${job.jobNumber}${name ? ` · ${name}` : ""}`,
      job.contact.phone ? `Phone: ${job.contact.phone}` : null,
      job.bookedOnlineAt ? "Booked online" : null,
      job.description,
      `${APP_ORIGIN}/app/jobs/${job.id}`
    ),
    location,
    url: `${APP_ORIGIN}/app/jobs/${job.id}`,
    status: "CONFIRMED",
  };
}

export function toCalendarEventFromAppointment(
  appt: AppointmentForCalendar,
  tz: string
): CalendarEvent {
  const start = appt.scheduledAt;
  const end =
    appt.scheduledEnd && appt.scheduledEnd > start
      ? appt.scheduledEnd
      : new Date(start.getTime() + APPOINTMENT_DEFAULT_MS);
  const name = clientName(appt.contact);
  const typeLabel = appointmentTypeLabel[appt.type] ?? appt.type;
  // Calls have no place to be; the meeting link stands in as "where".
  const location =
    appt.type === "IN_PERSON"
      ? (appt.address ?? appt.contact.address ?? null)
      : appt.type === "VIDEO_CALL"
        ? (appt.meetingLink ?? null)
        : appt.contact.phone
          ? `Call ${appt.contact.phone}`
          : null;
  return {
    kind: "APPOINTMENT",
    id: appt.id,
    uid: `wb-appointment-${appt.id}@${UID_DOMAIN}`,
    title: [`${typeLabel}: ${appt.title}`, name].filter(Boolean).join(" · "),
    start,
    end,
    allDay: appt.scheduledAnytime,
    tz,
    description: lines(
      `${typeLabel}${name ? ` with ${name}` : ""}`,
      appt.contact.phone ? `Phone: ${appt.contact.phone}` : null,
      appt.meetingLink ? `Join: ${appt.meetingLink}` : null,
      appt.tentative ? "Awaiting approval (booked online)" : null,
      appt.notes,
      `${APP_ORIGIN}/app/appointments/${appt.id}`
    ),
    location,
    url: `${APP_ORIGIN}/app/appointments/${appt.id}`,
    status: appt.tentative ? "TENTATIVE" : "CONFIRMED",
  };
}

export function toCalendarEventFromTimeBlock(block: TimeBlockForCalendar, tz: string): CalendarEvent {
  const companyWide = block.userId === null;
  return {
    kind: "BLOCK",
    id: block.id,
    uid: `wb-block-${block.id}@${UID_DOMAIN}`,
    title: block.title || "Blocked off",
    start: block.startAt,
    end: block.endAt > block.startAt ? block.endAt : new Date(block.startAt.getTime() + HOUR),
    allDay: block.allDay,
    tz,
    description: lines(
      companyWide ? "Company-wide block (everyone)" : "Blocked off in Workbench",
      `${APP_ORIGIN}/app/schedule`
    ),
    location: block.address ?? null,
    url: `${APP_ORIGIN}/app/schedule`,
    status: "CONFIRMED",
  };
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` of an instant in a zone. */
export function localDateKey(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Add whole days to a `YYYY-MM-DD` key (calendar arithmetic, zone-free). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/**
 * The all-day span of an event as exclusive-end date keys — what both ICS
 * (`DTEND;VALUE=DATE`) and Google (`end.date`) expect. A noon-anchored
 * anytime job is one day; a multi-day block runs through its last day.
 */
export function allDayRange(ev: Pick<CalendarEvent, "start" | "end" | "tz">): { start: string; end: string } {
  const startKey = localDateKey(ev.start, ev.tz);
  // Ends exactly at a local midnight count as the previous day (00:00 → 24:00)
  const endInstant = new Date(ev.end.getTime() - 1);
  const lastKey = endInstant > ev.start ? localDateKey(endInstant, ev.tz) : startKey;
  const endKey = addDaysToKey(lastKey < startKey ? startKey : lastKey, 1);
  return { start: startKey, end: endKey };
}

/** Change detector for the Google push — only what the calendar can see. */
export function calendarEventFingerprint(ev: CalendarEvent): string {
  const body = JSON.stringify([
    ev.uid,
    ev.title,
    ev.allDay ? allDayRange(ev) : [ev.start.toISOString(), ev.end.toISOString()],
    ev.description,
    ev.location,
    ev.status,
    ev.tz,
  ]);
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}

