// npx tsx scripts/test-lead-source.ts
// Lead sources: one spelling per source, how a visitor's arrival is named,
// and the report math (lib/lead-source.ts).
import assert from "node:assert/strict";
import {
  arrivalLines,
  buildSourceRows,
  canonicalLeadSource,
  leadSourceFor,
  pickerSources,
  sanitizeArrival,
  sourceFromArrival,
} from "../lib/lead-source";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}

console.log("canonicalLeadSource");
t("known names in any casing come back standard", () => {
  assert.equal(canonicalLeadSource("google ads"), "Google Ads");
  assert.equal(canonicalLeadSource("  REFERRAL "), "Referral");
  assert.equal(canonicalLeadSource("online booking"), "Online booking");
});
t("aliases merge", () => {
  assert.equal(canonicalLeadSource("AdWords"), "Google Ads");
  assert.equal(canonicalLeadSource("word of mouth"), "Referral");
  assert.equal(canonicalLeadSource("GMB"), "Google Business Profile");
  assert.equal(canonicalLeadSource("fb"), "Facebook");
});
t("anything else is kept as typed, trimmed", () => {
  assert.equal(canonicalLeadSource("  Home   show  2026 "), "Home show 2026");
  assert.equal(canonicalLeadSource("Website estimate · truck"), "Website estimate · truck");
  assert.equal(canonicalLeadSource("x".repeat(90))?.length, 60);
});
t("empty and non-strings are null", () => {
  assert.equal(canonicalLeadSource("   "), null);
  assert.equal(canonicalLeadSource(null), null);
  assert.equal(canonicalLeadSource(42), null);
});

console.log("sanitizeArrival");
t("keeps the known fields and drops the rest", () => {
  const a = sanitizeArrival({ utmSource: " google ", gclid: "abc", junk: "x", at: 1700000000000, embedded: true });
  assert.deepEqual(a, { utmSource: "google", gclid: "abc", at: 1700000000000, embedded: true });
});
t("urls lose their query and must be http(s)", () => {
  const a = sanitizeArrival({ referrer: "https://www.google.com/search?q=fence+repair+john+smith", landing: "javascript:alert(1)" });
  assert.deepEqual(a, { referrer: "https://www.google.com/search" });
});
t("nothing usable is null", () => {
  assert.equal(sanitizeArrival({}), null);
  assert.equal(sanitizeArrival("gclid=1"), null);
  assert.equal(sanitizeArrival([1]), null);
  assert.equal(sanitizeArrival({ gclid: 5, embedded: "yes" }), null);
});
t("long values are cut", () => {
  assert.equal(sanitizeArrival({ utmCampaign: "c".repeat(999) })?.utmCampaign?.length, 160);
});

