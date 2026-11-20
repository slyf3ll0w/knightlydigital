// npx tsx scripts/test-meta-ads-shape.ts
// Facebook ads: which lead steps are reported to Facebook and what each
// request holds (lib/meta-ads-shape.ts). No network, no database.
import assert from "node:assert/strict";
import {
  META_BATCH,
  META_STEPS,
  buildMetaEvents,
  cleanCapiToken,
  cleanDatasetId,
  cleanFbclid,
  cleanFormLeadId,
  cleanTestCode,
  eventBodies,
  eventPayload,
  fbcFromArrival,
  hasFacebookClick,
  isTokenRefusal,
  metaErrorText,
  metaEventKey,
  testEvent,
  type MetaLeadInput,
} from "../lib/meta-ads-shape";
import { sanitizeArrival, withUserAgent } from "../lib/lead-source";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}

const NOW = new Date("2026-11-20T18:00:00Z");
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86400000 - hours * 3600000);
const FBCLID = "IwAR0aBcD_efGH-1234567890xYz";
const FORM_ID = "1234567890123456";

function lead(over: Partial<MetaLeadInput> = {}): MetaLeadInput {
  return {
    contactId: "c1",
    createdAt: ago(2),
    arrival: { fbclid: FBCLID, at: ago(2, 1).getTime(), landing: "https://acmefence.com/quote", ua: "Mozilla/5.0 (iPhone)" },
    ...over,
  };
}
const none = new Set<string>();

console.log("click ids and form lead ids");
t("a Facebook click id is kept exactly as it came, case included", () => {
  assert.equal(cleanFbclid(FBCLID), FBCLID);
  assert.equal(fbcFromArrival({ fbclid: FBCLID, at: 1763600000000 }, new Date(1763600005000)), `fb.1.1763600000000.${FBCLID}`);
});
t("TRAP: junk in the click id (spaces, quotes, script) is not a click id", () => {
  assert.equal(cleanFbclid("abc def ghi jkl"), "");
  assert.equal(cleanFbclid('"><script>'), "");
  assert.equal(cleanFbclid(""), "");
  assert.equal(cleanFbclid(12345678), "");
  assert.equal(hasFacebookClick({ fbclid: "x" }), false);
  assert.equal(hasFacebookClick({ gclid: "Cj0KCQiA_abcdefghij" }), false);
  assert.equal(hasFacebookClick({ fbclid: FBCLID }), true);
});
t("TRAP: an arrival time after the lead was made is not trusted; the lead's own time is used", () => {
  const created = new Date(1763600000000);
  assert.equal(fbcFromArrival({ fbclid: FBCLID, at: 1763699999999 }, created), `fb.1.1763600000000.${FBCLID}`);
  assert.equal(fbcFromArrival({ fbclid: FBCLID }, created), `fb.1.1763600000000.${FBCLID}`);
  assert.equal(fbcFromArrival({ gclid: "x" }, created), null);
});
t("a form lead id is 15 to 17 digits and nothing else", () => {
  assert.equal(cleanFormLeadId(FORM_ID), FORM_ID);
  assert.equal(cleanFormLeadId("12345678901234567"), "12345678901234567");
  assert.equal(cleanFormLeadId("12345"), "");
  assert.equal(cleanFormLeadId("12345678901234a6"), "");
  assert.equal(cleanFormLeadId(null), "");
});

console.log("what the owner pastes");
t("a dataset id is digits; spaces from a copy are forgiven", () => {
  assert.equal(cleanDatasetId(" 1234 5678 9012 3456 "), "1234567890123456");
  assert.equal(cleanDatasetId("act_123456789"), "");
  assert.equal(cleanDatasetId("123"), "");
});
t("an access token is one long run of token characters", () => {
  const token = "EAAB" + "x".repeat(180);
  assert.equal(cleanCapiToken(`  ${token}\n`), token);
  assert.equal(cleanCapiToken("short"), "");
  assert.equal(cleanCapiToken(`${token} extra words`), "");
});
t("a test code looks like TEST12345", () => {
  assert.equal(cleanTestCode(" TEST12345 "), "TEST12345");
  assert.equal(cleanTestCode("no spaces allowed"), "");
  assert.equal(cleanTestCode(""), "");
});

