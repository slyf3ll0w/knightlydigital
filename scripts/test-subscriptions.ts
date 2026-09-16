/**
 * Unit tests for the recurring engine's pure cursor math (lib/billing-cursor.ts)
 * and autopay policy (lib/autopay-rules.ts).
 *   npx tsx scripts/test-subscriptions.ts
 * Plain assertions, no test framework (repo has none). No database.
 */
import assert from "node:assert/strict";
import {
  addInterval,
  anchoredNextRunDate,
  cursorAfterCycle,
  resumedVisitCursor,
  rewoundVisitCursor,
  rollCursorForward,
} from "../lib/billing-cursor";
import {
  classifyDecline,
  isTransientProcessorStatus,
  MAX_AUTO_CHARGE_ATTEMPTS,
  nextRetryAt,
} from "../lib/autopay-rules";

// Engine dates are noon-anchored, server-local — build them the same way.
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0);
const at = (y: number, m: number, d: number, hh: number) => new Date(y, m - 1, d, hh, 0, 0, 0);
const HOUR = 3600_000;

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ok", name);
}

console.log("addInterval / rollCursorForward");
test("month-end anchors clamp instead of overflowing", () => {
  assert.equal(addInterval(noon(2026, 1, 31), "MONTHLY").getTime(), noon(2026, 2, 28).getTime());
  assert.equal(addInterval(noon(2026, 3, 31), "MONTHLY").getTime(), noon(2026, 4, 30).getTime());
  assert.equal(addInterval(noon(2028, 2, 29), "ANNUAL").getTime(), noon(2029, 2, 28).getTime());
});
test("rollCursorForward leaves a future cursor alone", () => {
  assert.equal(
    rollCursorForward(noon(2026, 10, 1), "MONTHLY", at(2026, 9, 16, 9)).getTime(),
    noon(2026, 10, 1).getTime()
  );
});

console.log("cursorAfterCycle (#36 — one catch-up cycle, not one per tick)");
test("on-time tick: one interval past the due date", () => {
  assert.equal(
    cursorAfterCycle(noon(2026, 9, 1), "MONTHLY", at(2026, 9, 1, 13)).getTime(),
    noon(2026, 10, 1).getTime()
  );
});
test("tick a few days late still lands on the next occurrence", () => {
  assert.equal(
    cursorAfterCycle(noon(2026, 9, 1), "MONTHLY", at(2026, 9, 4, 9)).getTime(),
    noon(2026, 10, 1).getTime()
  );
});
test("three-month cron outage: the catch-up cycle rolls straight to the future", () => {
  // Cursor stuck at Jun 1, cron returns Sep 16: this tick bills ONE cycle and
  // the cursor lands on Oct 1 — not Jul 1 (which would bill again next tick).
  assert.equal(
    cursorAfterCycle(noon(2026, 6, 1), "MONTHLY", at(2026, 9, 16, 9)).getTime(),
    noon(2026, 10, 1).getTime()
  );
});
test("quarterly keeps its anchor day through a catch-up", () => {
  assert.equal(
    cursorAfterCycle(noon(2026, 1, 15), "QUARTERLY", at(2026, 9, 16, 9)).getTime(),
    noon(2026, 10, 15).getTime()
  );
});

console.log("anchoredNextRunDate (#11 — a late first payment must not skip a cycle)");
test("paid on signup day: next bill one interval out on that day", () => {
  const r = anchoredNextRunDate({
    paidAt: at(2026, 9, 1, 15),
    interval: "MONTHLY",
    currentCursor: noon(2026, 10, 1),
    now: at(2026, 9, 1, 15),
  });
  assert.equal(r.anchor.getTime(), noon(2026, 9, 1).getTime());
  assert.equal(r.next.getTime(), noon(2026, 10, 1).getTime());
});
test("paid a few days after signup: the pay day becomes the billing day", () => {
  const r = anchoredNextRunDate({
    paidAt: at(2026, 9, 5, 10),
    interval: "MONTHLY",
    currentCursor: noon(2026, 10, 1),
    now: at(2026, 9, 5, 10),
  });
  assert.equal(r.next.getTime(), noon(2026, 10, 5).getTime());
});
test("late payment (Sep 28 on a Sep 1 plan): cursor stays Oct 1, no skipped cycle", () => {
  const r = anchoredNextRunDate({
    paidAt: at(2026, 9, 28, 10),
    interval: "MONTHLY",
    currentCursor: noon(2026, 10, 1),
    now: at(2026, 9, 28, 10),
  });
  assert.equal(r.anchor.getTime(), noon(2026, 9, 28).getTime(), "anchoredAt still stamped");
  assert.equal(r.next.getTime(), noon(2026, 10, 1).getTime(), "Oct 1–27 still gets billed");
});
test("no cursor yet: plain one-interval-out from the pay day", () => {
  const r = anchoredNextRunDate({
    paidAt: at(2026, 9, 10, 10),
    interval: "QUARTERLY",
    currentCursor: null,
    now: at(2026, 9, 10, 10),
  });
  assert.equal(r.next.getTime(), noon(2026, 12, 10).getTime());
});
test("backdated payment (old check recorded today) rolls past now, keeping the day", () => {
  const r = anchoredNextRunDate({
    paidAt: at(2026, 6, 3, 10),
    interval: "MONTHLY",
    currentCursor: null,
    now: at(2026, 9, 16, 9),
  });
  assert.equal(r.next.getTime(), noon(2026, 10, 3).getTime());
});
test("a past cursor is left for the sweep's catch-up, not rolled here", () => {
  const r = anchoredNextRunDate({
    paidAt: at(2026, 9, 28, 10),
    interval: "MONTHLY",
    currentCursor: noon(2026, 9, 1),
    now: at(2026, 9, 28, 10),
  });
  assert.equal(r.next.getTime(), noon(2026, 9, 1).getTime());
});

