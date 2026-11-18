/**
 * Follow-ups, the half that reads the database and calls the model
 * (lib/follow-ups.ts holds the rules; docs/plans/ai-workers-follow-ups-2026-11-17.md).
 *
 * `loadFollowUps` gathers every open quote and past-due invoice the signed-in
 * person may see, with what has already happened around each (automatic
 * reminders, the team's messages / emails / calls, the client's own, notes,
 * visits coming up, the person's earlier "not now"), and hands them to the
 * pure rules. `draftFollowUp` writes one message: the model first, checked by
 * `checkDraft`, once more if it fails, then the built-in wording. Nothing in
 * this file sends anything: the page posts the finished message to the same
 * routes the Messages page and the email composer use.
 */
import { prisma } from "@/lib/db";
import { canSeeMoney, canSell, viaContactScope, type Actor } from "@/lib/permissions";
import { invoiceBalance } from "@/lib/payments";
import { canText, companyCanSendSms } from "@/lib/sms";
import { companyEmailBlocked, emailEnabled } from "@/lib/email";
import { localDayParts, wallTimeToUtc } from "@/lib/booking-engine";
import { meteredOneShot } from "@/lib/atlas-oneshot";
import { reportError } from "@/lib/report-error";
import {
  builtInDraft,
  FOLLOW_UP_BAR,
  holdNoteIn,
  pickFollowUps,
  SILENCE_LABEL,
  writeDraft,
  type DraftFacts,
  type FollowUpChannel,
  type FollowUpKind,
  type FollowUpOffer,
  type FollowUpSubject,
  type Silence,
} from "@/lib/follow-ups";

const DAY = 86_400_000;
/** Notes older than this no longer hold anyone back. */
const NOTE_DAYS = 180;
/** How far back messages and calls are read. */
const TOUCH_DAYS = 130;

export type FollowUpItem = FollowUpOffer & {
  clientName: string;
  clientFirstName: string;
  number: number;
  title: string | null;
  /** Quote total, or what is still owed (with the client's other past-due invoices when they ride along). */
  amount: number;
  /** The document in the app. */
  href: string;
  /** The client's thread, for the person who would rather write their own. */
  threadHref: string;
};

export type FollowUpList = {
  items: FollowUpItem[];
  /** Clients whose last message nobody answered. */
  waiting: { clientId: string; clientName: string; href: string }[];
  /** What was left alone and why, counted. Only reasons worth a person's attention. */
  heldBack: { reason: Silence; label: string; count: number }[];
};

type Loaded = { subjects: FollowUpSubject[]; names: Map<string, { name: string; first: string }>; tz: string; companyName: string };

function monthDay(tz: string, d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz });
}

