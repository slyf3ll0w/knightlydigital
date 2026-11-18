// npx tsx scripts/test-ads-conversions.ts
// Paid jobs reported back to Google Ads: which payments go in the file
// Google fetches, and what the file looks like (lib/ads-conversions.ts).
import assert from "node:assert/strict";
import {
  ADS_ADVISOR_PROMPT,
  ADS_CONVERSION_NAME,
  ADS_FIELD_MAP,
  ADS_SAMPLE_GCLID,
  sampleRowActive,
  ADS_CSV_HEADERS,
  adsConversionsCsv,
  adsFeedUrl,
  buildAdsConversions,
  cleanGclid,
  clickTime,
  conversionTime,
  hasGoogleAdClick,
  type AdsPayment,
} from "../lib/ads-conversions";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}

const DAY = 86400000;
const now = new Date("2026-11-18T18:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const GCLID = "Cj0KCQiA_test-Click123";

function pay(over: Partial<AdsPayment> = {}): AdsPayment {
  return {
    id: "p1",
    amount: 500,
    paidAt: ago(2),
    contactId: "c1",
    contactCreatedAt: ago(10),
    arrival: { gclid: GCLID, at: ago(10).getTime() - 60000 },
    ...over,
  };
}

console.log("click ids");
t("a Google click id passes as sent", () => {
  assert.equal(cleanGclid(GCLID), GCLID);
  assert.equal(cleanGclid(`  ${GCLID} `), GCLID);
});
t("anything that could break a row or start a formula is refused", () => {
  assert.equal(cleanGclid("=HYPERLINK(1)"), "");
  assert.equal(cleanGclid("abc,def,ghi,jkl"), "");
  assert.equal(cleanGclid('abcdefghij"\nx'), "");
  assert.equal(cleanGclid("short"), "");
  assert.equal(cleanGclid(42), "");
  assert.equal(cleanGclid("a".repeat(301)), "");
});
t("an ad click is a gclid, gbraid or wbraid", () => {
  assert.equal(hasGoogleAdClick({ gclid: GCLID }), true);
  assert.equal(hasGoogleAdClick({ gbraid: "x" }), true);
  assert.equal(hasGoogleAdClick({ wbraid: "x" }), true);
  assert.equal(hasGoogleAdClick({ utmSource: "google", utmMedium: "cpc" }), false);
  assert.equal(hasGoogleAdClick({ fbclid: "x" }), false);
  assert.equal(hasGoogleAdClick(null), false);
  assert.equal(hasGoogleAdClick("gclid"), false);
  assert.equal(hasGoogleAdClick([{ gclid: GCLID }]), false);
});

console.log("click time");
t("the arrival's own time when it has one", () => {
  const created = ago(10);
  assert.equal(clickTime({ at: created.getTime() - 5 * DAY }, created).getTime(), created.getTime() - 5 * DAY);
});
t("else when the lead was saved", () => {
  assert.equal(clickTime({}, ago(10)).getTime(), ago(10).getTime());
  assert.equal(clickTime(null, ago(10)).getTime(), ago(10).getTime());
});
t("a browser clock ahead of the lead is not believed", () => {
  assert.equal(clickTime({ at: now.getTime() + DAY }, ago(10)).getTime(), ago(10).getTime());
});

console.log("which payments are reported");
t("a payment from a Google Ads lead is one row", () => {
  const s = buildAdsConversions([pay()], now);
  assert.equal(s.rows.length, 1);
  assert.deepEqual(s.rows[0], { paymentId: "p1", contactId: "c1", gclid: GCLID, time: conversionTime(ago(2)), value: 500 });
  assert.equal(s.value, 500);
  assert.equal(s.clients, 1);
});
t("a deposit and the balance are two rows, one client", () => {
  const s = buildAdsConversions([pay({ id: "p2", amount: 900.5, paidAt: ago(1) }), pay({ id: "p1", amount: 300 })], now);
  assert.deepEqual(s.rows.map((r) => r.paymentId), ["p1", "p2"]);
  assert.equal(s.value, 1200.5);
  assert.equal(s.clients, 1);
});
t("TRAP: a lead with no ad click is never reported", () => {
  for (const arrival of [null, {}, { utmSource: "google", utmMedium: "cpc" }, { fbclid: "abcdefghijkl" }, { msclkid: "abcdefghijkl" }, { referrer: "https://www.google.com/" }]) {
    assert.equal(buildAdsConversions([pay({ arrival })], now).rows.length, 0);
  }
});
t("TRAP: money that came back is not reported", () => {
  assert.equal(buildAdsConversions([pay({ amount: 0 })], now).rows.length, 0);
  assert.equal(buildAdsConversions([pay({ amount: -20 })], now).rows.length, 0);
  assert.equal(buildAdsConversions([pay({ amount: NaN })], now).rows.length, 0);
});
t("TRAP: a click older than 90 days is left out and counted", () => {
  const s = buildAdsConversions([pay({ contactCreatedAt: ago(95), arrival: { gclid: GCLID, at: ago(95).getTime() } })], now);
  assert.equal(s.rows.length, 0);
  assert.equal(s.tooLate, 1);
});
t("the 90 days run from the click, not from when the lead was saved", () => {
  // clicked 91 days ago, filled the form 80 days ago
  const s = buildAdsConversions([pay({ contactCreatedAt: ago(80), arrival: { gclid: GCLID, at: ago(91).getTime() } })], now);
  assert.equal(s.rows.length, 0);
  assert.equal(s.tooLate, 1);
  const ok = buildAdsConversions([pay({ contactCreatedAt: ago(80), arrival: { gclid: GCLID, at: ago(89).getTime() } })], now);
  assert.equal(ok.rows.length, 1);
});
t("TRAP: a payment dated before the click, or in the future, is not reported", () => {
  assert.equal(buildAdsConversions([pay({ paidAt: ago(30) })], now).rows.length, 0);
  assert.equal(buildAdsConversions([pay({ paidAt: new Date(now.getTime() + DAY) })], now).rows.length, 0);
});
t("TRAP: a click with only gbraid / wbraid, or a mangled id, is left out and counted", () => {
  const s = buildAdsConversions([pay({ arrival: { gbraid: "abcdefghijkl" } }), pay({ id: "p2", arrival: { gclid: "=cmd|x,y" } })], now);
  assert.equal(s.rows.length, 0);
  assert.equal(s.noClickId, 2);
});
t("two payments for one click in the same second fold into one row", () => {
  const s = buildAdsConversions([pay({ id: "p1", amount: 100 }), pay({ id: "p2", amount: 50.25 })], now);
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].value, 150.25);
});
t("two clients are counted apart", () => {
  const s = buildAdsConversions([pay(), pay({ id: "p2", contactId: "c2", arrival: { gclid: "OtherClickId_12345" } })], now);
  assert.equal(s.clients, 2);
  assert.equal(s.rows.length, 2);
});

