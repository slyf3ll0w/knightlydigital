/**
 * Sticky notes: the pure helpers (task title from a note, monograms, tilt,
 * link splitting).  `npx tsx scripts/test-sticky-notes.ts`
 */
import assert from "node:assert/strict";
import { taskTitleFromBody, monogram, randomRotation, splitLinks, STICKY_BODY_MAX } from "../lib/sticky-shared";

// Task title = first non-empty line, cut at ~80 chars
assert.equal(taskTitleFromBody("Call the supplier Monday\nabout the 40 ft ladder"), "Call the supplier Monday");
assert.equal(taskTitleFromBody("\n\n  order filters  \n"), "order filters");
const long = "x".repeat(120);
assert.equal(taskTitleFromBody(long).length, 78); // 77 + ellipsis
assert.ok(taskTitleFromBody(long).endsWith("…"));
assert.equal(taskTitleFromBody("short"), "short");

// Monograms
assert.equal(monogram("David Lessly"), "DL");
assert.equal(monogram("Ana María Rivera Soto"), "AS");
assert.equal(monogram("Sam"), "SA");
assert.equal(monogram("  "), "?");

// Tilt: within ±3°, never flat
for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
  const t = randomRotation(() => r);
  assert.ok(t >= -3 && t <= 3, `tilt ${t} out of range`);
  assert.ok(Math.abs(t) >= 0.4, `tilt ${t} is too flat`);
}
assert.equal(randomRotation(() => 0.5), 0.6); // dead centre nudges to a slight tilt

// Links: bare URLs become links, the rest stays text, order preserved
assert.deepEqual(splitLinks("see https://example.com/a?b=1 then call"), [
  { text: "see " },
  { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
  { text: " then call" },
]);
assert.deepEqual(splitLinks("no links here"), [{ text: "no links here" }]);
assert.deepEqual(splitLinks("http://x.y"), [{ text: "http://x.y", href: "http://x.y" }]);

assert.equal(STICKY_BODY_MAX, 400);
console.log("test-sticky-notes: all assertions passed");
