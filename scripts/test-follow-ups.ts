/**
 * The follow-ups scorecard (lib/follow-ups.ts): simulated clients with an
 * open quote or an unpaid invoice, and what the worker must — and must NOT —
 * put in front of the owner. Most cases are traps: the right answer is
 * silence. Then the message itself: drafts that must be thrown away, drafts
 * that must be let through, and proof that the built-in wording passes its
 * own check for every case here.
 * Pure — no DB, no network, no model.
 * Run: npx tsx scripts/test-follow-ups.ts
 */
import assert from "node:assert";
import {
  builtInDraft,
  checkDraft,
  DRAFT_LIMITS,
  followUpPrompt,
  holdNoteIn,
  judgeFollowUp,
  parseDraft,
  pickFollowUps,
  safeTitle,
  type Draft,
  type DraftFacts,
  type FollowUpChannel,
  type FollowUpClient,
  type FollowUpSubject,
  type FollowUpTone,
  type Silence,
} from "../lib/follow-ups";

const NOW = new Date("2026-11-17T18:00:00Z");
const DAY = 86_400_000;
/** n days before now (negative = ahead). */
const d = (n: number) => new Date(NOW.getTime() - n * DAY);
/** A due date n days back, stored at noon like the app stores them. */
const due = (n: number) => {
  const x = d(n);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 12));
};

const client = (over: Partial<FollowUpClient> = {}): FollowUpClient => ({
  id: "c1",
  firstName: "Maria",
  lastName: "Lopez",
  archived: false,
  notACustomer: false,
  email: "maria@example.com",
  canText: true,
  ...over,
});

let seq = 0;
const quote = (over: Partial<FollowUpSubject> = {}): FollowUpSubject => ({
  kind: "quote",
  id: `q${++seq}`,
  number: 100 + seq,
  title: "Cedar fence",
  amount: 4200,
  total: 4200,
  open: true,
  sentAt: d(10),
  dueDate: null,
  validUntil: null,
  viewCount: 1,
  lastViewedAt: d(9),
  autoReminders: [d(7), d(3)],
  autoRemindersPending: false,
  autoPayPending: false,
  lastPaymentAt: null,
  newerQuote: false,
  upcomingVisitAt: null,
  holdNote: null,
  skip: null,
  client: client(),
  teamTouches: [],
  lastClientAt: null,
  ...over,
});
const invoice = (over: Partial<FollowUpSubject> = {}): FollowUpSubject => ({
  kind: "invoice",
  id: `i${++seq}`,
  number: 200 + seq,
  title: "Fence repair",
  amount: 850,
  total: 850,
  open: true,
  sentAt: d(36),
  dueDate: due(6),
  validUntil: null,
  viewCount: 0,
  lastViewedAt: null,
  autoReminders: [d(6), d(3)],
  autoRemindersPending: true,
  autoPayPending: false,
  lastPaymentAt: null,
  newerQuote: false,
  upcomingVisitAt: null,
  holdNote: null,
  skip: null,
  client: client(),
  teamTouches: [],
  lastClientAt: null,
  ...over,
});

type Expect =
  | { offer: true; trigger?: string; tone?: FollowUpTone; first?: FollowUpChannel; count?: number; says?: RegExp }
  | { offer: false; reason: Silence };
type Case = { name: string; subject: FollowUpSubject; expect: Expect };