console.log("the file");
t("time is UTC with its offset", () => {
  assert.equal(conversionTime(new Date("2026-03-04T05:06:07.890Z")), "2026-03-04T05:06:07Z");
});
t("header row first, one line per payment, CRLF", () => {
  const s = buildAdsConversions([pay()], now);
  const csv = adsConversionsCsv(s.rows);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "gclid,conversion_name,conversion_time,conversion_value,currency");
  assert.equal(lines[1], `${GCLID},${ADS_CONVERSION_NAME},${conversionTime(ago(2))},500.00,USD`);
  assert.equal(lines[2], "");
  assert.equal(lines.length, 3);
});
t("nothing to report is still a valid file", () => {
  assert.equal(adsConversionsCsv([]), ADS_CSV_HEADERS.join(",") + "\r\n");
});
t("the sample row: only when asked, never beside real rows", () => {
  const at = new Date("2026-11-18T18:00:00Z");
  const lines = adsConversionsCsv([], { sampleAt: at }).split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], `${ADS_SAMPLE_GCLID},${ADS_CONVERSION_NAME},2026-11-18T18:00:00Z,1.00,USD`);
  const real = buildAdsConversions([pay()], now);
  assert.ok(!adsConversionsCsv(real.rows, { sampleAt: at }).includes(ADS_SAMPLE_GCLID));
  assert.equal(adsConversionsCsv([], { sampleAt: null }), ADS_CSV_HEADERS.join(",") + "\r\n");
});
t("the sample row is on only while asked for, unexpired, and there is nothing real", () => {
  const later = new Date(now.getTime() + 3600000);
  assert.equal(sampleRowActive(later, 0, now), true);
  assert.equal(sampleRowActive(later, 1, now), false);
  assert.equal(sampleRowActive(new Date(now.getTime() - 1), 0, now), false);
  assert.equal(sampleRowActive(null, 0, now), false);
});
t("TRAP: the sample click ID can never be mistaken for a real payment's", () => {
  // a lead whose saved click id IS the sample string is still reported as a real row (it passes the alphabet rule); the sample is only ever written by the file itself
  assert.match(ADS_SAMPLE_GCLID, /^[A-Za-z0-9_-]{10,300}$/);
});
t("every column of the file is in the field map, once", () => {
  assert.deepEqual([...ADS_FIELD_MAP.map((m) => m.column)].sort(), [...ADS_CSV_HEADERS].sort());
});
t("headers are plain lower-case names with no spaces, and the name has no comma", () => {
  for (const h of ADS_CSV_HEADERS) assert.match(h, /^[a-z][a-z_]*$/);
  assert.ok(!ADS_CONVERSION_NAME.includes(","));
});
t("the Advisor message names the action exactly and fits Advisor's 2,000 characters", () => {
  assert.ok(ADS_ADVISOR_PROMPT.includes(`Name: ${ADS_CONVERSION_NAME}`));
  assert.ok(ADS_ADVISOR_PROMPT.length < 2000);
  // it asks for nothing that touches spend
  assert.ok(ADS_ADVISOR_PROMPT.includes("Do not change my campaigns, budgets, bidding"));
  // no file address or password in it: Advisor can't connect the file, and the address is private
  assert.ok(!/https?:\/\//.test(ADS_ADVISOR_PROMPT));
});
t("the address ends in .csv", () => {
  assert.equal(adsFeedUrl("https://workbenchfsm.com/", "tok"), "https://workbenchfsm.com/api/public/ads-conversions/tok/conversions.csv");
});

console.log(`\n${n} checks passed`);
