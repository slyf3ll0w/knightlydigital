import { prisma } from "@/lib/db";

/**
 * What happened on a call. Nothing is stamped onto the Call row: a quote,
 * appointment, job or invoice for the same person that was created (or
 * sent) while the call was live — or within a short grace period after it
 * ended — belongs to that call. Saving the caller as a lead or client, or
 * winning a lead, counts the same way. The Calls page and the call screen
 * both read from here, so "Quote sent" on a row and the call screen's
 * "On this call" list can never disagree.
 *
 * The match is pure (`assignCallEvents`, unit-tested in
 * scripts/test-call-events.ts); `loadCallEvents` does the five queries.
 */

export type CallEventKind =
  | "new_lead"
  | "new_client"
  | "became_client"
  | "quote_sent"
  | "quote_drafted"
  | "appointment"
  | "job"
  | "invoice_sent"
  | "invoice_drafted";

export type CallEvent = {
  kind: CallEventKind;
  label: string;
  href: string;
  at: Date;
};

export type CallWindowRow = {
  id: string;
  contactId: string | null;
  createdAt: Date;
  endedAt: Date | null;
};

export type CallEventRecords = {
  contacts: Array<{ id: string; status: string; createdAt: Date; wonAt: Date | null }>;
  quotes: Array<{ id: string; contactId: string; createdAt: Date; sentAt: Date | null }>;
  appointments: Array<{ id: string; contactId: string; createdAt: Date }>;
  jobs: Array<{ id: string; contactId: string; createdAt: Date; scheduledAt: Date | null }>;
  invoices: Array<{ id: string; contactId: string | null; createdAt: Date; issuedAt: Date | null; status: string }>;
};

/** A record stamped up to this long BEFORE the call started still counts (the row is created a beat before the dial). */
export const CALL_EVENT_BEFORE_MS = 2 * 60_000;
/** …and up to this long after the call ended: the quote gets written up right after hanging up. */
export const CALL_EVENT_AFTER_MS = 30 * 60_000;

/** The span of time a call "owns" for record matching. A call still live extends to now. */
export function callWindow(call: CallWindowRow, now: Date): { start: number; end: number } {
  return {
    start: call.createdAt.getTime() - CALL_EVENT_BEFORE_MS,
    end: (call.endedAt ?? now).getTime() + CALL_EVENT_AFTER_MS,
  };
}

const LABELS: Record<CallEventKind, string> = {
  new_lead: "Saved as a lead",
  new_client: "Saved as a client",
  became_client: "Became a client",
  quote_sent: "Quote sent",
  quote_drafted: "Quote drafted",
  appointment: "Appointment booked",
  job: "Job scheduled",
  invoice_sent: "Invoice sent",
  invoice_drafted: "Invoice drafted",
};

/**
 * Every event, attached to the call it happened on. When two calls with the
 * same person overlap a record's timestamp (a call-back ten minutes later),
 * the LATER call wins — that's the one they were on when the thing got done.
 */
export function assignCallEvents(calls: CallWindowRow[], records: CallEventRecords, now = new Date()): Map<string, CallEvent[]> {
  const out = new Map<string, CallEvent[]>();
  const byContact = new Map<string, Array<{ call: CallWindowRow; start: number; end: number }>>();
  for (const call of calls) {
    if (!call.contactId) continue;
    const list = byContact.get(call.contactId) ?? [];
    list.push({ call, ...callWindow(call, now) });
    byContact.set(call.contactId, list);
  }
  const attach = (contactId: string | null, at: Date | null, kind: CallEventKind, href: string) => {
    if (!contactId || !at) return;
    const t = at.getTime();
    let best: CallWindowRow | null = null;
    for (const w of byContact.get(contactId) ?? []) {
      if (t < w.start || t > w.end) continue;
      if (!best || w.call.createdAt.getTime() > best.createdAt.getTime()) best = w.call;
    }
    if (!best) return;
    const list = out.get(best.id) ?? [];
    list.push({ kind, label: LABELS[kind], href, at });
    out.set(best.id, list);
  };

  for (const c of records.contacts) {
    const href = `/app/contacts/${c.id}`;
    if (c.wonAt && c.wonAt.getTime() - c.createdAt.getTime() < 5_000) {
      // Created straight as a client (wonAt stamped alongside) — one event, not two.
      attach(c.id, c.createdAt, "new_client", href);
    } else {
      // A win stamped later means they started out as a lead, whatever they are today.
      attach(c.id, c.createdAt, c.wonAt || c.status === "LEAD" ? "new_lead" : "new_client", href);
      attach(c.id, c.wonAt, "became_client", href);
    }
  }
  for (const q of records.quotes) {
    const href = `/app/quotes/${q.id}`;
    if (q.sentAt) attach(q.contactId, q.sentAt, "quote_sent", href);
    else attach(q.contactId, q.createdAt, "quote_drafted", href);
  }
  for (const a of records.appointments) attach(a.contactId, a.createdAt, "appointment", `/app/appointments/${a.id}`);
  for (const j of records.jobs) attach(j.contactId, j.createdAt, "job", `/app/jobs/${j.id}`);
  for (const i of records.invoices) {
    const href = `/app/invoices/${i.id}`;
    if (i.status !== "DRAFT" && i.issuedAt) attach(i.contactId, i.issuedAt, "invoice_sent", href);
    else attach(i.contactId, i.createdAt, "invoice_drafted", href);
  }
  for (const list of out.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out;
}

/** The records that could belong to any of these calls, then the pure match. */
export async function loadCallEvents(companyId: string, calls: CallWindowRow[], now = new Date()): Promise<Map<string, CallEvent[]>> {
  const withContact = calls.filter((c) => c.contactId);
  if (withContact.length === 0) return new Map();
  const contactIds = [...new Set(withContact.map((c) => c.contactId as string))];
  const since = new Date(Math.min(...withContact.map((c) => callWindow(c, now).start)));
  const [contacts, quotes, appointments, jobs, invoices] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: contactIds }, companyId, OR: [{ createdAt: { gte: since } }, { wonAt: { gte: since } }] },
      select: { id: true, status: true, createdAt: true, wonAt: true },
    }),
    prisma.quote.findMany({
      where: { companyId, contactId: { in: contactIds }, OR: [{ createdAt: { gte: since } }, { sentAt: { gte: since } }] },
      select: { id: true, contactId: true, createdAt: true, sentAt: true },
    }),
    prisma.appointment.findMany({
      where: { companyId, contactId: { in: contactIds }, createdAt: { gte: since } },
      select: { id: true, contactId: true, createdAt: true },
    }),
    prisma.job.findMany({
      where: { companyId, contactId: { in: contactIds }, createdAt: { gte: since } },
      select: { id: true, contactId: true, createdAt: true, scheduledAt: true },
    }),
    prisma.invoice.findMany({
      where: { companyId, contactId: { in: contactIds }, OR: [{ createdAt: { gte: since } }, { issuedAt: { gte: since } }] },
      select: { id: true, contactId: true, createdAt: true, issuedAt: true, status: true },
    }),
  ]);
  return assignCallEvents(withContact, { contacts, quotes, appointments, jobs, invoices }, now);
}