const CASES: Case[] = [
  // ── Real: these must be offered ──────────────────────────────────────────
  { name: "quote, 10 days out, both automatic reminders done", subject: quote(), expect: { offer: true, trigger: "ripe", tone: 1, first: "email", count: 0 } },
  { name: "quote, 5 days out, client has no email so nothing automatic ever ran", subject: quote({ sentAt: d(5), autoReminders: [], client: client({ email: null }) }), expect: { offer: true, trigger: "ripe", first: "text", says: /No email on file/ } },
  { name: "quote opened four times, last yesterday, two days after sending", subject: quote({ sentAt: d(2), viewCount: 4, lastViewedAt: d(1), autoReminders: [], autoRemindersPending: true }), expect: { offer: true, trigger: "hot", tone: 1, says: /Opened 4 times/ } },
  { name: "quote runs out in three days", subject: quote({ sentAt: d(20), validUntil: d(-3), autoReminders: [d(17), d(13)] }), expect: { offer: true, trigger: "expiring", tone: 2, says: /expires in 3 days/ } },
  { name: "quote, one follow-up eight days ago, no reply", subject: quote({ sentAt: d(18), autoReminders: [d(15), d(11)], teamTouches: [d(8)] }), expect: { offer: true, tone: 2, count: 1, says: /followed up once/ } },
  { name: "quote, two follow-ups, no reply: the last one", subject: quote({ sentAt: d(30), autoReminders: [d(27), d(23)], teamTouches: [d(14), d(7)] }), expect: { offer: true, tone: 3, count: 2 } },
  { name: "quote: a 'sent it over' text the day it went out is not a follow-up", subject: quote({ teamTouches: [d(9.9)] }), expect: { offer: true, tone: 1, count: 0 } },
  { name: "quote: an old exchange that was answered and closed", subject: quote({ sentAt: d(14), autoReminders: [d(11), d(7)], lastClientAt: d(12), teamTouches: [d(11.9)] }), expect: { offer: true, tone: 1 } },
  { name: "quote: 'not now' ran out yesterday", subject: quote({ skip: { until: d(1) } }), expect: { offer: true } },
  { name: "invoice six days past due", subject: invoice(), expect: { offer: true, trigger: "past_due", tone: 1, first: "text", says: /6 days past due/ } },
  { name: "invoice past due, client cannot be texted", subject: invoice({ dueDate: due(9), client: client({ canText: false }) }), expect: { offer: true, first: "email" } },
  { name: "invoice 25 days past due: direct", subject: invoice({ dueDate: due(25), autoReminders: [d(25), d(22), d(18), d(11)], autoRemindersPending: false }), expect: { offer: true, tone: 2 } },
  { name: "invoice 50 days past due: the last one", subject: invoice({ sentAt: d(80), dueDate: due(50), autoReminders: [d(50), d(47), d(43), d(36)], autoRemindersPending: false }), expect: { offer: true, tone: 3 } },
  { name: "invoice half paid three weeks ago, the rest 12 days late", subject: invoice({ amount: 425, dueDate: due(12), lastPaymentAt: d(20), autoReminders: [d(12), d(9), d(5)] }), expect: { offer: true, says: /\$425 still owed of \$850/ } },
  { name: "invoice, one follow-up a week ago", subject: invoice({ dueDate: due(12), autoReminders: [d(12), d(9), d(5)], teamTouches: [d(7)] }), expect: { offer: true, tone: 2, count: 1 } },
  { name: "invoice past due, a visit three weeks away", subject: invoice({ dueDate: due(8), autoReminders: [d(8), d(5)], upcomingVisitAt: d(-20) }), expect: { offer: true } },
  { name: "a note about the gate is not a reason to hold back", subject: quote({ holdNote: holdNoteIn(["Gate code 1234, call before arriving. Prefers texts. Pays on time."]) }), expect: { offer: true } },

  // ── Traps: the right answer is silence ───────────────────────────────────
  { name: "TRAP quote sent two days ago, not opened", subject: quote({ sentAt: d(2), viewCount: 0, lastViewedAt: null, autoReminders: [], autoRemindersPending: true }), expect: { offer: false, reason: "too_soon" } },
  { name: "TRAP quote five days out, the day-7 reminder is still to come", subject: quote({ sentAt: d(5), autoReminders: [d(2)], autoRemindersPending: true }), expect: { offer: false, reason: "auto_reminder_recent" } },
  { name: "TRAP quote six days out, reminders still running", subject: quote({ sentAt: d(6.5), autoReminders: [d(3.5)], autoRemindersPending: true }), expect: { offer: false, reason: "auto_reminders_coming" } },
  { name: "TRAP quote: automatic reminder went out yesterday", subject: quote({ sentAt: d(8), autoReminders: [d(5), d(1)] }), expect: { offer: false, reason: "auto_reminder_recent" } },
  { name: "TRAP quote expired yesterday", subject: quote({ sentAt: d(31), validUntil: d(1) }), expect: { offer: false, reason: "expired" } },
  { name: "TRAP quote two months old", subject: quote({ sentAt: d(60), autoReminders: [d(57), d(53)] }), expect: { offer: false, reason: "cold" } },
  { name: "TRAP the client asked a question two days ago and nobody answered", subject: quote({ lastClientAt: d(2) }), expect: { offer: false, reason: "client_waiting" } },
  { name: "TRAP the client left a voicemail yesterday", subject: invoice({ lastClientAt: d(1) }), expect: { offer: false, reason: "client_waiting" } },
  { name: "TRAP hot quote, but they wrote this morning", subject: quote({ sentAt: d(2), viewCount: 5, lastViewedAt: d(0.2), autoReminders: [], autoRemindersPending: true, lastClientAt: d(0.2) }), expect: { offer: false, reason: "client_waiting" } },
  { name: "TRAP they wrote three days ago and the team answered: the conversation is live", subject: quote({ lastClientAt: d(3), teamTouches: [d(2.9)] }), expect: { offer: false, reason: "client_active" } },
  { name: "TRAP 'I will pay Friday', the team said thanks", subject: invoice({ dueDate: due(10), autoReminders: [d(10), d(7)], lastClientAt: d(5), teamTouches: [d(4.9)] }), expect: { offer: false, reason: "client_active" } },
  { name: "TRAP someone texted the client two days ago", subject: quote({ teamTouches: [d(2)] }), expect: { offer: false, reason: "team_touched" } },
  { name: "TRAP followed up five days ago: give it a week", subject: quote({ sentAt: d(18), autoReminders: [d(15), d(11)], teamTouches: [d(5)] }), expect: { offer: false, reason: "team_touched" } },
  { name: "TRAP quote running out, but the team called yesterday", subject: quote({ sentAt: d(20), validUntil: d(-2), autoReminders: [d(17), d(13)], teamTouches: [d(1)] }), expect: { offer: false, reason: "team_touched" } },
  { name: "TRAP three follow-ups and no reply: stop", subject: quote({ sentAt: d(40), autoReminders: [d(37), d(33)], teamTouches: [d(30), d(20), d(10)] }), expect: { offer: false, reason: "enough" } },
  { name: "TRAP note: do not call, she will reach out when insurance pays", subject: invoice({ holdNote: holdNoteIn(["Do not call - she will reach out when insurance pays"]) }), expect: { offer: false, reason: "hold_note" } },
  { name: "TRAP note: her husband passed away last month", subject: invoice({ dueDate: due(20), autoReminders: [d(20), d(17), d(13), d(6)], holdNote: holdNoteIn(["Easy client.", "Husband passed away last month, be kind"]) }), expect: { offer: false, reason: "hold_note" } },
  { name: "TRAP note: on a payment plan", subject: invoice({ holdNote: holdNoteIn(["On a payment plan, pays on the 1st of each month"]) }), expect: { offer: false, reason: "hold_note" } },
  { name: "TRAP note: waiting on the HOA", subject: quote({ holdNote: holdNoteIn(["waiting on HOA approval before they sign"]) }), expect: { offer: false, reason: "hold_note" } },
  { name: "TRAP a visit with them in three days", subject: quote({ upcomingVisitAt: d(-3) }), expect: { offer: false, reason: "visit_soon" } },
  { name: "TRAP invoice due today is not late", subject: invoice({ dueDate: due(0), autoReminders: [] }), expect: { offer: false, reason: "not_due" } },
  { name: "TRAP invoice three days past due", subject: invoice({ dueDate: due(3), autoReminders: [d(3)] }), expect: { offer: false, reason: "too_soon" } },
  { name: "TRAP the card on file will be tried again", subject: invoice({ autoPayPending: true }), expect: { offer: false, reason: "autopay_pending" } },
  { name: "TRAP they paid part of it two days ago", subject: invoice({ amount: 400, lastPaymentAt: d(2) }), expect: { offer: false, reason: "paying" } },
  { name: "TRAP two dollars left on the invoice", subject: invoice({ amount: 2 }), expect: { offer: false, reason: "nothing_owed" } },
  { name: "TRAP invoice 200 days past due", subject: invoice({ sentAt: d(230), dueDate: due(200), autoReminders: [d(200), d(197), d(193), d(186)], autoRemindersPending: false }), expect: { offer: false, reason: "cold" } },
  { name: "TRAP invoice: the 7-day reminder went out yesterday", subject: invoice({ dueDate: due(8), autoReminders: [d(8), d(5), d(1)] }), expect: { offer: false, reason: "auto_reminder_recent" } },
  { name: "TRAP archived client", subject: invoice({ client: client({ archived: true }) }), expect: { offer: false, reason: "archived" } },
  { name: "TRAP a supplier, not a customer", subject: quote({ client: client({ notACustomer: true }) }), expect: { offer: false, reason: "not_a_customer" } },
  { name: "TRAP the owner said never for this one", subject: quote({ skip: { until: null } }), expect: { offer: false, reason: "dismissed" } },
  { name: "TRAP the owner said not now, three more days", subject: invoice({ skip: { until: d(-3) } }), expect: { offer: false, reason: "snoozed" } },
  { name: "TRAP a newer quote replaced this one", subject: quote({ newerQuote: true }), expect: { offer: false, reason: "superseded" } },
  { name: "TRAP no email and no mobile number", subject: quote({ autoReminders: [], client: client({ email: null, canText: false }) }), expect: { offer: false, reason: "no_channel" } },
  { name: "TRAP a draft quote", subject: quote({ open: false }), expect: { offer: false, reason: "not_open" } },
  { name: "TRAP opened five times, but all on the first day", subject: quote({ sentAt: d(3.5), viewCount: 5, lastViewedAt: d(3), autoReminders: [], autoRemindersPending: true }), expect: { offer: false, reason: "too_soon" } },
  { name: "TRAP opened four times within a day of sending", subject: quote({ sentAt: d(1), viewCount: 4, lastViewedAt: d(0.5), autoReminders: [], autoRemindersPending: true }), expect: { offer: false, reason: "too_soon" } },
];

