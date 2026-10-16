/**
 * Unit tests for lib/phone-input.ts — format-as-you-type, name casing, name split.
 *   npx tsx scripts/test-phone-input.ts
 */
import assert from "node:assert/strict";
import { formatPhoneAsTyped, looksLikePhone, splitName, titleCaseName } from "../lib/phone-input";

// ── formatPhoneAsTyped ───────────────────────────────────────────────────────

assert.equal(formatPhoneAsTyped(""), "");
assert.equal(formatPhoneAsTyped("2"), "(2");
assert.equal(formatPhoneAsTyped("214"), "(214");
assert.equal(formatPhoneAsTyped("2145"), "(214) 5");
assert.equal(formatPhoneAsTyped("214555"), "(214) 555");
assert.equal(formatPhoneAsTyped("2145550"), "(214) 555-0");
assert.equal(formatPhoneAsTyped("2145550100"), "(214) 555-0100");
// Already formatted stays put; pasted dressing is normalised
assert.equal(formatPhoneAsTyped("(214) 555-0100"), "(214) 555-0100");
assert.equal(formatPhoneAsTyped("214-555-0100"), "(214) 555-0100");
assert.equal(formatPhoneAsTyped("214.555.0100"), "(214) 555-0100");
// Leading 1 / +1
assert.equal(formatPhoneAsTyped("12145550100"), "+1 (214) 555-0100");
assert.equal(formatPhoneAsTyped("+1 214 555 0100"), "+1 (214) 555-0100");
assert.equal(formatPhoneAsTyped("+1 (214"), "+1 (214");
// Backspacing through the format never gets stuck
assert.equal(formatPhoneAsTyped("(214) "), "(214");
assert.equal(formatPhoneAsTyped("("), "");
assert.equal(formatPhoneAsTyped("+1 "), "+1 ");
// Not a US number: left exactly as typed
assert.equal(formatPhoneAsTyped("+44 20 7946 0958"), "+44 20 7946 0958");
assert.equal(formatPhoneAsTyped("214 555 0100 ext 4"), "214 555 0100 ext 4");
assert.equal(formatPhoneAsTyped("21455501001"), "21455501001");
assert.equal(formatPhoneAsTyped("name@example.com"), "name@example.com");

// ── looksLikePhone ───────────────────────────────────────────────────────────

assert.equal(looksLikePhone("214"), true);
assert.equal(looksLikePhone("(214) 555-0100"), true);
assert.equal(looksLikePhone("mike@x.com"), false);
assert.equal(looksLikePhone("mike"), false);
assert.equal(looksLikePhone(""), false);

// ── titleCaseName ────────────────────────────────────────────────────────────

assert.equal(titleCaseName("mike jones"), "Mike Jones");
assert.equal(titleCaseName("mary-ann o'brien"), "Mary-Ann O'Brien");
assert.equal(titleCaseName("McDonald"), "McDonald"); // typed with a capital → untouched
assert.equal(titleCaseName("de la Cruz"), "de la Cruz");
assert.equal(titleCaseName(""), "");

// ── splitName ────────────────────────────────────────────────────────────────

assert.deepEqual(splitName("Mike Jones"), { firstName: "Mike", lastName: "Jones" });
assert.deepEqual(splitName("  Mary Ann Smith "), { firstName: "Mary", lastName: "Ann Smith" });
assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
assert.deepEqual(splitName("   "), { firstName: "", lastName: "" });

console.log("phone-input: all tests passed");
