/**
 * lib/pricebooks.ts — the industry → starter price book lookup.
 *   npx tsx scripts/test-pricebooks.ts
 *
 * The signup forms used to send free text and the lookup was an exact key
 * match, so "hvac" and "lawn care" seeded nothing while the dashboard said
 * the price book was ready (audit 2026-10-12).
 */
import assert from "node:assert/strict";
import { INDUSTRIES, INDUSTRY_PRICEBOOKS, matchIndustry, pricebookForIndustry } from "../lib/pricebooks";

// Every real key resolves to itself and seeds its own list
for (const key of INDUSTRIES) {
  assert.equal(matchIndustry(key), key, key);
  assert.equal(pricebookForIndustry(key), INDUSTRY_PRICEBOOKS[key], key);
}

// What people type
const cases: Array<[string, string | null]> = [
  ["hvac", "HVAC"],
  ["HVAC & refrigeration", "HVAC"],
  ["heating and cooling", "HVAC"],
  ["lawn care", "Lawn Care & Landscaping"],
  ["Landscaping", "Lawn Care & Landscaping"],
  ["plumbing", "Plumbing"],
  ["Plumber", "Plumbing"],
  ["power washing", "Pressure Washing"],
  ["House cleaning", "Cleaning Services"],
  ["Other: mobile detailing", null],
  ["Other", "Other"],
  ["", null],
  ["   ", null],
  ["Roofing", "Roofing & Gutters"],
  ["pest control", "Pest Control"],
  ["Computer repair", "PC Building & Repair"],
  ["Electrician", "Electrical"],
  ["something nobody does", null],
];
for (const [input, want] of cases) {
  assert.equal(matchIndustry(input), want, `matchIndustry(${JSON.stringify(input)})`);
}

// Unmatched and "Other" seed nothing; a match seeds a non-empty list
assert.deepEqual(pricebookForIndustry("Other: mobile detailing"), []);
assert.deepEqual(pricebookForIndustry("Other"), []);
assert.deepEqual(pricebookForIndustry(null), []);
assert.ok(pricebookForIndustry("hvac").length > 0);

console.log("test-pricebooks: ok");
