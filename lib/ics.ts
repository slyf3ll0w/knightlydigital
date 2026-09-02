/**
 * iCalendar (.ics) builder for booking confirmations and reminders — the
 * server-side twin of the data-URI "Add to calendar" link the classic
 * booking form renders. Pure; attach the output via sendEmail's
 * `attachments` or serve it from a route.
 */

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizerName?: string | null;
  organizerEmail?: string | null;
  /** "CANCELLED" flips METHOD so calendars remove the event. */
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  sequence?: number;
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets (ASCII-safe approximation: 73 chars). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(ev: IcsEvent): string {
  const cancelled = ev.status === "CANCELLED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WorkBench//Online Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(ev.start)}`,
    `DTEND:${stamp(ev.end)}`,
    `SEQUENCE:${ev.sequence ?? 0}`,
    `STATUS:${ev.status ?? "CONFIRMED"}`,
    `SUMMARY:${icsText(ev.summary)}`,
    ...(ev.description ? [`DESCRIPTION:${icsText(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${icsText(ev.location)}`] : []),
    ...(ev.url ? [`URL:${ev.url}`] : []),
    ...(ev.organizerEmail
      ? [`ORGANIZER;CN=${icsText(ev.organizerName ?? ev.organizerEmail)}:mailto:${ev.organizerEmail}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Base64 for Resend's attachment `content`. */
export function icsAttachment(ev: IcsEvent, filename = "appointment.ics"): { filename: string; content: string } {
  return { filename, content: Buffer.from(buildIcs(ev), "utf8").toString("base64") };
}

/** Google Calendar "add event" deep link (no file needed). */
export function googleCalendarUrl(ev: Pick<IcsEvent, "start" | "end" | "summary" | "description" | "location">): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.summary,
    dates: `${stamp(ev.start)}/${stamp(ev.end)}`,
  });
  if (ev.description) p.set("details", ev.description);
  if (ev.location) p.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
