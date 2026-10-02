/**
 * Unit tests for the console's presence rules (lib/presence.ts) and the lead
 * board's Customize validator (lib/console-leads.ts).
 *   npx tsx scripts/test-console-presence.ts
 * Needs a placeholder DATABASE_URL (the modules import Prisma, never query).
 */
import assert from "node:assert/strict";
import { bestPresence, presenceOf, ONLINE_WINDOW_MS } from "../lib/presence";
import { cleanStageInput, MAX_STAGES } from "../lib/console-leads";

const NOW = new Date("2026-10-02T18:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const TZ = "America/Chicago";

// ── presenceOf ──────────────────────────────────────────────────────────────
assert.equal(presenceOf(null, TZ, NOW), "never");
assert.equal(presenceOf(ago(30_000), TZ, NOW), "online");
assert.equal(presenceOf(ago(ONLINE_WINDOW_MS + 1000), TZ, NOW), "today");
// Inside the window but now on another company with the same login: not online here.
assert.equal(presenceOf(ago(30_000), TZ, NOW, true), "today");
assert.equal(presenceOf(ago(3 * 86_400_000), TZ, NOW), "away");
assert.equal(presenceOf(ago(3 * 86_400_000), TZ, NOW, true), "away");

// ── bestPresence ────────────────────────────────────────────────────────────
assert.equal(bestPresence([]), "never");
assert.equal(bestPresence(["away", "online", "today"]), "online");
assert.equal(bestPresence(["away", "today", "never"]), "today");

// ── cleanStageInput ─────────────────────────────────────────────────────────
const ok = cleanStageInput({
  stages: [{ id: "a", name: "  New  ", color: "#F59E0B" }, { name: "Demo", color: "red" }],
  won: { name: "Signed up", color: "#22C55E" },
});
assert.ok(!("error" in ok));
if (!("error" in ok)) {
  assert.equal(ok.stages[0].name, "New");
  assert.equal(ok.stages[0].id, "a");
  assert.equal(ok.stages[1].color, null, "a non-hex color is dropped");
  assert.equal(ok.stages[1].id, undefined);
}
assert.ok("error" in cleanStageInput({ stages: [], won: { name: "Won" } }), "needs one working column");
assert.ok("error" in cleanStageInput({ stages: [{ name: " " }], won: { name: "Won" } }), "blank names refused");
assert.ok("error" in cleanStageInput({ stages: [{ name: "A" }], won: { name: "" } }), "Won needs a name");
assert.ok(
  "error" in cleanStageInput({ stages: Array.from({ length: MAX_STAGES + 1 }, (_, i) => ({ name: `S${i}` })), won: { name: "Won" } }),
  "column cap"
);
assert.ok("error" in cleanStageInput(null));

console.log("test-console-presence: all assertions passed");