let right = 0;
let traps = 0;
let trapsRight = 0;
const misses: string[] = [];
for (const c of CASES) {
  const v = judgeFollowUp(c.subject, NOW);
  const isTrap = !c.expect.offer;
  if (isTrap) traps++;
  let problem = "";
  if (c.expect.offer) {
    if (!v.offer) problem = `expected an offer, got silence (${v.reason})`;
    else {
      const e = c.expect;
      if (e.trigger && v.trigger !== e.trigger) problem = `trigger ${v.trigger}, expected ${e.trigger}`;
      else if (e.tone && v.tone !== e.tone) problem = `tone ${v.tone}, expected ${e.tone}`;
      else if (e.first && v.channels[0] !== e.first) problem = `channel ${v.channels[0]}, expected ${e.first}`;
      else if (e.count != null && v.followUpCount !== e.count) problem = `counted ${v.followUpCount} follow-ups, expected ${e.count}`;
      else if (e.says && !e.says.test(v.why.join(" "))) problem = `why does not say ${e.says}: "${v.why.join(" ")}"`;
    }
  } else if (v.offer) problem = `offered (${v.trigger}), expected silence (${c.expect.reason})`;
  else if (v.reason !== c.expect.reason) problem = `silent for ${v.reason}, expected ${c.expect.reason}`;

  if (problem) misses.push(`✗ ${c.name}: ${problem}`);
  else {
    right++;
    if (isTrap) trapsRight++;
  }
}

