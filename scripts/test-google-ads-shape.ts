// npx tsx scripts/test-google-ads-shape.ts
// Connect Google Ads: what WorkBench sends to Google and how it reads the
// answers (lib/google-ads-shape.ts). No network.
import assert from "node:assert/strict";
import {
  CONVERSION_ACTION_QUERY,
  INGEST_BATCH,
  createConversionActionBody,
  customerIdDigits,
  googleErrorText,
  ingestBodies,
  mergeAccounts,
  needsReconnect,
  parseAccessibleCustomers,
  parseClientAccounts,
  parseConversionAction,
  parseCreatedActionId,
  prettyCustomerId,
} from "../lib/google-ads-shape";
import { ADS_CONVERSION_NAME, type AdsConversionRow } from "../lib/ads-conversions";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}

console.log("customer ids");
t("dashes and the resource prefix come off", () => {
  assert.equal(customerIdDigits("942-234-9282"), "9422349282");
  assert.equal(customerIdDigits("customers/9422349282"), "9422349282");
  assert.equal(customerIdDigits(9422349282), "9422349282");
});
t("TRAP: anything that is not a plain id is refused (it goes into a URL)", () => {
  for (const bad of ["", "abc", "123/../456", "12 34", "1234567890123", null, undefined, {}, "customers/12/x"]) assert.equal(customerIdDigits(bad), "");
});
t("printed the way Google Ads prints it", () => {
  assert.equal(prettyCustomerId("9422349282"), "942-234-9282");
});

console.log("accounts");
t("reachable accounts are read from resource names, once each", () => {
  assert.deepEqual(parseAccessibleCustomers({ resourceNames: ["customers/111111", "customers/222222", "customers/111111", "junk"] }), ["111111", "222222"]);
  assert.deepEqual(parseAccessibleCustomers({}), []);
  assert.deepEqual(parseAccessibleCustomers(null), []);
});
t("client accounts: managers dropped, a missing name falls back to the id", () => {
  const rows = {
    results: [
      { customerClient: { id: "9422349282", descriptiveName: "Steadfast", manager: false } },
      { customerClient: { id: "5555555555", manager: true, descriptiveName: "Agency" } },
      { customerClient: { id: "1112223333", descriptiveName: "  " } },
      { customerClient: { id: "nope" } },
      {},
    ],
  };
  assert.deepEqual(parseClientAccounts(rows, "5555555555"), [
    { customerId: "9422349282", name: "Steadfast", loginCustomerId: "5555555555" },
    { customerId: "1112223333", name: "111-222-3333", loginCustomerId: "5555555555" },
  ]);
});
t("an account reachable directly and through a manager is kept once, directly", () => {
  const via = { customerId: "1", name: "A", loginCustomerId: "9" };
  const direct = { customerId: "1", name: "A", loginCustomerId: "1" };
  assert.deepEqual(mergeAccounts([[via], [direct]]), [direct]);
  assert.deepEqual(mergeAccounts([[direct], [via]]), [direct]);
  assert.deepEqual(mergeAccounts([[{ customerId: "2", name: "B", loginCustomerId: "9" }], [via]]).map((a) => a.customerId), ["1", "2"]);
});

console.log("the conversion action");
t("the lookup asks for our exact name", () => {
  assert.ok(CONVERSION_ACTION_QUERY.includes(`conversion_action.name = '${ADS_CONVERSION_NAME}'`));
  assert.ok(!ADS_CONVERSION_NAME.includes("'"));
});
t("an enabled click-import action is used as is (the one Google's Advisor made counts)", () => {
  assert.deepEqual(parseConversionAction({ results: [{ conversionAction: { id: "987", type: "UPLOAD_CLICKS", status: "ENABLED" } }] }), { id: "987", usable: true });
});
t("none there → null, so one gets made", () => {
  assert.equal(parseConversionAction({ results: [] }), null);
  assert.equal(parseConversionAction({}), null);
});
t("TRAP: the wrong kind, or one turned off, is never sent to and never duplicated", () => {
  const wrong = parseConversionAction({ results: [{ conversionAction: { id: "1", type: "WEBPAGE", status: "ENABLED" } }] });
  assert.equal(wrong?.usable, false);
  const off = parseConversionAction({ results: [{ conversionAction: { id: "2", type: "UPLOAD_CLICKS", status: "REMOVED" } }] });
  assert.equal(off?.usable, false);
  // a usable one beside an unusable one wins
  const both = parseConversionAction({ results: [{ conversionAction: { id: "2", type: "UPLOAD_CLICKS", status: "REMOVED" } }, { conversionAction: { id: "3", type: "UPLOAD_CLICKS", status: "ENABLED" } }] });
  assert.deepEqual(both, { id: "3", usable: true });
});
t("a new one is a click import, counted every time, valued by what was paid", () => {
  const c = createConversionActionBody().operations[0].create;
  assert.equal(c.name, ADS_CONVERSION_NAME);
  assert.equal(c.type, "UPLOAD_CLICKS");
  assert.equal(c.countingType, "MANY_PER_CLICK");
  assert.equal(c.valueSettings.alwaysUseDefaultValue, false);
});
t("the new action's id is read from its resource name", () => {
  assert.equal(parseCreatedActionId({ results: [{ resourceName: "customers/9422349282/conversionActions/7711" }] }), "7711");
  assert.equal(parseCreatedActionId({ results: [] }), "");
  assert.equal(parseCreatedActionId({ results: [{ resourceName: "customers/1/campaigns/2" }] }), "");
});

