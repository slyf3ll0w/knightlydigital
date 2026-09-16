/**
 * Unit tests for the inbound-SMS keyword matcher (lib/sms-keywords.ts) and
 * the phone normalizer (lib/phone.ts).
 *   npx tsx scripts/test-sms-keywords.ts
 * Plain assertions, no test framework (repo has none).
 */
import assert from "node:assert/strict";
import { classifySmsKeyword } from "../lib/sms-keywords";
import { phoneDigits } from "../lib/phone";

// Whole-body keywords opt out / back in
for (const t of ["STOP", "stop", " Stop ", "stop.", "STOP!", "stopall", "Unsubscribe"]) {
  assert.equal(classifySmsKeyword(t), "STOP", `"${t}" should be STOP`);
}
for (const t of ["START", "unstop", "Start."]) {
  assert.equal(classifySmsKeyword(t), "START", `"${t}" should be START`);
}
assert.equal(classifySmsKeyword("HELP"), "HELP");

// Real messages that merely start with (or contain) a keyword are messages
for (const t of [
  "Cancel Friday's visit please",
  "Stop by after 3 if you can",
  "Yes, that works",
  "Yes",
  "End of day is fine",
  "Quit worrying, I'll be home",
  "Can you cancel?",
  "cancel Tuesday and move it to Friday",
  "stop the mowing but keep the hedges",
  "please unsubscribe me from the newsletter",
  "",
]) {
  assert.equal(classifySmsKeyword(t), null, `"${t}" should land in the thread`);
}

// Phone normalization: same person however they typed it
// Whole-body CTIA words (Telnyx honors these at the carrier edge) still opt out
for (const t of ["CANCEL", "quit", "End", "STOPALL", "cancel."]) {
  assert.equal(classifySmsKeyword(t), "STOP", `"${t}" is a whole-body opt-out`);
}

assert.equal(phoneDigits("(214) 555-0100"), "2145550100");
assert.equal(phoneDigits("214-555-0100 x12"), "2145550100"); // extension is not part of the number
assert.equal(phoneDigits("214-555-0100 ext. 401"), "2145550100");
assert.equal(phoneDigits("+44 20 7946 0958"), "442079460958"); // not truncated to a fake US number
assert.equal(phoneDigits("+1 214.555.0100"), "2145550100");
assert.equal(phoneDigits("12145550100"), "2145550100");
assert.equal(phoneDigits("2145550100"), "2145550100");
assert.equal(phoneDigits("555-0100"), "5550100"); // short local number keeps its digits
assert.equal(phoneDigits("555"), null);
assert.equal(phoneDigits(""), null);
assert.equal(phoneDigits(null), null);
assert.equal(phoneDigits(undefined), null);

console.log("sms-keywords: all tests passed");