// ── One message per client ───────────────────────────────────────────────────
{
  const who = client({ id: "c-two" });
  const big = invoice({ amount: 1200, total: 1200, dueDate: due(20), client: who });
  const small = invoice({ amount: 300, total: 300, dueDate: due(9), client: who });
  const q = quote({ client: who });
  const other = quote({ client: client({ id: "c-other", firstName: "Sam" }) });
  const waitingOn = quote({ client: client({ id: "c-wait", firstName: "Ana" }), lastClientAt: d(1) });
  const pick = pickFollowUps([small, q, big, other, waitingOn], NOW);
  assert.equal(pick.offers.length, 2, "two clients, two offers");
  const lead = pick.offers.find((o) => o.clientId === "c-two")!;
  assert.equal(lead.id, big.id, "the larger, older invoice leads");
  assert.deepEqual(lead.alsoOwed, [{ id: small.id, number: small.number, amount: 300 }], "the other invoice rides along");
  assert.ok(pick.silent.some((s) => s.id === q.id && s.reason === "one_at_a_time"), "their quote waits its turn");
  assert.equal(pick.offers[0].id, big.id, "money owed sorts above a quote");
  assert.deepEqual(pick.waiting, [{ clientId: "c-wait", subjects: [{ kind: "quote", id: waitingOn.id }] }], "an unanswered client is listed as waiting");

  const twoQuotes = pickFollowUps([quote({ client: who, amount: 900 }), quote({ client: who, amount: 5000 })], NOW);
  assert.equal(twoQuotes.offers.length, 1, "two quotes for one client: one message");
}