console.log("which steps go out");
t("a new Facebook lead is one step: the lead", () => {
  const r = buildMetaEvents([lead()], none, NOW);
  assert.equal(r.leads, 1);
  assert.deepEqual(r.events.map((e) => e.step), ["lead"]);
  assert.equal(r.events[0].match.kind, "click");
});
t("every step a lead reached is reported, oldest first, payments with their amount", () => {
  const r = buildMetaEvents(
    [lead({ appointmentAt: ago(1, 20), quoteSentAt: ago(1), wonAt: ago(0, 6), payments: [{ id: "p1", amount: 250.5, paidAt: ago(0, 2) }] })],
    none,
    NOW
  );
  assert.deepEqual(r.events.map((e) => e.step), ["lead", "appointment", "quote", "won", "paid"]);
  assert.equal(r.events[4].value, 250.5);
  assert.equal(r.events[4].refId, "p1");
  assert.equal(r.events[0].value, null);
});
t("TRAP: a lead with nothing Facebook can match on sends nothing", () => {
  const r = buildMetaEvents([lead({ arrival: { gclid: "Cj0KCQiA_abcdefghij", utmSource: "facebook" } }), lead({ contactId: "c2", arrival: null })], none, NOW);
  assert.equal(r.leads, 0);
  assert.equal(r.events.length, 0);
});
t("TRAP: a step already sent is never sent again; the others still go", () => {
  const input = [lead({ quoteSentAt: ago(1), payments: [{ id: "p1", amount: 100, paidAt: ago(0, 3) }, { id: "p2", amount: 50, paidAt: ago(0, 1) }] })];
  const sent = new Set([metaEventKey({ contactId: "c1", step: "lead", refId: "" }), metaEventKey({ contactId: "c1", step: "paid", refId: "p1" })]);
  const r = buildMetaEvents(input, sent, NOW);
  assert.deepEqual(r.events.map((e) => `${e.step}:${e.refId}`), ["quote:", "paid:p2"]);
});
t("TRAP: a step older than 7 days is dropped (Facebook refuses it), newer steps of the same lead still go", () => {
  const r = buildMetaEvents([lead({ createdAt: ago(20), arrival: { fbclid: FBCLID }, quoteSentAt: ago(8), wonAt: ago(6, 23) })], none, NOW);
  assert.deepEqual(r.events.map((e) => e.step), ["won"]);
});
t("TRAP: a step dated in the future, or before the lead existed, is dropped", () => {
  const r = buildMetaEvents(
    [lead({ appointmentAt: new Date(NOW.getTime() + 3600000), wonAt: ago(5), payments: [{ id: "p0", amount: 80, paidAt: ago(3) }] })],
    none,
    NOW
  );
  // the lead was made 2 days ago: a win 5 days ago and a payment 3 days ago are an earlier life of this client
  assert.deepEqual(r.events.map((e) => e.step), ["lead"]);
});
t("TRAP: a payment of zero or less (a returned transfer, a full refund) is not a paid step", () => {
  const r = buildMetaEvents([lead({ payments: [{ id: "p1", amount: 0, paidAt: ago(1) }, { id: "p2", amount: -40, paidAt: ago(1) }, { id: "p3", amount: Number.NaN, paidAt: ago(1) }] })], none, NOW);
  assert.deepEqual(r.events.map((e) => e.step), ["lead"]);
});
t("a lead from a Facebook form is matched by Facebook's lead id, even with a click id on file", () => {
  const r = buildMetaEvents([lead({ formLeadId: FORM_ID })], none, NOW);
  assert.deepEqual(r.events[0].match, { kind: "form", leadId: FORM_ID });
  const noArrival = buildMetaEvents([lead({ formLeadId: FORM_ID, arrival: null })], none, NOW);
  assert.equal(noArrival.events.length, 1);
});