console.log("sourceFromArrival");
t("an ad click id is Google Ads whatever else is there", () => {
  assert.equal(sourceFromArrival({ gclid: "x" }), "Google Ads");
  assert.equal(sourceFromArrival({ wbraid: "x", utmSource: "facebook" }), "Google Ads");
  assert.equal(sourceFromArrival({ msclkid: "x" }), "Microsoft Ads");
});
t("tags: paid vs unpaid", () => {
  assert.equal(sourceFromArrival({ utmSource: "google", utmMedium: "cpc" }), "Google Ads");
  assert.equal(sourceFromArrival({ utmSource: "google", utmMedium: "organic" }), "Google search");
  assert.equal(sourceFromArrival({ utmSource: "facebook", utmMedium: "paid_social" }), "Facebook Ads");
  assert.equal(sourceFromArrival({ utmSource: "Facebook", utmMedium: "social" }), "Facebook");
  assert.equal(sourceFromArrival({ utmSource: "ig", utmMedium: "paid" }), "Instagram Ads");
  assert.equal(sourceFromArrival({ utmSource: "bing", utmMedium: "cpc" }), "Microsoft Ads");
});
t("tags: Google Business Profile", () => {
  assert.equal(sourceFromArrival({ utmSource: "gbp" }), "Google Business Profile");
  assert.equal(sourceFromArrival({ utmSource: "google", utmMedium: "organic", utmCampaign: "gbp-listing" }), "Google Business Profile");
  assert.equal(sourceFromArrival({ utmSource: "google_my_business" }), "Google Business Profile");
});
t("tags: an unknown source keeps its own name", () => {
  assert.equal(sourceFromArrival({ utmSource: "home_advisor" }), "Home Advisor");
  assert.equal(sourceFromArrival({ utmSource: "nextdoor" }), "Nextdoor");
  assert.equal(sourceFromArrival({ utmSource: "mailchimp", utmMedium: "email" }), "Email");
});
t("the referring site, when there are no tags", () => {
  assert.equal(sourceFromArrival({ referrer: "https://www.google.com/" }), "Google search");
  assert.equal(sourceFromArrival({ referrer: "https://www.google.co.uk/" }), "Google search");
  assert.equal(sourceFromArrival({ referrer: "https://www.bing.com/search" }), "Bing search");
  assert.equal(sourceFromArrival({ referrer: "https://l.facebook.com/l.php" }), "Facebook");
  assert.equal(sourceFromArrival({ referrer: "https://nextdoor.com/p/abc" }), "Nextdoor");
  assert.equal(sourceFromArrival({ referrer: "https://someblog.example/post", embedded: true }), "Another website");
  // a hosted page reached from an unknown site (usually the business's own) keeps its door's name
  assert.equal(sourceFromArrival({ referrer: "https://steadfast.example/contact" }), null);
});
t("a lookalike host is not Google", () => {
  assert.equal(sourceFromArrival({ referrer: "https://notgoogle.com/", embedded: true }), "Another website");
  assert.equal(sourceFromArrival({ referrer: "https://google.evil.example/", embedded: true }), "Another website");
});
t("fbclid alone is Facebook, never Facebook Ads", () => {
  assert.equal(sourceFromArrival({ fbclid: "x" }), "Facebook");
  assert.equal(sourceFromArrival({ fbclid: "x", referrer: "https://www.instagram.com/" }), "Instagram");
});
t("no signal: the business's own site says direct, a hosted page says nothing", () => {
  assert.equal(sourceFromArrival({ embedded: true, landing: "https://steadfast.example/" }), "Website (direct)");
  assert.equal(sourceFromArrival({ landing: "https://workbenchfsm.com/book/x" }), null);
  assert.equal(sourceFromArrival(null), null);
});
t("leadSourceFor falls back to the door", () => {
  assert.equal(leadSourceFor(null, "Online booking"), "Online booking");
  assert.equal(leadSourceFor({ gclid: "x" }, "Online booking"), "Google Ads");
});

console.log("arrivalLines");
t("plain facts, home page named", () => {
  const lines = arrivalLines({ gclid: "x", utmCampaign: "Fence spring", utmTerm: "fence repair lucas", landing: "https://steadfast.example/", referrer: "https://www.google.com/" });
  assert.deepEqual(lines, [
    { label: "Campaign", value: "Fence spring" },
    { label: "Search term", value: "fence repair lucas" },
    { label: "Came from", value: "google.com" },
    { label: "First page", value: "Home page" },
    { label: "Ad click", value: "Google click ID saved" },
  ]);
  assert.deepEqual(arrivalLines(null), []);
  assert.deepEqual(arrivalLines({ landing: "https://x.example/fence-repair/" }), [{ label: "First page", value: "/fence-repair/" }]);
});

console.log("buildSourceRows");
t("spellings merge, blanks are Untracked, rates and order", () => {
  const rows = buildSourceRows([
    { source: "Google Ads", quoted: true, won: true, revenue: 4200 },
    { source: "google ads", quoted: true, won: false, revenue: 0 },
    { source: "adwords", quoted: false, won: false, revenue: 0 },
    { source: "Referral", quoted: true, won: true, revenue: 900.105 },
    { source: null, quoted: false, won: false, revenue: 0 },
    { source: "  ", quoted: false, won: true, revenue: 50 },
  ]);
  assert.deepEqual(rows, [
    { key: "google ads", source: "Google Ads", leads: 3, quoted: 2, won: 1, revenue: 4200, winRate: 33 },
    { key: "untracked", source: "Untracked", leads: 2, quoted: 0, won: 1, revenue: 50, winRate: 50 },
    { key: "referral", source: "Referral", leads: 1, quoted: 1, won: 1, revenue: 900.11, winRate: 100 },
  ]);
  assert.deepEqual(buildSourceRows([]), []);
});

console.log("pickerSources");
t("standard list first, then the company's own, no doubles", () => {
  const list = pickerSources(["Home show", "referral", "home show", null, "Google Ads", "Website (direct)"]);
  assert.equal(list[0], "Referral");
  assert.equal(list.filter((s) => s.toLowerCase() === "referral").length, 1);
  assert.equal(list.filter((s) => s === "Home show").length, 1);
  assert.ok(list.includes("Website (direct)"));
  assert.equal(list.indexOf("Home show") > list.indexOf("Flyer or door hanger"), true);
});

console.log(`\n${n} lead-source checks passed`);