// ── Notes that mean "leave them be" ─────────────────────────────────────────
for (const note of [
  "DO NOT CONTACT per owner",
  "don't follow up, he said he'd think about it",
  "No more reminders please",
  "No calls please, works nights",
  "She will call us when the loan closes",
  "Client is going to get back to us after the holidays",
  "They'll let us know",
  "Set up a payment arrangement 11/3",
  "Will pay when the insurance check comes",
  "Waiting on the adjuster",
  "holding for financing",
  "Wife is in the hospital",
  "Disputing the charge with their bank",
  "Put it on hold until spring",
]) {
  assert.ok(holdNoteIn([note]), `should hold: "${note}"`);
}
for (const note of [
  "Gate code 1234, call before arriving",
  "Prefers texts",
  "Great client, pays on time",
  "Will call when on the way",
  "No contact info for the tenant yet",
  "Dog in the yard, do not let him out",
  "Battery died on the gate opener",
  "Check the back fence line too",
  "Referred by the HOA president",
]) {
  assert.equal(holdNoteIn([note]), null, `should not hold: "${note}"`);
}

// ── The message: what must be thrown away ───────────────────────────────────
const FACTS: DraftFacts = {
  kind: "invoice",
  channel: "text",
  tone: 1,
  clientFirstName: "Maria",
  senderFirstName: "Dave",
  companyName: "Lessly Fence",
  number: 214,
  title: "Fence repair",
  amount: 850,
  total: 850,
  alsoOwed: [],
  dueDateLabel: "November 11",
  validUntilLabel: null,
  daysPastDue: 6,
  followUpCount: 0,
  hasLink: true,
};
const QUOTE_FACTS: DraftFacts = { ...FACTS, kind: "quote", channel: "email", number: 108, title: "Cedar fence", amount: 4200, total: 4200, dueDateLabel: null, validUntilLabel: "November 30", daysPastDue: null };
const text = (body: string): Draft => ({ subject: null, body });
const email = (subject: string, body: string): Draft => ({ subject, body });

