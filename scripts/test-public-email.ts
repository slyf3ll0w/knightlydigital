/**
 * Unit tests for "Keep my email off client pages" (lib/public-email.ts).
 *   npx tsx scripts/test-public-email.ts
 */
import assert from "node:assert/strict";
import { publicEmail } from "../lib/public-email";

// Shown by default
assert.equal(publicEmail({ email: "hi@acme.test", hideEmail: false }), "hi@acme.test");
// Trimmed; blank is none
assert.equal(publicEmail({ email: "  hi@acme.test ", hideEmail: false }), "hi@acme.test");
assert.equal(publicEmail({ email: "   ", hideEmail: false }), null);
assert.equal(publicEmail({ email: null, hideEmail: false }), null);
// Hidden
assert.equal(publicEmail({ email: "hi@acme.test", hideEmail: true }), null);
// A texting registration under review forces it back on (carrier rule)
assert.equal(publicEmail({ email: "hi@acme.test", hideEmail: true }, { forced: true }), "hi@acme.test");
assert.equal(publicEmail({ email: null, hideEmail: true }, { forced: true }), null);

console.log("test-public-email: ok");
