/**
 * Follow-ups — the first back-office worker
 * (docs/plans/ai-workers-follow-ups-2026-11-17.md).
 *
 * It finds the quotes and unpaid invoices that are worth a personal nudge,
 * writes the message, and a PERSON sends it. Nothing here talks to a client.
 *
 * Two halves, both pure (no database, no network, no model), so both are
 * scored exactly by scripts/test-follow-ups.ts:
 *
 *   1. WHO. `judgeFollowUp` looks at one quote or invoice and either offers
 *      it or stays silent with a reason. Most of the rules are reasons to
 *      stay silent: the client just wrote, a person already reached out, an
 *      automatic reminder went out yesterday, a note says to leave them
 *      alone. A worker that chases the wrong person once is switched off.
 *
 *   2. WHAT. A draft (from the model, or from the built-in wording when the
 *      model is off or fails) goes through `checkDraft` before anyone sees
 *      it: every dollar figure, document number and date in it must be one
 *      the facts contain, and it may not threaten, offer a discount, invent
 *      a deadline, claim a conversation that did not happen, or carry a link.
 *      A draft that fails is thrown away.
 *
 * The automatic reminder emails (lib/reminders.ts: quotes at 3 and 7 days,
 * invoices at 0, 3, 7 and 14 days past due) keep running. This worker picks
 * up where they stop, and stays out of their way while they run.
 */

const DAY = 86_400_000;

export const FOLLOW_UP_BAR = {
  quote: {
    /** Nothing before this many days after the quote went out. */
    minDays: 4,
    /** Opened this many times, the last one this recently: worth a nudge early. */
    hotViews: 3,
    hotViewedWithinDays: 2,
    hotMinDays: 2,
    /** The quote runs out within this many days. */
    expiringWithinDays: 4,
    /** Older than this and a "just checking in" reads as desperate. */
    coldAfterDays: 45,
    /** Room after an automatic reminder email. */
    afterAutoReminderDays: 3,
  },
  invoice: {
    minDaysPastDue: 5,
    afterAutoReminderDays: 2,
    /** A balance under this is not worth a message. */
    minBalance: 5,
    /** Past this it is a collections matter, not a nudge. */
    coldAfterDays: 120,
    /** They paid part of it this recently: they are paying. */
    afterPaymentDays: 7,
    directAfterDays: 21,
    lastAfterDays: 45,
  },
  /** A person texted, emailed or called the client this recently. */
  quietAfterTeamDays: 4,
  /** ...and when that was already a follow-up on this document. */
  betweenFollowUpsDays: 6,
  /** The client wrote or called this recently: the conversation is live. */
  quietAfterClientDays: 7,
  /** After this many follow-ups with no answer, stop offering. */
  maxFollowUps: 3,
  /** A visit with this client is coming up: say it in person. */
  visitWithinDays: 7,
  /** A team touch counts as a follow-up once the document has been out this long. */
  followUpCountsAfterDays: 2,
  /** "Not now" hides it this long. */
  snoozeDays: 7,
} as const;

export type FollowUpKind = "quote" | "invoice";
export type FollowUpChannel = "text" | "email";
/** 1 = gentle first nudge, 2 = direct, 3 = the last one. */
export type FollowUpTone = 1 | 2 | 3;

export type FollowUpClient = {
  id: string;
  firstName: string;
  lastName: string;
  /** Archived, a business connection (never a customer), or a number nobody has named yet. */
  archived: boolean;
  notACustomer: boolean;
  email: string | null;
  /** This client can be texted AND the company's line can send texts. */
  canText: boolean;
};

export type FollowUpSubject = {
  kind: FollowUpKind;
  id: string;
  number: number;
  title: string | null;
  /** Quote: its total. Invoice: what is still owed. */
  amount: number;
  /** The document's full total. */
  total: number;
  /** Quote awaiting a reply / invoice awaiting payment (not a draft, not paid, not a shop order). */
  open: boolean;
  /** When it went to the client. */
  sentAt: Date | null;
  /** Invoice only. */
  dueDate: Date | null;
  /** Quote only: the instant it stops being valid. */
  validUntil: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  /** When the automatic reminder emails for this document went out. */
  autoReminders: Date[];
  /** More automatic reminders are still to come and they can reach this client. */
  autoRemindersPending: boolean;
  /** Invoice: a card on file will be tried again automatically. */
  autoPayPending: boolean;
  /** Invoice: the latest payment toward it. */
  lastPaymentAt: Date | null;
  /** Quote: a later quote to the same client is out or approved. */
  newerQuote: boolean;
  /** The next appointment or job visit with this client. */
  upcomingVisitAt: Date | null;
  /** The words of a note that says to leave this client alone (see `holdNoteIn`). */
  holdNote: string | null;
  /** The person's own answer to an earlier offer. */
  skip: { until: Date | null } | null;
  client: FollowUpClient | null;
  /** Every time a person on the team texted, messaged, emailed or spoke with this client. */
  teamTouches: Date[];
  /** The last time the client wrote, called or left a voicemail. */
  lastClientAt: Date | null;
};

