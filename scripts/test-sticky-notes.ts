/**
 * Sticky notes: the pure helpers (task title from a note, monograms, tilt,
 * link splitting, page keys, size clamps) and the expiry math in a company
 * zone.  `npx tsx scripts/test-sticky-notes.ts`
 */
import assert from "node:assert/strict";
import {
  taskTitleFromBody,
  monogram,
  randomRotation,
  splitLinks,
  normalizePage,
  clampSize,
  STICKY_BODY_MAX,
  STICKY_MIN,
  STICKY_MAX,
} from "../lib/sticky-shared";
import { parseExpiry } from "../lib/sticky-notes";

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
assert.equal(randomRotation(() => 0.5), 0.6);

// Links
assert.deepEqual(splitLinks("see https://example.com/a?b=1 then call"), [
  { text: "see " },
  { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
  { text: " then call" },
]);
assert.deepEqual(splitLinks("no links here"), [{ text: "no links here" }]);

// Page keys: pathname only, no trailing slash, capped
assert.equal(normalizePage("/app/jobs/abc?tab=photos#top"), "/app/jobs/abc");
assert.equal(normalizePage("/app/quotes/"), "/app/quotes");
assert.equal(normalizePage(""), "/app/dashboard");
assert.equal(normalizePage("/app/" + "x".repeat(300)).length, 200);

// Sizes
assert.equal(clampSize(50), STICKY_MIN);
assert.equal(clampSize(9999), STICKY_MAX);
assert.equal(clampSize(200.4), 200);
assert.equal(clampSize("big"), 168);
assert.equal(clampSize(undefined, 232), 232);

// Expiry: end of the chosen day in the company's zone (Denver, MDT = UTC-6)
const tz = "America/Denver";
const now = new Date("2026-10-07T20:30:00Z"); // Wed Oct 7, 14:30 Denver
const endToday = parseExpiry("today", undefined, tz, now);
assert.ok(endToday && "expiresAt" in endToday && endToday.expiresAt?.toISOString() === "2026-10-08T05:59:59.000Z");
const endTomorrow = parseExpiry("tomorrow", undefined, tz, now);
assert.ok(endTomorrow && "expiresAt" in endTomorrow && endTomorrow.expiresAt?.toISOString() === "2026-10-09T05:59:59.000Z");
const week = parseExpiry("week", undefined, tz, now);
assert.ok(week && "expiresAt" in week && week.expiresAt?.toISOString() === "2026-10-15T05:59:59.000Z");
const custom = parseExpiry("custom", "2026-11-02", tz, now); // after the DST fall-back: MST = UTC-7
assert.ok(custom && "expiresAt" in custom && custom.expiresAt?.toISOString() === "2026-11-03T06:59:59.000Z");
assert.deepEqual(parseExpiry("none", undefined, tz, now), { expiresAt: null });
assert.equal(parseExpiry(undefined, undefined, tz, now), undefined);
assert.ok("error" in (parseExpiry("custom", "2026-10-01", tz, now) as object)); // already passed
assert.ok("error" in (parseExpiry("custom", "soon", tz, now) as object));
assert.ok("error" in (parseExpiry("never", undefined, tz, now) as object));

assert.equal(STICKY_BODY_MAX, 400);
console.log("test-sticky-notes: all assertions passed");