console.log("sending payments");
const row = (i: number): AdsConversionRow => ({ paymentId: `p${i}`, contactId: "c1", gclid: `Click_${String(i).padStart(8, "0")}`, time: "2026-11-18T14:03:22Z", value: 100 + i });
const target = { customerId: "9422349282", loginCustomerId: "5555555555", conversionActionId: "7711" };
t("one payment is one event against the right account and action", () => {
  const [body] = ingestBodies([row(1)], target) as { destinations: unknown[]; events: unknown[]; validateOnly?: boolean }[];
  assert.deepEqual(body.destinations, [
    { operatingAccount: { accountType: "GOOGLE_ADS", accountId: "9422349282" }, loginAccount: { accountType: "GOOGLE_ADS", accountId: "5555555555" }, productDestinationId: "7711" },
  ]);
  assert.deepEqual(body.events, [{ adIdentifiers: { gclid: "Click_00000001" }, eventTimestamp: "2026-11-18T14:03:22Z", eventSource: "WEB", transactionId: "p1", conversionValue: 101, currency: "USD" }]);
  assert.equal(body.validateOnly, undefined);
});
t("the payment's own id rides along, so a resend is dropped by Google", () => {
  const [a] = ingestBodies([row(1)], target) as { events: { transactionId: string }[] }[];
  const [b] = ingestBodies([row(1)], target) as { events: { transactionId: string }[] }[];
  assert.equal(a.events[0].transactionId, b.events[0].transactionId);
});
t("no login account saved → the account itself", () => {
  const [body] = ingestBodies([row(1)], { ...target, loginCustomerId: "" }) as { destinations: { loginAccount: { accountId: string } }[] }[];
  assert.equal(body.destinations[0].loginAccount.accountId, "9422349282");
});
t("more than Google's cap is split, nothing lost", () => {
  const rows = Array.from({ length: INGEST_BATCH + 5 }, (_, i) => row(i));
  const bodies = ingestBodies(rows, target) as { events: unknown[] }[];
  assert.deepEqual(bodies.map((b) => b.events.length), [INGEST_BATCH, 5]);
});
t("nothing to send is no request at all", () => {
  assert.deepEqual(ingestBodies([], target), []);
});
t("TRAP: no name, email, phone or address can be in a request", () => {
  const text = JSON.stringify(ingestBodies([row(1)], target));
  for (const word of ["userData", "email", "phone", "address", "firstName", "c1"]) assert.ok(!text.includes(word), word);
});

console.log("Google's errors");
t("the most specific message wins, in one line, capped", () => {
  assert.equal(googleErrorText({ error: { message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT", details: [{ errors: [{ message: "The conversion action is too new." }] }] } }, 400), "The conversion action is too new.");
  assert.equal(googleErrorText({ error: { message: "Bad\n  thing" } }, 400), "Bad thing");
  assert.equal(googleErrorText(null, 503), "Google answered 503");
  assert.ok(googleErrorText({ error: { message: "x".repeat(900) } }, 400).length <= 300);
});
t("a dead sign-in is told apart from an ordinary refusal", () => {
  assert.equal(needsReconnect(401, null), true);
  assert.equal(needsReconnect(403, { error: { status: "UNAUTHENTICATED" } }), true);
  assert.equal(needsReconnect(403, { error: { status: "PERMISSION_DENIED" } }), false);
  assert.equal(needsReconnect(400, { error: { status: "INVALID_ARGUMENT" } }), false);
});

console.log(`\n${n} checks passed`);