export type Silence =
  | "not_open"
  | "no_client"
  | "not_a_customer"
  | "archived"
  | "dismissed"
  | "snoozed"
  | "nothing_owed"
  | "superseded"
  | "expired"
  | "cold"
  | "hold_note"
  | "client_waiting"
  | "client_active"
  | "team_touched"
  | "auto_reminder_recent"
  | "auto_reminders_coming"
  | "visit_soon"
  | "autopay_pending"
  | "paying"
  | "not_due"
  | "too_soon"
  | "enough"
  | "no_channel"
  | "one_at_a_time";

export type FollowUpOffer = {
  offer: true;
  kind: FollowUpKind;
  id: string;
  clientId: string;
  /** Why now, as plain facts a person can check. Never model text. */
  why: string[];
  /** The one-line reason this surfaced today. */
  trigger: "ripe" | "hot" | "expiring" | "past_due";
  tone: FollowUpTone;
  /** Ways to reach them, the suggested one first. */
  channels: FollowUpChannel[];
  /** Follow-ups a person already sent on this document. */
  followUpCount: number;
  daysSinceSent: number | null;
  daysPastDue: number | null;
  score: number;
  /** Other past-due invoices of the same client, folded into this one message. */
  alsoOwed: { id: string; number: number; amount: number }[];
};
export type FollowUpSilence = { offer: false; kind: FollowUpKind; id: string; clientId: string | null; reason: Silence };
export type FollowUpVerdict = FollowUpOffer | FollowUpSilence;

