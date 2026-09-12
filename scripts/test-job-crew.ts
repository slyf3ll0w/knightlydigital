// Unit check for lib/job-crew.ts — run: npx tsx scripts/test-job-crew.ts
// Pure helpers only (resolveCrew / soloMemberId hit the database; they're
// covered by the API routes' behavior described in CLAUDE.md).
import assert from "node:assert/strict";
import { cleanOutsourcedTo, crewMissing, DEFAULT_JOB_TITLE, deriveJobTitle } from "../lib/job-crew";

// ── deriveJobTitle ──────────────────────────────────────────────────────────
assert.equal(deriveJobTitle({ title: "  Gutter cleaning  " }), "Gutter cleaning", "typed title wins, trimmed");
assert.equal(deriveJobTitle({ title: "", lineItemNames: ["Mow"] }), "Mow", "one service names the job");
assert.equal(deriveJobTitle({ lineItemNames: ["Mow", "Edge"] }), "Mow + Edge", "two services");
assert.equal(deriveJobTitle({ lineItemNames: ["Mow", "Edge", "Blow"] }), "Mow + 2 more", "three or more services");
assert.equal(deriveJobTitle({ lineItemNames: [" ", null, undefined] }), DEFAULT_JOB_TITLE, "blank service names are ignored");
assert.equal(deriveJobTitle({ requestTitle: "Leaky faucet" }), "Leaky faucet", "request title before the generic label");
assert.equal(deriveJobTitle({ lineItemNames: ["Mow"], requestTitle: "Leaky faucet" }), "Mow", "services before the request");
assert.equal(deriveJobTitle({}), DEFAULT_JOB_TITLE, "nothing known → generic label");
assert.equal(deriveJobTitle({ title: 123 }), DEFAULT_JOB_TITLE, "non-string title is ignored");
assert.equal(deriveJobTitle({ title: "x".repeat(400) }).length, 150, "typed title capped");

// ── crewMissing ─────────────────────────────────────────────────────────────
const when = new Date("2026-09-12T15:00:00Z");
assert.equal(crewMissing({ scheduledAt: when, crew: [], outsourced: false }), true, "scheduled + nobody = missing");
assert.equal(crewMissing({ scheduledAt: when, crew: ["u1"], outsourced: false }), false, "scheduled + crew = fine");
assert.equal(crewMissing({ scheduledAt: when, crew: [], outsourced: true }), false, "scheduled + outsourced = fine");
assert.equal(crewMissing({ scheduledAt: null, crew: [], outsourced: false }), false, "unscheduled never blocks");

// ── cleanOutsourcedTo ───────────────────────────────────────────────────────
assert.equal(cleanOutsourcedTo("  Bob's Electric  "), "Bob's Electric");
assert.equal(cleanOutsourcedTo(""), null);
assert.equal(cleanOutsourcedTo("   "), null);
assert.equal(cleanOutsourcedTo(42), null);
assert.equal(cleanOutsourcedTo("x".repeat(300))?.length, 120, "name capped");

console.log("test-job-crew: all assertions passed");