async function loadSubjects(actor: Actor, only?: { kind: FollowUpKind; id: string }): Promise<Loaded> {
  const companyId = actor.companyId;
  const now = new Date();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true, name: true } });
  const tz = company?.timezone ?? "America/Chicago";
  const wantQuotes = canSell(actor.role) && (!only || only.kind === "quote");
  const wantInvoices = canSeeMoney(actor) && (!only || only.kind === "invoice");
  const scope = viaContactScope(actor);

  const [quotes, invoices] = await Promise.all([
    wantQuotes
      ? prisma.quote.findMany({
          where: {
            companyId,
            ...scope,
            status: "AWAITING_RESPONSE",
            sentAt: { not: null, gte: new Date(now.getTime() - (FOLLOW_UP_BAR.quote.coldAfterDays + 2) * DAY) },
            ...(only ? { id: only.id } : {}),
          },
          select: {
            id: true, quoteNumber: true, title: true, total: true, sentAt: true, createdAt: true, validUntil: true,
            viewCount: true, lastViewedAt: true, notes: true, contactId: true,
            reminders: { select: { type: true, sentAt: true } },
          },
          orderBy: { sentAt: "desc" },
          take: 300,
        })
      : [],
    wantInvoices
      ? prisma.invoice.findMany({
          where: {
            companyId,
            ...scope,
            status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] },
            kind: { not: "STORE_ORDER" },
            dueDate: { not: null, lt: now, gte: new Date(now.getTime() - (FOLLOW_UP_BAR.invoice.coldAfterDays + 2) * DAY) },
            ...(only ? { id: only.id } : {}),
          },
          select: {
            id: true, invoiceNumber: true, subject: true, total: true, issuedAt: true, createdAt: true, dueDate: true,
            viewCount: true, lastViewedAt: true, notes: true, contactId: true,
            autoChargeNextAt: true, autoChargeGaveUpAt: true,
            payments: { select: { amount: true, surchargeAmount: true, paidAt: true } },
            reminders: { select: { sentAt: true } },
          },
          orderBy: { dueDate: "asc" },
          take: 300,
        })
      : [],
  ]);

  const contactIds = [...new Set([...quotes.map((q) => q.contactId), ...invoices.map((i) => i.contactId)].filter((id): id is string => !!id))];
  const names = new Map<string, { name: string; first: string }>();
  if (!contactIds.length) return { subjects: [], names, tz, companyName: company?.name ?? "" };

  const since = new Date(now.getTime() - TOUCH_DAYS * DAY);
  const inContacts = { in: contactIds };
  const [contacts, notes, messages, emails, calls, appts, jobs, otherQuotes, skips, lineCanText, emailBlocked] = await Promise.all([
    prisma.contact.findMany({
      where: { id: inContacts, companyId },
      select: {
        id: true, firstName: true, lastName: true, companyName: true, status: true, kind: true, placeholder: true,
        email: true, phone: true, smsOptOut: true, smsDisabled: true, notes: true,
      },
    }),
    prisma.contactNote.findMany({
      where: { contactId: inContacts, createdAt: { gte: new Date(now.getTime() - NOTE_DAYS * DAY) } },
      select: { contactId: true, body: true },
      orderBy: { createdAt: "desc" },
      take: 1500,
    }),
    prisma.portalMessage.findMany({
      where: { companyId, contactId: inContacts, createdAt: { gte: since } },
      select: { contactId: true, direction: true, senderId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.clientMessage.findMany({
      where: { companyId, contactId: inContacts, createdAt: { gte: since }, senderId: { not: null } },
      select: { contactId: true, createdAt: true },
      take: 3000,
    }),
    prisma.call.findMany({
      where: { companyId, contactId: inContacts, createdAt: { gte: since } },
      select: { contactId: true, direction: true, status: true, answeredAt: true, endedAt: true, createdAt: true },
      take: 3000,
    }),
    prisma.appointment.findMany({
      where: { companyId, contactId: inContacts, status: "SCHEDULED", scheduledAt: { gte: now, lt: new Date(now.getTime() + FOLLOW_UP_BAR.visitWithinDays * DAY) } },
      select: { contactId: true, scheduledAt: true },
    }),
    prisma.job.findMany({
      where: { companyId, contactId: inContacts, status: "ACTIVE", scheduledAt: { gte: now, lt: new Date(now.getTime() + FOLLOW_UP_BAR.visitWithinDays * DAY) } },
      select: { contactId: true, scheduledAt: true },
    }),
    // A later quote that is out, approved or already a job makes an older one history
    quotes.length
      ? prisma.quote.findMany({
          where: { companyId, contactId: inContacts, status: { in: ["AWAITING_RESPONSE", "APPROVED", "CONVERTED"] } },
          select: { id: true, contactId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 2000,
        })
      : [],
    prisma.followUpSkip.findMany({ where: { companyId }, select: { kind: true, entityId: true, until: true } }),
    companyCanSendSms(companyId),
    emailEnabled() ? companyEmailBlocked(companyId) : Promise.resolve(true),
  ]);

  const byContact = <T extends { contactId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      if (!r.contactId) continue;
      const list = m.get(r.contactId) ?? [];
      list.push(r);
      m.set(r.contactId, list);
    }
    return m;
  };
  const notesBy = byContact(notes);
  const messagesBy = byContact(messages);
  const emailsBy = byContact(emails);
  const callsBy = byContact(calls);
  const visitsBy = byContact([...appts, ...jobs]);
  const quotesBy = byContact(otherQuotes);
  const skipOf = new Map(skips.map((s) => [`${s.kind}:${s.entityId}`, { until: s.until }]));

  type PerClient = Pick<FollowUpSubject, "client" | "teamTouches" | "lastClientAt" | "upcomingVisitAt"> & { notes: string[] };
  const perClient = new Map<string, PerClient>();
  for (const c of contacts) {
    const teamTouches: Date[] = [];
    let lastClientAt: Date | null = null;
    const client = (d: Date) => {
      if (!lastClientAt || d.getTime() > lastClientAt.getTime()) lastClientAt = d;
    };
    for (const m of messagesBy.get(c.id) ?? []) {
      if (m.direction === "INBOUND") client(m.createdAt);
      else if (m.senderId) teamTouches.push(m.createdAt); // a person wrote it (automatic texts have no sender)
    }
    for (const e of emailsBy.get(c.id) ?? []) teamTouches.push(e.createdAt);
    for (const call of callsBy.get(c.id) ?? []) {
      if (call.direction === "OUTBOUND") {
        // Reaching them or trying to: either way a person just did something about this client
        if (call.status !== "FAILED") teamTouches.push(call.createdAt);
      } else {
        client(call.createdAt);
        // An answered call is a conversation: the team's side of it lands after the client's
        if (call.answeredAt) teamTouches.push(call.endedAt ?? new Date(call.answeredAt.getTime() + 1000));
      }
    }
    const visits = (visitsBy.get(c.id) ?? []).map((v) => v.scheduledAt).filter((d): d is Date => !!d);
    perClient.set(c.id, {
      client: {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        archived: c.status === "ARCHIVED",
        notACustomer: c.kind === "CONTACT" || c.placeholder,
        email: c.email,
        canText: lineCanText && canText(c),
      },
      teamTouches,
      lastClientAt,
      upcomingVisitAt: visits.length ? new Date(Math.min(...visits.map((v) => v.getTime()))) : null,
      notes: [c.notes ?? "", ...(notesBy.get(c.id) ?? []).slice(0, 8).map((n) => n.body)],
    });
    const person = `${c.firstName} ${c.lastName}`.trim();
    names.set(c.id, { name: person || c.companyName || "Client", first: c.firstName });
  }
  const none: PerClient = { client: null, teamTouches: [], lastClientAt: null, upcomingVisitAt: null, notes: [] };

  const subjects: FollowUpSubject[] = [];
  for (const q of quotes) {
    const pc = perClient.get(q.contactId) ?? none;
    const days = q.sentAt ? (now.getTime() - q.sentAt.getTime()) / DAY : 0;
    let validUntil: Date | null = null;
    if (q.validUntil) {
      const { y, m, d } = localDayParts(tz, q.validUntil);
      validUntil = wallTimeToUtc(tz, y, m, d, 24 * 60);
    }
    subjects.push({
      kind: "quote",
      id: q.id,
      number: q.quoteNumber,
      title: q.title,
      amount: Number(q.total),
      total: Number(q.total),
      open: true,
      sentAt: q.sentAt,
      dueDate: null,
      validUntil,
      viewCount: q.viewCount,
      lastViewedAt: q.lastViewedAt,
      autoReminders: q.reminders.map((r) => r.sentAt),
      // The sweep emails at 3 and 7 days (lib/reminders.ts). It is still to
      // come only while it can run: email on, an address on file, inside
      // the window. A stage that never fired (email was off that week) must
      // not hold the quote back for good.
      autoRemindersPending: !emailBlocked && !!pc.client?.email && days < 8 && !q.reminders.some((r) => r.type === "followup_7"),
      autoPayPending: false,
      lastPaymentAt: null,
      newerQuote: (quotesBy.get(q.contactId) ?? []).some((o) => o.id !== q.id && o.createdAt.getTime() > q.createdAt.getTime()),
      upcomingVisitAt: pc.upcomingVisitAt,
      holdNote: holdNoteIn([...pc.notes, q.notes]),
      skip: skipOf.get(`quote:${q.id}`) ?? null,
      client: pc.client,
      teamTouches: pc.teamTouches,
      lastClientAt: pc.lastClientAt,
    });
  }
  for (const i of invoices) {
    const pc = (i.contactId && perClient.get(i.contactId)) || none;
    const paid = i.payments.map((p) => p.paidAt.getTime());
    subjects.push({
      kind: "invoice",
      id: i.id,
      number: i.invoiceNumber,
      title: i.subject,
      amount: Math.max(0, Math.round(invoiceBalance(i) * 100) / 100),
      total: Number(i.total),
      open: true,
      sentAt: i.issuedAt ?? i.createdAt,
      dueDate: i.dueDate,
      validUntil: null,
      viewCount: i.viewCount,
      lastViewedAt: i.lastViewedAt,
      autoReminders: i.reminders.map((r) => r.sentAt),
      autoRemindersPending: false,
      autoPayPending: !!i.autoChargeNextAt && i.autoChargeNextAt.getTime() > now.getTime() && !i.autoChargeGaveUpAt,
      lastPaymentAt: paid.length ? new Date(Math.max(...paid)) : null,
      newerQuote: false,
      upcomingVisitAt: pc.upcomingVisitAt,
      holdNote: holdNoteIn([...pc.notes, i.notes]),
      skip: skipOf.get(`invoice:${i.id}`) ?? null,
      client: pc.client,
      teamTouches: pc.teamTouches,
      lastClientAt: pc.lastClientAt,
    });
  }
  return { subjects, names, tz, companyName: company?.name ?? "" };
}

const hrefOf = (kind: FollowUpKind, id: string) => (kind === "invoice" ? `/app/invoices/${id}` : `/app/quotes/${id}`);

/** Everything worth a follow-up today for this person, plus what was left alone. */
export async function loadFollowUps(actor: Actor): Promise<FollowUpList> {
  const { subjects, names } = await loadSubjects(actor);
  const pick = pickFollowUps(subjects, new Date());
  const byKey = new Map(subjects.map((s) => [`${s.kind}:${s.id}`, s]));

  const items: FollowUpItem[] = pick.offers.map((o) => {
    const s = byKey.get(`${o.kind}:${o.id}`)!;
    const who = names.get(o.clientId);
    return {
      ...o,
      clientName: who?.name ?? "Client",
      clientFirstName: who?.first ?? "",
      number: s.number,
      title: s.title,
      amount: Math.round((s.amount + o.alsoOwed.reduce((sum, x) => sum + x.amount, 0)) * 100) / 100,
      href: hrefOf(o.kind, o.id),
      threadHref: `/app/messages/thread/${o.clientId}`,
    };
  });

  const counts = new Map<Silence, number>();
  for (const s of pick.silent) {
    if (!SILENCE_LABEL[s.reason] || s.reason === "client_waiting") continue;
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  }
  return {
    items,
    waiting: pick.waiting.map((w) => ({
      clientId: w.clientId,
      clientName: names.get(w.clientId)?.name ?? "Client",
      href: `/app/messages/thread/${w.clientId}`,
    })),
    heldBack: [...counts.entries()].map(([reason, count]) => ({ reason, label: SILENCE_LABEL[reason]!, count })).sort((a, b) => b.count - a.count),
  };
}

/** How many are worth sending today — for the dashboard and Atlas. Never throws. */
export async function countFollowUps(actor: Actor): Promise<number> {
  try {
    const { subjects } = await loadSubjects(actor);
    return pickFollowUps(subjects, new Date()).offers.length;
  } catch (err) {
    reportError("[follow-ups] count failed", err);
    return 0;
  }
}

export type FollowUpDraft = {
  channel: FollowUpChannel;
  subject: string | null;
  body: string;
  /** Goes under the message on its own line when it is sent. Null when this message carries none. */
  link: { label: string; url: string } | null;
  /** "atlas" = written for this client; "standard" = the built-in wording. */
  source: "atlas" | "standard";
  /** Why the standard wording was used, when it was. */
  note: string | null;
  /** Where the page posts the finished message. */
  send: { endpoint: string; clientId: string };
};

export type DraftResult = { ok: true; draft: FollowUpDraft } | { ok: false; status: number; error: string };

/**
 * One message for one document. The document must be on today's list: a
 * draft is never written for something the rules said to leave alone.
 */
export async function draftFollowUp(
  actor: Actor,
  kind: FollowUpKind,
  id: string,
  channel: FollowUpChannel | null,
  opts: { useModel?: boolean } = {}
): Promise<DraftResult> {
  const { subjects, names, tz, companyName } = await loadSubjects(actor);
  const pick = pickFollowUps(subjects, new Date());
  const offer = pick.offers.find((o) => o.kind === kind && o.id === id);
  if (!offer) return { ok: false, status: 409, error: "This one is no longer waiting for a follow-up. Refresh the list." };
  const s = subjects.find((x) => x.kind === kind && x.id === id)!;
  const useChannel = channel && offer.channels.includes(channel) ? channel : offer.channels[0];

  const doc =
    kind === "invoice"
      ? await prisma.invoice.findFirst({ where: { id, companyId: actor.companyId }, select: { publicToken: true } })
      : await prisma.quote.findFirst({ where: { id, companyId: actor.companyId }, select: { publicToken: true } });
  const base = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");
  // An invoice link may go by text or email. A quote link goes by email only:
  // the business line's texting registration covers account notices, and a
  // quote link by text reads to the carriers as marketing.
  const link =
    doc && (kind === "invoice" || useChannel === "email")
      ? kind === "invoice"
        ? { label: "View and pay your invoice", url: `${base}/pay/${doc.publicToken}` }
        : { label: "View your quote", url: `${base}/quote/${doc.publicToken}` }
      : null;

  const facts: DraftFacts = {
    kind,
    channel: useChannel,
    tone: offer.tone,
    clientFirstName: names.get(offer.clientId)?.first ?? "",
    senderFirstName: (actor.name ?? "").trim().split(/\s+/)[0] ?? "",
    companyName,
    number: s.number,
    title: s.title,
    amount: s.amount,
    total: s.total,
    alsoOwed: offer.alsoOwed.map((o) => ({ number: o.number, amount: o.amount })),
    dueDateLabel: s.dueDate ? s.dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : null,
    // The last day it is good, in the company's own calendar
    validUntilLabel: s.validUntil ? monthDay(tz, new Date(s.validUntil.getTime() - 60_000)) : null,
    daysPastDue: offer.daysPastDue,
    followUpCount: offer.followUpCount,
    hasLink: !!link,
  };
  const send = {
    endpoint: useChannel === "email" ? `/api/app/contacts/${offer.clientId}/message` : `/api/app/messages/${offer.clientId}`,
    clientId: offer.clientId,
  };
  if (opts.useModel === false) {
    const d = builtInDraft(facts);
    return { ok: true, draft: { channel: useChannel, subject: d.subject, body: d.body, link, source: "standard", note: null, send } };
  }

  const written = await writeDraft(facts, async (system, prompt) => {
    const res = await meteredOneShot(actor, { kind: "follow-up", system, prompt, maxOutputTokens: 1200, temperature: 0.7, thinkingBudget: 256 });
    if (res.ok) return { ok: true, text: res.text };
    // Out of tokens or switched off says so in its own words; anything else is "not just now"
    return { ok: false, note: res.atlasLocked || res.status === 403 ? res.error : "Atlas could not write this one just now, so this is the standard wording." };
  });
  if (written.source === "standard" && written.attempts.length === 2) {
    reportError("[follow-ups] two drafts failed the check", { kind, id, problems: written.attempts });
  }
  return {
    ok: true,
    draft: { channel: useChannel, subject: written.draft.subject, body: written.draft.body, link, source: written.source, note: written.note, send },
  };
}

/** "Not now" (a week) or "do not follow up on this one". Returns false when the document is not this person's to see. */
export async function skipFollowUp(actor: Actor, kind: FollowUpKind, id: string, mode: "later" | "never" | "undo"): Promise<boolean> {
  const where = { id, companyId: actor.companyId, ...viaContactScope(actor) };
  const allowed = kind === "invoice" ? canSeeMoney(actor) : canSell(actor.role);
  if (!allowed) return false;
  const found = kind === "invoice" ? await prisma.invoice.findFirst({ where, select: { id: true } }) : await prisma.quote.findFirst({ where, select: { id: true } });
  if (!found) return false;
  const key = { companyId_kind_entityId: { companyId: actor.companyId, kind, entityId: id } };
  if (mode === "undo") {
    await prisma.followUpSkip.deleteMany({ where: { companyId: actor.companyId, kind, entityId: id } });
    return true;
  }
  const until = mode === "later" ? new Date(Date.now() + FOLLOW_UP_BAR.snoozeDays * DAY) : null;
  await prisma.followUpSkip.upsert({
    where: key,
    create: { companyId: actor.companyId, kind, entityId: id, until, userId: actor.id },
    update: { until, userId: actor.id, createdAt: new Date() },
  });
  return true;
}
