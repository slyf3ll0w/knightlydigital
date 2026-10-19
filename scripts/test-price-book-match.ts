/**
 * Unit tests for lib/price-book-match.ts — how Atlas prices a line item the
 * user named by ear.   npx tsx scripts/test-price-book-match.ts
 */
import assert from "node:assert/strict";
import { matchPriceBook, nameScore } from "../lib/price-book-match";

const book = [
  { id: "1", name: "Water Heater Replacement", unitPrice: 1850 },
  { id: "2", name: "Water Heater Flush", unitPrice: 149 },
  { id: "3", name: "Drain Cleaning", unitPrice: 225 },
  { id: "4", name: "Service Call", unitPrice: 89 },
  { id: "5", name: "Garbage Disposal Install", unitPrice: 310 },
];

// David's case: a typo in the first word still lands on the one entry
assert.equal(matchPriceBook("Wter Heater Replacement", book).best?.id, "1", "typo-tolerant");
assert.equal(matchPriceBook("water heater replacement", book).best?.id, "1", "case/exact");
assert.equal(matchPriceBook("Water heater replacment", book).best?.id, "1", "typo in the last word");
assert.equal(matchPriceBook("replace water heater", book).best?.id, "1", "word order / stem-ish");

// Ambiguous: two entries share the words → no best, both offered
{
  const r = matchPriceBook("water heater", book);
  assert.equal(r.best, null, "water heater alone is ambiguous");
  assert.deepEqual(r.close.map((e) => e.id).sort(), ["1", "2"]);
}

// Nothing like it → no best and nothing close
{
  const r = matchPriceBook("Roof inspection", book);
  assert.equal(r.best, null);
  assert.equal(r.close.length, 0);
}

// Short generic words don't false-match
assert.equal(matchPriceBook("install", book).best, null, "one word of a three-word name is not a match");
assert.equal(matchPriceBook("disposal install", book).best?.id, "5");
assert.equal(matchPriceBook("drain", book).best?.id, "3", "contained in the name");

// Scores are ordered the way a human would expect
assert.ok(nameScore("Water Heater Replacement", "Water Heater Replacement") === 1);
assert.ok(nameScore("Wter Heater Replacement", "Water Heater Replacement") > nameScore("Wter Heater Replacement", "Water Heater Flush"));
assert.ok(nameScore("", "Anything") === 0);

console.log("price-book-match: all assertions passed");
