/**
 * Unit tests for lib/dial-format.ts — what the keypad keeps of a paste and
 * how it shows it.   npx tsx scripts/test-dial-format.ts
 */
import assert from "node:assert/strict";
import { DIAL_MAX, dialDisplaySize, fmtDialing, normalizeDialed } from "../lib/dial-format";

// ── paste normalization: every US dressing → ten digits ──────────────────────
for (const pasted of ["4698335853", "(469) 833-5853", "469-833-5853", "469.833.5853", "+1 (469) 833-5853", "1 469 833 5853", "+14698335853", "tel:+1-469-833-5853", " 469 833 5853\n"]) {
  assert.equal(normalizeDialed(pasted), "4698335853", pasted);
}
// Not US-shaped: kept as typed (minus the junk), with its leading +.
assert.equal(normalizeDialed("+44 20 7946 0958"), "+442079460958");
assert.equal(normalizeDialed("+52 55 1234 5678"), "+525512345678");
// A + only counts at the front; * and # survive (extensions, feature codes).
assert.equal(normalizeDialed("469+833"), "469833");
assert.equal(normalizeDialed("*67 469 833 5853"), "*674698335853");
// Typing digit by digit is unchanged until a full 11-digit US number lands.
assert.equal(normalizeDialed("1469"), "1469");
assert.equal(normalizeDialed("14698335853"), "4698335853");
// The cap.
assert.equal(normalizeDialed("9".repeat(40)).length, DIAL_MAX);

// ── display ──────────────────────────────────────────────────────────────────
assert.equal(fmtDialing("4698335853"), "(469) 833-5853");
assert.equal(fmtDialing("469833"), "469-833");
assert.equal(fmtDialing("+442079460958"), "+442079460958");
assert.equal(dialDisplaySize(fmtDialing("469833")), "lg");
assert.equal(dialDisplaySize(fmtDialing("4698335853")), "md", "a full local number steps down so it fits the 236 px keypad");
assert.equal(dialDisplaySize("+1 (469) 833-5853"), "sm");

console.log("test-dial-format: ok");