const BAD: { name: string; draft: Draft; facts?: DraftFacts; problem: RegExp }[] = [
  { name: "the wrong amount", draft: text("Hi Maria, this is Dave with Lessly Fence. Invoice #214 for $805 is still open. Thank you."), problem: /amount that is not on the invoice/ },
  { name: "an invented discount", draft: text("Hi Maria, this is Dave with Lessly Fence. If you pay invoice #214 this week I can give you a discount."), problem: /nobody approved/ },
  { name: "a percentage off", draft: text("Hi Maria, Dave with Lessly Fence here. Pay invoice #214 now and take 10% off."), problem: /percentage|nobody approved/ },
  { name: "a late fee", draft: text("Hi Maria, this is Dave with Lessly Fence. Invoice #214 is past due and a late fee will be added."), problem: /fee the invoice does not have/ },
  { name: "a threat", draft: text("Hi Maria, this is Dave with Lessly Fence. If invoice #214 is not paid we will send it to collections."), problem: /threatens/ },
  { name: "a conversation that never happened", draft: text("Hi Maria, as we discussed on the phone, invoice #214 for $850 is still open. Thanks, Dave"), problem: /conversation that is not on record/ },
  { name: "an invented deadline", draft: text("Hi Maria, this is Dave with Lessly Fence. Please pay invoice #214 by Friday. Thank you."), problem: /deadline|names a day/ },
  { name: "a made-up date", draft: text("Hi Maria, this is Dave with Lessly Fence. Invoice #214 was due October 30. Thank you."), problem: /date that is not on the document/ },
  { name: "a link", draft: text("Hi Maria, this is Dave with Lessly Fence. Pay invoice #214 here: https://pay.example.com/abc"), problem: /link/ },
  { name: "emoji", draft: text("Hi Maria 👋 this is Dave with Lessly Fence. Invoice #214 is still open. Thank you."), problem: /emoji/ },
  { name: "the wrong person", draft: text("Hi Mario, this is Dave with Lessly Fence. Invoice #214 is still open. Thank you."), problem: /wrong person/ },
  { name: "nobody's name", draft: text("Hello, this is Dave with Lessly Fence. Invoice #214 for $850 is still open. Thank you."), problem: /client's name/ },
  { name: "the wrong invoice number", draft: text("Hi Maria, this is Dave with Lessly Fence. Invoice #241 for $850 is still open. Thank you."), problem: /wrong invoice number/ },
  { name: "a blank left in", draft: text("Hi Maria, this is [Your Name] with Lessly Fence. Invoice #214 is still open. Thank you."), problem: /blank/ },
  { name: "says it is an AI", draft: text("Hi Maria, I am the AI assistant for Lessly Fence. Invoice #214 is still open. Thank you."), problem: /AI or automation/ },
  { name: "pressure", draft: text("Hi Maria, this is Dave with Lessly Fence. FINAL NOTICE: invoice #214 must be paid immediately."), problem: /pressures/ },
  { name: "shouting", draft: text("Hi Maria, this is Dave with Lessly Fence. Invoice #214 is STILL open. PLEASE pay it. Thank you."), problem: /capitals/ },
  { name: "three exclamation marks", draft: text("Hi Maria! This is Dave with Lessly Fence! Invoice #214 is still open! Thank you."), problem: /exclamation/ },
  { name: "guilt", draft: text("Hi Maria, this is Dave with Lessly Fence. We have been patient about invoice #214 but as a small business this hurts."), problem: /guilt/ },
  { name: "a text the length of a letter", draft: text(`Hi Maria, this is Dave with Lessly Fence. ${"I wanted to reach out about invoice #214 and see how things are going. ".repeat(6)}`), problem: /too long/ },
  { name: "a text with a subject", draft: email("Invoice", "Hi Maria, this is Dave with Lessly Fence. Invoice #214 is still open. Thank you."), problem: /no subject/ },
  { name: "calls the invoice a quote", draft: text("Hi Maria, this is Dave with Lessly Fence. Checking in on the quote and the balance of $850. Thank you."), problem: /calls the invoice a quote/ },
  { name: "does not say what it is about", draft: text("Hi Maria, this is Dave with Lessly Fence. Just checking in to see how you are doing. Thank you."), problem: /does not say it is about/ },
  { name: "email with no subject", facts: QUOTE_FACTS, draft: email("", "Hi Maria,\n\nFollowing up on the quote for the cedar fence.\n\nDave\nLessly Fence"), problem: /needs a subject/ },
  { name: "a subject dressed as a reply", facts: QUOTE_FACTS, draft: email("Re: your quote", "Hi Maria,\n\nFollowing up on the quote for the cedar fence.\n\nDave\nLessly Fence"), problem: /pretends to be a reply/ },
  { name: "a quote email with a price cut", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nFollowing up on the quote. I can do it for $3,900 if you sign this week.\n\nDave\nLessly Fence"), problem: /amount that is not on the quote/ },
  { name: "a quote email with an invented expiry", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nYour quote is good through November 20.\n\nDave\nLessly Fence"), problem: /date that is not on the document/ },
  { name: "scarcity", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nFollowing up on the quote. Spots are filling fast for December.\n\nDave\nLessly Fence"), problem: /pressures/ },
  { name: "too short", draft: text("Hi Maria, invoice?"), problem: /too short/ },
  // From the model scorecard, 2026-11-17 (scripts/eval-follow-ups/run.ts): every real miss becomes a case
  { name: "the work we talked about", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nFollowing up on the quote for the work we talked about. It is good through November 30.\n\nDave\nLessly Fence"), problem: /conversation that is not on record/ },
  { name: "a place on the schedule", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nFollowing up on the quote. Reply and we will get your job on the schedule.\n\nDave\nLessly Fence"), problem: /place on the schedule/ },
  { name: "a spot", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nFollowing up on the quote. Say the word and I will get your spot set up.\n\nDave\nLessly Fence"), problem: /place on the schedule/ },
  { name: "never again", facts: QUOTE_FACTS, draft: email("Your quote", "Hi Maria,\n\nOne last note on the quote. If it is a no, tell me and I won't reach out about it again.\n\nDave\nLessly Fence"), problem: /never to contact them again/ },
  { name: "how payment works", facts: { ...FACTS, alsoOwed: [{ number: 198, amount: 300 }] }, draft: text("Hi Maria, this is Dave with Lessly Fence. Invoices #214 and #198 are past due. You can settle both in one payment."), problem: /how payment works/ },
];
let badRight = 0;
for (const b of BAD) {
  const problems = checkDraft(b.draft, b.facts ?? FACTS);
  if (problems.some((p) => b.problem.test(p))) badRight++;
  else misses.push(`✗ bad draft let through (${b.name}): got [${problems.join("; ")}]`);
}

// ── The message: what must be let through ───────────────────────────────────
const GOOD: { name: string; draft: Draft; facts?: DraftFacts }[] = [
  { name: "a plain invoice text", draft: text("Hi Maria, this is Dave with Lessly Fence. A quick note that invoice #214 for $850 is still open. The invoice is below. Thank you.") },
  { name: "the amount with cents", draft: text("Hi Maria, it's Dave at Lessly Fence. Invoice #214 ($850.00) may have slipped by. Feel free to reply with any questions.") },
  { name: "the due date that is on the invoice", draft: text("Hi Maria, Dave with Lessly Fence here. Invoice #214 was due November 11 and the balance is still open. Thanks.") },
  { name: "still interested", facts: QUOTE_FACTS, draft: email("Your cedar fence quote", "Hi Maria,\n\nI wanted to see if you are still interested in the cedar fence. The quote is good through November 30. Feel free to reply with questions.\n\nDave\nLessly Fence") },
  { name: "names that look like forbidden words", facts: { ...FACTS, clientFirstName: "Court", senderFirstName: "Bill", companyName: "Atlas Roofing" }, draft: text("Hi Court, this is Bill with Atlas Roofing. A quick note that invoice #214 for $850 is still open. Thank you.") },
  { name: "two invoices and their sum", facts: { ...FACTS, alsoOwed: [{ number: 198, amount: 300 }] }, draft: text("Hi Maria, this is Dave with Lessly Fence. Invoices #214 and #198 are still open, $1,150 in all. Can you let me know when to expect payment?") },
  { name: "a capitalized business name", facts: { ...FACTS, companyName: "ACME HVAC" }, draft: text("Hi Maria, this is Dave with ACME HVAC. A quick note that invoice #214 for $850 is still open. Thank you.") },
];
let goodRight = 0;
for (const g of GOOD) {
  const problems = checkDraft(g.draft, g.facts ?? FACTS);
  if (!problems.length) goodRight++;
  else misses.push(`✗ good draft thrown away (${g.name}): ${problems.join("; ")}`);
}

// ── The built-in wording passes its own check, for everyone ─────────────────
let builtIn = 0;
const people: Pick<DraftFacts, "clientFirstName" | "senderFirstName" | "companyName" | "title">[] = [
  { clientFirstName: "Maria", senderFirstName: "Dave", companyName: "Lessly Fence", title: "Cedar fence" },
  { clientFirstName: "MARIA", senderFirstName: "", companyName: "ACME HVAC LLC", title: "FENCE - 50% dep" },
  { clientFirstName: "Court", senderFirstName: "Bill", companyName: "Atlas Roofing & Free Estimates", title: "Option B $4,200 (by Friday)" },
  { clientFirstName: "Jean-Luc", senderFirstName: "Christopher", companyName: "Steadfast Fence and Deck Company of North Texas", title: null },
  { clientFirstName: "", senderFirstName: "Dee", companyName: "O'Brien's", title: "Invoice for March work" },
];
for (const who of people) {
  for (const kind of ["invoice", "quote"] as const) {
    for (const channel of ["text", "email"] as const) {
      for (const tone of [1, 2, 3] as const) {
        for (const alsoOwed of kind === "invoice" ? [[], [{ number: 198, amount: 300.5 }], [{ number: 198, amount: 300.5 }, { number: 77, amount: 12000 }]] : [[]]) {
          for (const hasLink of [true, false]) {
            const f: DraftFacts = {
              ...FACTS, ...who, kind, channel, tone, alsoOwed, hasLink,
              number: kind === "invoice" ? 214 : 108,
              amount: kind === "invoice" ? 425.25 : 4200,
              total: kind === "invoice" ? 850.5 : 4200,
              dueDateLabel: kind === "invoice" ? "November 11" : null,
              validUntilLabel: kind === "quote" ? "November 30" : null,
            };
            const draft = builtInDraft(f);
            const problems = checkDraft(draft, f);
            assert.deepEqual(problems, [], `built-in ${kind}/${channel}/tone ${tone} for ${who.clientFirstName || "(no name)"}: ${problems.join("; ")}\n---\n${draft.subject ?? ""}\n${draft.body}`);
            builtIn++;
          }
        }
      }
    }
  }
}
assert.ok(builtInDraft({ ...FACTS, companyName: "Steadfast Fence and Deck Company of North Texas", senderFirstName: "Christopher", tone: 2, alsoOwed: [{ number: 1, amount: 1 }, { number: 2, amount: 2 }] }).body.length <= DRAFT_LIMITS.textMax);

// ── Titles that may and may not appear in a message ─────────────────────────
assert.equal(safeTitle("Cedar fence"), "Cedar fence");
assert.equal(safeTitle("  Backyard   deck  "), "Backyard deck");
for (const t of ["FENCE - 50% dep", "Option B $4,200", "Job #12", "Free estimate", "Friday install", "Quote for deck", "", null, "x".repeat(61)]) {
  assert.equal(safeTitle(t), null, `title should stay out: ${t}`);
}

// ── The prompt and the reply ─────────────────────────────────────────────────
{
  const p = followUpPrompt({ ...QUOTE_FACTS, title: "Option B $4,200 (by Friday)" });
  assert.ok(!p.prompt.includes("Friday"), "an unsafe title never reaches the model");
  assert.ok(p.prompt.includes("November 30") && p.system.includes("JSON"));
  assert.ok(followUpPrompt({ ...FACTS, hasLink: false }).system.includes("There is no link"));
  assert.deepEqual(parseDraft('```json\n{"subject":"Your  quote","body":"Hi Maria,\\r\\n\\r\\n\\r\\nHello  \\nthere"}\n```', "email"), { subject: "Your quote", body: "Hi Maria,\n\nHello\nthere" });
  assert.deepEqual(parseDraft('{"subject":"x","body":"Hi"}', "text"), { subject: null, body: "Hi" });
  assert.equal(parseDraft("Sure! Here is a message.", "text"), null);
  assert.equal(parseDraft('{"body": ""}', "text"), null);
}

const total = CASES.length;
console.log(`Follow-ups scorecard: ${right} of ${total} right, silent on ${trapsRight} of ${traps} traps.`);
console.log(`Drafts: ${badRight} of ${BAD.length} bad drafts thrown away, ${goodRight} of ${GOOD.length} good drafts let through, ${builtIn} built-in messages pass their own check.`);
if (misses.length) {
  console.error(misses.join("\n"));
  process.exit(1);
}
console.log("✓ follow-ups");