const wholeDays = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
/** Whole days since the due DAY ended (lib/due-dates.ts: due today is not late). */
export function daysPastDue(dueDate: Date, now: Date): number {
  return Math.round((utcDay(now) - utcDay(dueDate)) / DAY);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ago = (n: number) => (n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);
export const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Notes that mean "leave this client alone". Deliberately a short list of
 * plain phrases: a note the worker cannot read for certain is a reason to
 * stay silent, never a reason to guess.
 */
const HOLD_PATTERNS: RegExp[] = [
  /\b(do not|don'?t|dont|never|stop)\s+(contact|call|text|email|message|chase|follow[\s-]?up|bother|remind|nag|bug)/i,
  /\bno\s+(more\s+)?(follow[\s-]?ups?|reminders?)\b/i,
  /\bno\s+(more\s+)?(calls?|texts?|emails?|contact)\s*(please|pls|per\b|[,.;!]|$)/im,
  /\b(s?he|they|client|customer|husband|wife|homeowner|owner)\s+(will|is going to|are going to|wants? to|said (s?he|they)('ll| will))\s+(call|contact|reach out|get back|let (us|me) know|think (it|about))/i,
  /\b(will|'ll)\s+(call|contact|get back to|let)\s+(us|me)\b/i,
  /\b(payment|pay)\s+(plan|arrangement|schedule)\b/i,
  /\b(paying|pays|will pay|to pay)\s+(in\s+(installments|parts)|(on|by)\s+the\b|after|when|next)\b/i,
  /\b(waiting|waits|holding|hold)\s+(on|for)\s+(the\s+|their\s+|an?\s+)?(insurance|adjuster|financing|loan|hoa|permit|claim|check|settlement|closing)/i,
  /\b(deceased|passed away|funeral|hospice|in (the )?hospital|bereave)/i,
  /\b(disput(e|ed|ing)|chargeback|lawyer|attorney|lawsuit|small claims|bankrupt)/i,
  /\b(on hold|put (this|it) on hold|paused?) (until|till|for now|per)\b/i,
];

/** The first note that says to leave the client alone, cut short; null when none does. */
export function holdNoteIn(notes: (string | null | undefined)[]): string | null {
  for (const n of notes) {
    if (!n) continue;
    if (HOLD_PATTERNS.some((p) => p.test(n))) {
      const flat = n.replace(/\s+/g, " ").trim();
      return flat.length > 140 ? `${flat.slice(0, 139).trimEnd()}…` : flat;
    }
  }
  return null;
}

function silent(s: FollowUpSubject, reason: Silence): FollowUpSilence {
  return { offer: false, kind: s.kind, id: s.id, clientId: s.client?.id ?? null, reason };
}

/** One quote or invoice: offer it, or say why not. */
export function judgeFollowUp(s: FollowUpSubject, now: Date): FollowUpVerdict {
  const bar = FOLLOW_UP_BAR;
  if (!s.open || !s.sentAt) return silent(s, "not_open");
  const c = s.client;
  if (!c) return silent(s, "no_client");
  if (c.notACustomer) return silent(s, "not_a_customer");
  if (c.archived) return silent(s, "archived");
  if (s.skip) {
    if (!s.skip.until) return silent(s, "dismissed");
    if (s.skip.until.getTime() > now.getTime()) return silent(s, "snoozed");
  }
  if (s.kind === "invoice" ? s.amount < bar.invoice.minBalance : s.amount <= 0) return silent(s, "nothing_owed");

  const days = wholeDays(s.sentAt, now);
  const overdue = s.kind === "invoice" && s.dueDate ? daysPastDue(s.dueDate, now) : null;

  // The document itself
  if (s.kind === "quote") {
    if (s.newerQuote) return silent(s, "superseded");
    if (s.validUntil && s.validUntil.getTime() <= now.getTime()) return silent(s, "expired");
    if (days > bar.quote.coldAfterDays) return silent(s, "cold");
  } else {
    if (overdue == null || overdue < 1) return silent(s, "not_due");
    if (overdue > bar.invoice.coldAfterDays) return silent(s, "cold");
    if (s.autoPayPending) return silent(s, "autopay_pending");
    if (s.lastPaymentAt && wholeDays(s.lastPaymentAt, now) < bar.invoice.afterPaymentDays) return silent(s, "paying");
  }

  // The person on the other end
  if (s.holdNote) return silent(s, "hold_note");
  const lastTeam = s.teamTouches.length ? new Date(Math.max(...s.teamTouches.map((t) => t.getTime()))) : null;
  if (s.lastClientAt) {
    const waiting =
      s.lastClientAt.getTime() > s.sentAt.getTime() && (!lastTeam || s.lastClientAt.getTime() > lastTeam.getTime());
    if (waiting) return silent(s, "client_waiting");
    if (wholeDays(s.lastClientAt, now) < bar.quietAfterClientDays) return silent(s, "client_active");
  }
  if (s.upcomingVisitAt && s.upcomingVisitAt.getTime() > now.getTime() && wholeDays(now, s.upcomingVisitAt) < bar.visitWithinDays) {
    return silent(s, "visit_soon");
  }

  // What has already been done about it
  const countFrom = (s.kind === "invoice" && s.dueDate ? s.dueDate.getTime() : s.sentAt.getTime()) + bar.followUpCountsAfterDays * DAY;
  // ...and only the ones the client has not answered: anything up to a day
  // after their last message was part of that conversation, not a nudge
  const unansweredFrom = Math.max(countFrom, s.lastClientAt ? s.lastClientAt.getTime() + DAY : 0);
  const followUps = s.teamTouches.filter((t) => t.getTime() >= unansweredFrom);
  if (followUps.length >= bar.maxFollowUps) return silent(s, "enough");
  if (lastTeam) {
    const quiet = followUps.length ? bar.betweenFollowUpsDays : bar.quietAfterTeamDays;
    if (wholeDays(lastTeam, now) < quiet) return silent(s, "team_touched");
  }
  const lastAuto = s.autoReminders.length ? new Date(Math.max(...s.autoReminders.map((t) => t.getTime()))) : null;
  const autoRoom = s.kind === "quote" ? bar.quote.afterAutoReminderDays : bar.invoice.afterAutoReminderDays;
  if (lastAuto && wholeDays(lastAuto, now) < autoRoom) return silent(s, "auto_reminder_recent");

  // Is today the day?
  let trigger: FollowUpOffer["trigger"];
  // Whole days until the quote stops being valid: 0 on its last day
  const daysLeft = s.validUntil ? Math.floor((s.validUntil.getTime() - now.getTime()) / DAY) : null;
  const viewedDaysAgo = s.lastViewedAt ? wholeDays(s.lastViewedAt, now) : null;
  if (s.kind === "invoice") {
    if (overdue! < bar.invoice.minDaysPastDue) return silent(s, "too_soon");
    trigger = "past_due";
  } else {
    const expiring = daysLeft != null && daysLeft <= bar.quote.expiringWithinDays && days >= bar.quote.hotMinDays;
    const hot =
      s.viewCount >= bar.quote.hotViews &&
      viewedDaysAgo != null &&
      viewedDaysAgo < bar.quote.hotViewedWithinDays &&
      days >= bar.quote.hotMinDays;
    if (expiring) trigger = "expiring";
    else if (hot) trigger = "hot";
    else if (days < bar.quote.minDays) return silent(s, "too_soon");
    else if (s.autoRemindersPending) return silent(s, "auto_reminders_coming");
    else trigger = "ripe";
  }

  const channels: FollowUpChannel[] =
    s.kind === "invoice"
      ? [...(c.canText ? (["text"] as const) : []), ...(c.email ? (["email"] as const) : [])]
      : // A quote goes by email when there is one; a text only when there is no other way
        c.email
        ? ["email"]
        : c.canText
          ? ["text"]
          : [];
  if (!channels.length) return silent(s, "no_channel");

  const tone: FollowUpTone =
    s.kind === "invoice"
      ? followUps.length >= 2 || overdue! > bar.invoice.lastAfterDays
        ? 3
        : followUps.length === 1 || overdue! > bar.invoice.directAfterDays
          ? 2
          : 1
      : followUps.length >= 2
        ? 3
        : followUps.length === 1 || trigger === "expiring"
          ? 2
          : 1;

  const why: string[] = [];
  if (s.kind === "invoice") {
    why.push(`${plural(overdue!, "day")} past due.`);
    if (s.amount < s.total - 0.005) why.push(`${usd(s.amount)} still owed of ${usd(s.total)}.`);
    if (s.autoReminders.length) why.push(`${plural(s.autoReminders.length, "automatic reminder")} sent, the last one ${ago(wholeDays(lastAuto!, now))}.`);
    else why.push("No automatic reminder has reached them.");
    if (s.viewCount > 0 && viewedDaysAgo != null) why.push(`They opened the invoice ${ago(viewedDaysAgo)}.`);
    else why.push("They have not opened the invoice.");
  } else {
    why.push(`Sent ${ago(days)}.`);
    if (s.viewCount > 0 && viewedDaysAgo != null) why.push(`Opened ${plural(s.viewCount, "time")}, last ${ago(viewedDaysAgo)}.`);
    else why.push("Not opened yet.");
    if (daysLeft != null && daysLeft <= 14) why.push(daysLeft <= 0 ? "It expires today." : daysLeft === 1 ? "It expires tomorrow." : `It expires in ${daysLeft} days.`);
    if (s.autoReminders.length) why.push(`${plural(s.autoReminders.length, "automatic reminder")} sent, the last one ${ago(wholeDays(lastAuto!, now))}.`);
    else if (!c.email) why.push("No email on file, so no automatic reminder went out.");
  }
  if (followUps.length) {
    why.push(`You followed up ${followUps.length === 1 ? "once" : `${followUps.length} times`}, last ${ago(wholeDays(lastTeam!, now))}. No reply.`);
  }

  const score =
    s.kind === "invoice"
      ? s.amount * (1 + Math.min(overdue!, 90) / 30)
      : s.amount * 0.5 * (trigger === "hot" ? 2 : 1) * (trigger === "expiring" ? 2 : 1);

  return {
    offer: true,
    kind: s.kind,
    id: s.id,
    clientId: c.id,
    why,
    trigger,
    tone,
    channels,
    followUpCount: followUps.length,
    daysSinceSent: days,
    daysPastDue: overdue,
    score,
    alsoOwed: [],
  };
}

export type FollowUpPick = {
  /** One per client at most, best first. */
  offers: FollowUpOffer[];
  /** Clients whose last message nobody answered: reply, do not chase. */
  waiting: { clientId: string; subjects: { kind: FollowUpKind; id: string }[] }[];
  silent: FollowUpSilence[];
};

/**
 * Everything open for a company → what to put in front of a person. One
 * message per client: an unpaid invoice beats a quote, a client's other
 * past-due invoices ride along in the same message, and their open quote
 * waits its turn.
 */
export function pickFollowUps(subjects: FollowUpSubject[], now: Date): FollowUpPick {
  const offers: FollowUpOffer[] = [];
  const silentOnes: FollowUpSilence[] = [];
  const byClient = new Map<string, FollowUpOffer[]>();
  const waiting = new Map<string, { kind: FollowUpKind; id: string }[]>();
  const amountOf = new Map(subjects.map((s) => [`${s.kind}:${s.id}`, s]));

  for (const s of subjects) {
    const v = judgeFollowUp(s, now);
    if (v.offer) {
      const list = byClient.get(v.clientId) ?? [];
      list.push(v);
      byClient.set(v.clientId, list);
    } else {
      silentOnes.push(v);
      if (v.reason === "client_waiting" && v.clientId) {
        const list = waiting.get(v.clientId) ?? [];
        list.push({ kind: v.kind, id: v.id });
        waiting.set(v.clientId, list);
      }
    }
  }

  for (const list of byClient.values()) {
    const invoices = list.filter((o) => o.kind === "invoice").sort((a, b) => b.score - a.score);
    const quotes = list.filter((o) => o.kind === "quote").sort((a, b) => b.score - a.score);
    const [lead, ...rest] = invoices.length ? invoices : quotes;
    if (invoices.length) {
      lead.alsoOwed = rest.map((o) => {
        const s = amountOf.get(`invoice:${o.id}`)!;
        return { id: o.id, number: s.number, amount: s.amount };
      });
      for (const q of quotes) silentOnes.push({ offer: false, kind: "quote", id: q.id, clientId: q.clientId, reason: "one_at_a_time" });
    } else {
      for (const q of rest) silentOnes.push({ offer: false, kind: "quote", id: q.id, clientId: q.clientId, reason: "one_at_a_time" });
    }
    offers.push(lead);
  }

  // Money already earned comes before money hoped for
  offers.sort((a, b) => (a.kind === b.kind ? b.score - a.score : a.kind === "invoice" ? -1 : 1));
  return {
    offers,
    waiting: [...waiting.entries()].map(([clientId, list]) => ({ clientId, subjects: list })),
    silent: silentOnes,
  };
}

// ─── The message ─────────────────────────────────────────────────────────────

/** Everything a draft may say. A figure, number or date that is not here does not belong in the message. */
export type DraftFacts = {
  kind: FollowUpKind;
  channel: FollowUpChannel;
  tone: FollowUpTone;
  clientFirstName: string;
  senderFirstName: string;
  companyName: string;
  number: number;
  title: string | null;
  /** Quote total, or what is still owed on the invoice. */
  amount: number;
  total: number;
  alsoOwed: { number: number; amount: number }[];
  /** "November 21" — the invoice's due date, in words. */
  dueDateLabel: string | null;
  /** "November 30" — the last day the quote is good, in words. */
  validUntilLabel: string | null;
  daysPastDue: number | null;
  followUpCount: number;
  /** A link goes under the message (added by the app, never written by the model). */
  hasLink: boolean;
};

export type Draft = { subject: string | null; body: string };

export const DRAFT_LIMITS = { textMax: 320, emailMax: 900, min: 40, subjectMax: 80 } as const;

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const FORBIDDEN: { why: string; re: RegExp }[] = [
  { why: "threatens the client", re: /\b(collections?( agency)?|legal action|attorney|lawyer|lawsuit|court|lien|credit (score|report|bureau)|report(ed|ing)? (you|this)|consequences|further action|suspend(ed)? service)\b/i },
  { why: "adds a fee the invoice does not have", re: /\b(late fees?|interest|penalt(y|ies)|finance charge|surcharge)\b/i },
  { why: "offers something nobody approved", re: /\b(discount(s|ed)?|\d+\s*(%|percent)\s*off|coupon|promo(tion)?|special (offer|price|rate)|waive[ds]?|free of charge|for free|on the house|price match|(knock|take) \$?\d[\d,.]* off)\b/i },
  { why: "pressures the client", re: /\b(last chance|final notice|final warning|act now|immediately|urgent(ly)?|asap|right away|must pay|you need to pay|overdue notice|don'?t miss out|limited time|spots? (are )?filling)\b/i },
  { why: "mentions AI or automation", re: /\b(a\.?i\.?|artificial intelligence|assistant|atlas|automated|automatic(ally)?|bot|system[- ]generated|workbench)\b/i },
  { why: "claims a conversation that is not on record", re: /\b(as (we|you) (discussed|agreed|talked|mentioned)|per our (call|conversation|chat|discussion|agreement)|like (we|you) (said|discussed|agreed)|you (said|promised|agreed|told (me|us)|mentioned)|when we (spoke|talked|met)|(we|you and i) (talked|spoke|discussed|chatted|went over)|our (last )?(call|conversation|chat|visit|meeting))\b/i },
  { why: "promises a date or a place on the schedule", re: /\b(on (the|our|my) (schedule|calendar)|get you (scheduled|booked|in)|(your|a|an open|open) (spot|slot|opening)s?|book you|fit you in|pencil you in|availability|we can start|start (date|as early|as soon|next|this))\b/i },
  { why: "promises never to contact them again", re: /\b(won'?t|will not|never) (reach out|contact|bother|bug|message|email|text|call|follow up)( with)?( you)?( about (it|this))? again\b/i },
  { why: "says how payment works", re: /\b((one|a single) payment|pay (both|them all|it all|everything) (at once|together)|payment (options|methods)|pay (by|with) (card|check|cash|zelle|venmo)|installments?)\b/i },
  { why: "invents a deadline", re: new RegExp(`\\b(by|before|until|no later than)\\s+(tomorrow|today|tonight|end of (the )?(day|week|month)|eod|cob|next week|this week|${WEEKDAYS})\\b`, "i") },
  { why: "guilt-trips the client", re: /\b(disappointed|ignor(e|ed|ing)|we('ve| have) been patient|unacceptable|as a small business|i have bills|my family)\b/i },
];

function moneyIn(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?(\d[\d,]*(?:\.\d+)?)|\b(\d[\d,]*(?:\.\d+)?)\s*(?:dollars|bucks|usd)\b/gi;
  for (const m of text.matchAll(re)) out.push(Number((m[1] ?? m[2]).replace(/,/g, "")));
  return out;
}

/** "November 21", "Nov 21st", "11/21" → month*100+day, for comparing against the allowed dates. */
function datesIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"))) {
    out.push(MONTH_INDEX[m[1].slice(0, 3).toLowerCase()] * 100 + Number(m[2]));
  }
  // "12 May" is left out on purpose: "invoice #12 may have slipped by" is not a date
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.replace("|may|", "|")})\\b`, "gi"))) {
    out.push(MONTH_INDEX[m[2].slice(0, 3).toLowerCase()] * 100 + Number(m[1]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) out.push((Number(m[1]) - 1) * 100 + Number(m[2]));
  return out;
}

/**
 * What is wrong with a draft, as plain reasons; empty = fit to show a person.
 * The same check runs on the model's drafts in production and on every
 * built-in wording in the scorecard.
 */
export function checkDraft(draft: Draft, f: DraftFacts): string[] {
  const problems: string[] = [];
  const body = draft.body.trim();
  const all = `${draft.subject ?? ""}\n${body}`;
  // Names are not wording: "Atlas Roofing", a client called Court or a
  // sender called Bill must not trip the word rules below
  const names = [f.companyName, f.clientFirstName, f.senderFirstName].map((n) => n.trim()).filter((n) => n.length > 1);
  const wording = names.reduce((t, n) => t.split(new RegExp(escapeRe(n), "gi")).join(" "), all);
  const max =f.channel === "text" ? DRAFT_LIMITS.textMax : DRAFT_LIMITS.emailMax;

  if (body.length < DRAFT_LIMITS.min) problems.push("too short to be a message");
  if (body.length > max) problems.push(`too long for ${f.channel === "text" ? "a text" : "an email"} (${body.length} characters, the limit is ${max})`);
  if (f.channel === "email") {
    const subject = (draft.subject ?? "").trim();
    if (!subject) problems.push("an email needs a subject");
    if (subject.length > DRAFT_LIMITS.subjectMax) problems.push("the subject is too long");
    if (/^\s*(re|fwd?)\s*:/i.test(subject)) problems.push("the subject pretends to be a reply");
  } else if (draft.subject) problems.push("a text has no subject");

  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|app)\b/i.test(wording)) problems.push("contains a link (the app adds the real one)");
  if (/[\[\]{}<>]|_{3,}|\bX{3,}\b|\b(insert|placeholder|your name|client name)\b/i.test(all)) problems.push("has a blank left to fill in");
  if (/\p{Extended_Pictographic}/u.test(all)) problems.push("uses emoji");
  if ((all.match(/!/g) ?? []).length > 1) problems.push("more than one exclamation mark");
  if (/\b[A-Z]{4,}\b/.test(wording.replace(/\b(HVAC|LLC|USA)\b/g, ""))) problems.push("shouts in capitals");

  // Every figure must be one the facts contain
  const allowedMoney = [f.amount, f.total, ...f.alsoOwed.map((o) => o.amount), f.amount + f.alsoOwed.reduce((s, o) => s + o.amount, 0)];
  for (const n of moneyIn(all)) {
    if (!allowedMoney.some((a) => Math.abs(a - n) < 0.006)) problems.push(`names an amount that is not on the ${f.kind}: ${usd(n)}`);
  }
  if (/\d\s*(%|percent)/i.test(all)) problems.push("names a percentage");
  const allowedNumbers = [f.number, ...f.alsoOwed.map((o) => o.number)];
  for (const m of all.matchAll(/(?:#|\bno\.?\s*|\bnumber\s+)(\d{1,7})\b/gi)) {
    if (!allowedNumbers.includes(Number(m[1]))) problems.push(`names the wrong ${f.kind} number: #${m[1]}`);
  }
  const allowedDates = [f.dueDateLabel, f.validUntilLabel].filter((d): d is string => !!d).flatMap(datesIn);
  for (const d of datesIn(all)) {
    if (!allowedDates.includes(d)) problems.push("names a date that is not on the document");
  }
  const allowedWords = `${f.dueDateLabel ?? ""} ${f.validUntilLabel ?? ""}`.toLowerCase();
  for (const m of all.matchAll(new RegExp(`\\b(${WEEKDAYS})\\b`, "gi"))) {
    if (!allowedWords.includes(m[1].toLowerCase())) problems.push(`names a day (${m[1]}) that is not on the document`);
  }
  for (const rule of FORBIDDEN) {
    if (rule.re.test(wording)) problems.push(rule.why);
  }

  // It is to the right person, about the right thing
  const greeting = /^\s*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))[\s,]+([A-Za-z][\w'’-]*)/i.exec(body);
  const first = f.clientFirstName.trim().toLowerCase();
  if (greeting && first && greeting[1].toLowerCase() !== first && !/^(there|again)$/i.test(greeting[1])) {
    problems.push(`greets the wrong person (${greeting[1]})`);
  }
  if (first && !new RegExp(`\\b${escapeRe(first)}\\b`, "i").test(body)) problems.push("does not use the client's name");
  if (f.kind === "invoice" ? !/\b(invoice|balance|payment|bill)\b/i.test(body) : !/\b(quote|estimate|proposal|bid)\b/i.test(body)) {
    problems.push(`does not say it is about the ${f.kind}`);
  }
  if (f.kind === "invoice" && /\b(quote|estimate|proposal)\b/i.test(body)) problems.push("calls the invoice a quote");

  return [...new Set(problems)];
}

/**
 * A document's title as it may appear in a message, or null. Titles are
 * typed by the team for their own eyes ("FENCE - 50% dep", "Option B $4,200"):
 * one with a figure, a symbol, capitals or a word the rules forbid stays out,
 * and the message names the document by its number instead.
 */
export function safeTitle(title: string | null | undefined): string | null {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 60) return null;
  if (/[$%#<>\[\]{}!]|\d|https?:|www\./i.test(t)) return null;
  if (/\b[A-Z]{4,}\b/.test(t)) return null;
  if (FORBIDDEN.some((r) => r.re.test(t))) return null;
  if (new RegExp(`\\b(${WEEKDAYS}|${MONTHS})\\b`, "i").test(t)) return null;
  if (/\b(invoice|quote|estimate|proposal|bid|bill|balance|payment)\b/i.test(t)) return null;
  return t;
}

const subjectOf = (f: DraftFacts) => safeTitle(f.title) ?? (f.kind === "invoice" ? `invoice #${f.number}` : `quote #${f.number}`);

/**
 * The built-in wording: what a person gets when the model is off, out of
 * tokens, or wrote something `checkDraft` threw away. Plain on purpose, and
 * the scorecard proves every one of these passes `checkDraft` for every case.
 */
export function builtInDraft(f: DraftFacts): Draft {
  const draft = builtInWording(f);
  // A long business name can push a text past its limit: say the business only
  if (f.channel === "text" && draft.body.length > DRAFT_LIMITS.textMax && f.senderFirstName.trim()) {
    return builtInWording({ ...f, senderFirstName: "" });
  }
  return draft;
}

function builtInWording(f: DraftFacts): Draft {
  const name = f.clientFirstName.trim() || "there";
  const me = f.senderFirstName.trim();
  const from = me ? `${me} with ${f.companyName}` : f.companyName;
  const sign = me ? `\n\n${me}\n${f.companyName}` : `\n\n${f.companyName}`;
  const others = f.alsoOwed.length;
  const owed = usd(f.amount + f.alsoOwed.reduce((s, o) => s + o.amount, 0));
  const here = f.hasLink ? " The quote is below." : "";

  if (f.kind === "invoice") {
    // One invoice, or several in one message: the nouns and verbs follow
    const what = others ? `invoice #${f.number} and ${others === 1 ? "one other" : `${others} others`} (${owed} in all)` : `invoice #${f.number} for ${usd(f.amount)}`;
    const What = `${what.charAt(0).toUpperCase()}${what.slice(1)}`;
    const is = others ? "are" : "is";
    const below = !f.hasLink ? "" : others ? " The first one is below." : " The invoice is below.";
    if (f.channel === "text") {
      const body =
        f.tone === 1
          ? `Hi ${name}, this is ${from}. A quick note that ${what} ${is} still open.${below} Thank you.`
          : f.tone === 2
            ? `Hi ${name}, this is ${from}. Checking in on ${what}, now past due. Can you let me know when to expect payment?${below}`
            : `Hi ${name}, this is ${from}. ${What} ${is} still unpaid. If something is in the way, call me and we can work out a plan.${below}`;
      return { subject: null, body };
    }
    const subject = f.tone === 1 ? `Invoice #${f.number} is still open` : f.tone === 2 ? `Checking in on invoice #${f.number}` : `Invoice #${f.number}: can we sort this out?`;
    const wasDue = f.dueDateLabel && !others ? ` It was due ${f.dueDateLabel}.` : "";
    const body =
      f.tone === 1
        ? `Hi ${name},

A quick note that ${what} ${is} still open.${wasDue}${below} If you have already sent payment, thank you, and please disregard this.${sign}`
        : f.tone === 2
          ? `Hi ${name},

I am checking in on ${what}, now past due.${below} Can you let me know when to expect payment? If there is a question about the invoice, reply here and I will sort it out.${sign}`
          : `Hi ${name},

${What} ${is} still unpaid.${below} If something is in the way, reply or call me and we can work out a plan that suits you.${sign}`;
    return { subject, body };
  }

  const what = `the quote for ${subjectOf(f)}`.replace(/the quote for quote #/, "quote #");
  const ends = f.validUntilLabel ? ` It is good through ${f.validUntilLabel}.` : "";
  if (f.channel === "text") {
    const body =
      f.tone === 1
        ? `Hi ${name}, this is ${from}. Checking that you got ${what}. Happy to answer any questions.`
        : f.tone === 2
          ? `Hi ${name}, this is ${from}. Following up on ${what}.${ends} Would you like to go ahead, or should I change anything?`
          : `Hi ${name}, this is ${from}. One last note on ${what}. If the timing is not right, no problem, just let me know and I will close it out.`;
    return { subject: null, body };
  }
  const subject = f.tone === 1 ? `Your quote from ${f.companyName}` : f.tone === 2 ? `Following up on your quote` : `Should I keep your quote open?`;
  const body =
    f.tone === 1
      ? `Hi ${name},\n\nI wanted to make sure you got ${what}.${here}${ends} If you have questions or want anything changed, reply here and I will take care of it.${sign}`
      : f.tone === 2
        ? `Hi ${name},\n\nFollowing up on ${what}.${here}${ends} Would you like to go ahead, or is there something I should change first?${sign}`
        : `Hi ${name},\n\nOne last note on ${what}.${here} If the timing is not right, that is no problem. Let me know either way and I will keep it open or close it out.${sign}`;
  return { subject, body };
}

/** The instructions and the facts for the model. Nothing a client wrote goes in here. */
export function followUpPrompt(f: DraftFacts): { system: string; prompt: string } {
  const max = f.channel === "text" ? DRAFT_LIMITS.textMax : DRAFT_LIMITS.emailMax;
  const system = [
    `You write one short follow-up ${f.channel === "text" ? "text message" : "email"} for a home-service business owner to send to their own client. The owner reads it and presses Send; write it in their voice: a real person, plain and warm, never a company notice.`,
    "Rules, all of them hard:",
    "- Use ONLY the facts given. Never add an amount, a percentage, a fee, a date, a weekday, a deadline, a discount or an offer that is not in the facts.",
    "- Never mention a past call, visit, conversation or promise, and never say what \"we talked about\". You know of none.",
    "- Promise nothing: no start dates, no place on the schedule, no availability, no promise about future contact. Do not describe how to pay or what payment methods exist.",
    "- No threats, no pressure, no guilt. Nothing about collections, late fees, or legal steps.",
    "- No links, no placeholders, no emoji, at most one exclamation mark, no words in capitals.",
    "- Never mention AI, automation, or software.",
    `- Greet the client by first name, and say plainly that this is about the ${f.kind}.`,
    f.hasLink
      ? f.alsoOwed.length
        ? `- The app puts a link to invoice #${f.number} (only that one) under your message. You may say "invoice #${f.number} is below" but never write a link.`
        : `- The app puts a link to the ${f.kind} under your message. You may refer to it ("the ${f.kind} is below") but never write a link.`
      : `- There is no link with this message. Do not refer to one.`,
    `- At most ${max} characters${f.channel === "email" ? `, and a subject of at most ${DRAFT_LIMITS.subjectMax} characters that is not styled as a reply` : ""}.`,
    f.channel === "email" ? `- End with the sender's first name and the business name on their own lines.` : `- Open by saying who is writing (first name and business).`,
    `Answer with JSON only: ${f.channel === "email" ? `{"subject": "...", "body": "..."}` : `{"body": "..."}`}`,
  ].join("\n");

  const toneLine =
    f.kind === "invoice"
      ? f.tone === 1
        ? "First nudge. Friendly and light: it may have slipped their mind."
        : f.tone === 2
          ? "Second nudge. Direct and courteous: ask when to expect payment, invite questions about the invoice."
          : "Last nudge. Calm and human: say it is still unpaid and offer to work out a plan if something is in the way."
      : f.tone === 1
        ? "First check-in. Make sure they received it, offer to answer questions or change anything."
        : f.tone === 2
          ? "Second check-in. Ask whether they would like to go ahead or want something changed."
          : "Last check-in. No pressure: ask whether to keep the quote open or close it out.";

  const lines = [
    `Business: ${f.companyName}`,
    `Sender's first name: ${f.senderFirstName || "(not known, sign with the business name)"}`,
    `Client's first name: ${f.clientFirstName}`,
    `${f.kind === "invoice" ? "Invoice" : "Quote"} #${f.number}${safeTitle(f.title) ? `, for: ${safeTitle(f.title)}` : ""}`,
    f.kind === "invoice" ? `Still owed: ${usd(f.amount)}${f.amount < f.total - 0.005 ? ` of ${usd(f.total)}` : ""}` : `Quote total: ${usd(f.amount)} (you do not have to state it)`,
    ...(f.alsoOwed.length
      ? [`Also past due for this client: ${f.alsoOwed.map((o) => `#${o.number} (${usd(o.amount)})`).join(", ")}. Total owed: ${usd(f.amount + f.alsoOwed.reduce((s, o) => s + o.amount, 0))}. One message covers all of it.`]
      : []),
    ...(f.dueDateLabel ? [`Was due: ${f.dueDateLabel}`] : []),
    ...(f.validUntilLabel ? [`Quote is good through: ${f.validUntilLabel}`] : []),
    ...(f.followUpCount ? [`The owner has already followed up ${f.followUpCount === 1 ? "once" : `${f.followUpCount} times`} with no reply. Do not repeat "just checking in".`] : []),
    `Tone: ${toneLine}`,
  ];
  return { system, prompt: lines.join("\n") };
}

/** The model's reply → a draft, or null when it is not one. */
export function parseDraft(raw: string, channel: FollowUpChannel): Draft | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as { subject?: unknown; body?: unknown };
    if (typeof o.body !== "string" || !o.body.trim()) return null;
    const body = o.body.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const subject = channel === "email" && typeof o.subject === "string" ? o.subject.replace(/\s+/g, " ").trim() : null;
    return { subject, body };
  } catch {
    return null;
  }
}

/** Why a document is not on the list, in words a person can read. Only the reasons worth showing. */
export const SILENCE_LABEL: Partial<Record<Silence, string>> = {
  hold_note: "A note says to leave them be",
  client_waiting: "They are waiting on your reply",
  client_active: "They wrote or called this week",
  team_touched: "Someone reached out in the last few days",
  auto_reminder_recent: "An automatic reminder just went out",
  auto_reminders_coming: "Automatic reminders are still running",
  visit_soon: "You are seeing them this week",
  autopay_pending: "Their card will be tried again",
  paying: "They made a payment this week",
  enough: "Followed up three times with no reply",
  snoozed: "You said not now",
  dismissed: "You said not to follow up",
  no_channel: "No email or mobile number on file",
  cold: "Too old for a nudge",
  expired: "The quote has expired",
};

/** One model call: the reply, or why there is none (out of tokens, switched off, down). */
export type AskModel = (system: string, prompt: string) => Promise<{ ok: true; text: string } | { ok: false; note: string }>;

export type WrittenDraft = {
  draft: Draft;
  /** "atlas" = the model's, checked; "standard" = the built-in wording. */
  source: "atlas" | "standard";
  /** Why the standard wording was used, when it was. */
  note: string | null;
  /** What `checkDraft` said about each model draft, in order (empty list = it passed). */
  attempts: string[][];
};

/**
 * Write one message: ask the model, check the draft, ask once more saying
 * what was wrong, and fall back to the built-in wording. The same function
 * runs in production (lib/follow-ups-server.ts) and in the model scorecard
 * (scripts/eval-follow-ups/run.ts), so what is scored is what ships.
 */
export async function writeDraft(f: DraftFacts, ask: AskModel): Promise<WrittenDraft> {
  const { system, prompt } = followUpPrompt(f);
  const attempts: string[][] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const last = attempts[attempts.length - 1];
    const res = await ask(system, last ? `${prompt}\n\nYour last draft was rejected because it ${last.join("; ")}. Write it again without that.` : prompt);
    if (!res.ok) return { draft: builtInDraft(f), source: "standard", note: res.note, attempts };
    const draft = parseDraft(res.text, f.channel);
    const problems = draft ? checkDraft(draft, f) : ["was not in the format asked for"];
    attempts.push(problems);
    if (draft && !problems.length) return { draft, source: "atlas", note: null, attempts };
  }
  return { draft: builtInDraft(f), source: "standard", note: "Two drafts did not pass the checks, so this is the standard wording.", attempts };
}