console.log("what a request holds");
t("a website lead's step is a website event carrying the click id, the page and the browser", () => {
  const [e] = buildMetaEvents([lead()], none, NOW).events;
  const p = eventPayload(e) as Record<string, any>;
  assert.equal(p.event_name, "Lead");
  assert.equal(p.action_source, "website");
  assert.equal(p.event_time, Math.floor(ago(2).getTime() / 1000));
  assert.equal(p.event_source_url, "https://acmefence.com/quote");
  assert.deepEqual(p.user_data, { fbc: `fb.1.${ago(2, 1).getTime()}.${FBCLID}`, client_user_agent: "Mozilla/5.0 (iPhone)" });
  assert.equal(p.custom_data, undefined);
  assert.equal(p.event_id, "c1|lead|");
});
t("a form lead's step is Facebook's CRM shape with the lead id", () => {
  const [e] = buildMetaEvents([lead({ formLeadId: FORM_ID, wonAt: ago(0, 1) })], new Set(["c1|lead|"]), NOW).events;
  const p = eventPayload(e) as Record<string, any>;
  assert.equal(p.event_name, "JobWon");
  assert.equal(p.action_source, "system_generated");
  assert.deepEqual(p.user_data, { lead_id: FORM_ID });
  assert.deepEqual(p.custom_data, { event_source: "crm", lead_event_source: "WorkBench" });
  assert.equal(p.event_source_url, undefined);
});
t("a paid step carries the amount and the currency, on both shapes", () => {
  const pay = [{ id: "p1", amount: 1234.567, paidAt: ago(0, 1) }];
  const web = buildMetaEvents([lead({ payments: pay })], new Set(["c1|lead|"]), NOW).events[0];
  assert.deepEqual((eventPayload(web) as Record<string, any>).custom_data, { value: 1234.57, currency: "USD" });
  const form = buildMetaEvents([lead({ formLeadId: FORM_ID, payments: pay })], new Set(["c1|lead|"]), NOW).events[0];
  assert.deepEqual((eventPayload(form) as Record<string, any>).custom_data, { event_source: "crm", lead_event_source: "WorkBench", value: 1234.57, currency: "USD" });
  assert.equal((eventPayload(form) as Record<string, any>).event_name, "Purchase");
});
t("an older lead with no saved browser or page still makes a valid event", () => {
  const [e] = buildMetaEvents([lead({ arrival: { fbclid: FBCLID } })], none, NOW).events;
  const p = eventPayload(e) as Record<string, any>;
  assert.deepEqual(Object.keys(p.user_data), ["fbc"]);
  assert.equal("event_source_url" in p, false);
});
t("TRAP: no name, email, phone or address can be in a request", () => {
  const input = [
    lead({
      arrival: { fbclid: FBCLID, landing: "https://acmefence.com/quote", ua: "Mozilla/5.0", utmCampaign: "maria@example.com", referrer: "https://facebook.com/" },
      appointmentAt: ago(1),
      payments: [{ id: "p1", amount: 10, paidAt: ago(0, 1) }],
    }),
    lead({ contactId: "c2", formLeadId: FORM_ID }),
  ];
  const text = JSON.stringify(eventBodies(buildMetaEvents(input, none, NOW).events));
  for (const banned of ["maria", "@", "\"em\"", "\"ph\"", "\"fn\"", "\"ln\"", "\"ct\"", "\"zp\"", "external_id", "client_ip_address", "utm"]) {
    assert.equal(text.includes(banned), false, `found ${banned}`);
  }
});
t("TRAP: the page address sent never carries a query string (it can hold a visitor's details)", () => {
  const arrival = withUserAgent(sanitizeArrival({ fbclid: FBCLID, landing: "https://acmefence.com/quote?email=maria@example.com&fbclid=zzz" }), "Mozilla/5.0");
  const [e] = buildMetaEvents([lead({ arrival })], none, NOW).events;
  assert.equal((eventPayload(e) as Record<string, any>).event_source_url, "https://acmefence.com/quote");
});
t("the browser string comes from the server, never from what the browser posted", () => {
  assert.equal((sanitizeArrival({ fbclid: FBCLID, ua: "forged" }) as Record<string, unknown>).ua, undefined);
  assert.equal(withUserAgent({ fbclid: FBCLID }, "Mozilla/5.0\u0000  ")?.ua, "Mozilla/5.0");
  assert.equal(withUserAgent(null, "Mozilla/5.0"), null);
  assert.deepEqual(withUserAgent({ fbclid: FBCLID }, null), { fbclid: FBCLID });
});
t("events are cut into small requests, and a test code rides on each", () => {
  const many = Array.from({ length: META_BATCH + 5 }, (_, i) => lead({ contactId: `c${i}` }));
  const bodies = eventBodies(buildMetaEvents(many, none, NOW).events, { testCode: "TEST1" });
  assert.equal(bodies.length, 2);
  assert.equal((bodies[0].data as unknown[]).length, META_BATCH);
  assert.equal((bodies[1].data as unknown[]).length, 5);
  assert.equal(bodies[1].test_event_code, "TEST1");
  assert.equal("test_event_code" in eventBodies(buildMetaEvents(many, none, NOW).events)[0], false);
});
t("TRAP: the access token is never part of a body built here", () => {
  assert.equal(JSON.stringify(eventBodies([testEvent("https://workbenchfsm.com/book/acme", NOW)], { testCode: "TEST1" })).includes("access_token"), false);
});
t("the test event is a website lead matched to nobody", () => {
  const p = eventPayload(testEvent("https://workbenchfsm.com/book/acme", NOW)) as Record<string, any>;
  assert.equal(p.event_name, "Lead");
  assert.equal(p.event_source_url, "https://workbenchfsm.com/book/acme");
  assert.match(p.user_data.fbc, /^fb\.1\.\d+\.WorkBenchTestEvent$/);
});
t("every step has a name for Facebook and words for the page", () => {
  assert.deepEqual(META_STEPS.map((s) => s.step), ["lead", "appointment", "quote", "won", "paid"]);
  for (const s of META_STEPS) assert.ok(/^[A-Za-z]+$/.test(s.name) && s.label.length > 3);
});

console.log("Facebook's answers");
t("Facebook's own words are shown, on one line", () => {
  assert.equal(metaErrorText({ error: { message: "Invalid parameter", error_user_msg: "The lead ID\n is not valid." } }, 400), "The lead ID is not valid.");
  assert.equal(metaErrorText({ error: { message: "Unsupported post request." } }, 400), "Unsupported post request.");
  assert.equal(metaErrorText(null, 500), "Facebook answered 500.");
  assert.ok(metaErrorText({ error: { message: "x".repeat(900) } }, 400).length <= 300);
});
t("a dead token is told apart from a refused event", () => {
  assert.equal(isTokenRefusal({ error: { code: 190, type: "OAuthException" } }, 400), true);
  assert.equal(isTokenRefusal(null, 401), true);
  assert.equal(isTokenRefusal({ error: { code: 200, type: "OAuthException" } }, 403), true);
  assert.equal(isTokenRefusal({ error: { code: 100, type: "OAuthException" } }, 400), false);
  assert.equal(isTokenRefusal({ error: { code: 2200, type: "GraphMethodException" } }, 400), false);
});

console.log(`\n${n} checks passed`);