console.log("rewoundVisitCursor / resumedVisitCursor (#9 — pause→resume leaves no hole)");
test("pause rewinds the cursor to the first visit it deleted", () => {
  assert.equal(
    rewoundVisitCursor(noon(2026, 5, 29), noon(2026, 5, 8))!.getTime(),
    noon(2026, 5, 8).getTime()
  );
});
test("a deleted visit later than the cursor never moves it forward", () => {
  assert.equal(
    rewoundVisitCursor(noon(2026, 5, 8), noon(2026, 5, 29))!.getTime(),
    noon(2026, 5, 8).getTime()
  );
});
test("nothing deleted: cursor untouched", () => {
  assert.equal(rewoundVisitCursor(noon(2026, 5, 29), null)!.getTime(), noon(2026, 5, 29).getTime());
  assert.equal(rewoundVisitCursor(null, null), null);
});
test("weekly mow paused May 1, resumed May 4: next visit is May 8, not May 29", () => {
  // Visits existed through May 29 (horizon); pause deleted May 8 onward and
  // rewound the cursor to May 8. Resume on May 4 keeps it — the hole is gone.
  const rewound = rewoundVisitCursor(noon(2026, 5, 29), noon(2026, 5, 8))!;
  const resumed = resumedVisitCursor(rewound, "WEEKLY", at(2026, 5, 4, 0));
  assert.equal(resumed.getTime(), noon(2026, 5, 8).getTime());
});
test("resume after the rewound date rolls forward on-cadence, keeping the weekday", () => {
  // May 8 2026 is a Friday; resuming May 12 → next Friday, May 15.
  const resumed = resumedVisitCursor(noon(2026, 5, 8), "WEEKLY", at(2026, 5, 12, 0));
  assert.equal(resumed.getTime(), noon(2026, 5, 15).getTime());
  assert.equal(resumed.getDay(), 5);
});
test("a future cursor resumes unchanged", () => {
  const resumed = resumedVisitCursor(noon(2026, 6, 1), "BIWEEKLY", at(2026, 5, 12, 0));
  assert.equal(resumed.getTime(), noon(2026, 6, 1).getTime());
});

console.log("classifyDecline / isTransientProcessorStatus (#5 — outages are not declines)");
test("hard codes stop autopay", () => {
  assert.equal(classifyDecline("Declined", "LOST_CARD"), "hard");
  assert.equal(classifyDecline("Declined", "EXPIRED_CARD"), "hard");
  assert.equal(classifyDecline("Declined", "INVALID_ACCOUNT_NUMBER"), "hard");
});
test("soft or unknown codes retry", () => {
  assert.equal(classifyDecline("Declined", "INSUFFICIENT_FUNDS"), "soft");
  assert.equal(classifyDecline("Declined", "GENERIC_DECLINE"), "soft");
  assert.equal(classifyDecline("Declined", null), "soft");
});
test("free-text messages never classify as hard (the old permanent-stop bug)", () => {
  assert.equal(classifyDecline("invalid credentials", null), "soft");
  assert.equal(classifyDecline("Unsupported media type", undefined), "soft");
  assert.equal(classifyDecline("Operation not permitted", ""), "soft");
  assert.equal(classifyDecline("expired", "DO_NOT_HONOR"), "soft");
});
test("auth, rate-limit and 5xx are transient; 4xx judgements are not", () => {
  for (const s of [401, 403, 429, 500, 502, 503, 504]) assert.equal(isTransientProcessorStatus(s), true, String(s));
  for (const s of [400, 402, 404, 409, 422]) assert.equal(isTransientProcessorStatus(s), false, String(s));
});

console.log("nextRetryAt (retry schedule)");
test("soft declines retry +1d / +3d / +7d, then give up", () => {
  const now = at(2026, 9, 16, 9);
  assert.equal(nextRetryAt({ attempts: 1, kind: "soft", now })!.getTime(), now.getTime() + 24 * HOUR);
  assert.equal(nextRetryAt({ attempts: 2, kind: "soft", now })!.getTime(), now.getTime() + 72 * HOUR);
  assert.equal(nextRetryAt({ attempts: 3, kind: "soft", now })!.getTime(), now.getTime() + 168 * HOUR);
  assert.equal(nextRetryAt({ attempts: MAX_AUTO_CHARGE_ATTEMPTS, kind: "soft", now }), null);
});
test("a hard decline gives up on the first attempt", () => {
  assert.equal(nextRetryAt({ attempts: 1, kind: "hard", now: at(2026, 9, 16, 9) }), null);
});

console.log(`\n${passed} tests passed`);
