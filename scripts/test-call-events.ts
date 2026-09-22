/**
 * Unit tests for lib/call-events.ts — which quote / appointment / job /
 * invoice / lead-save belongs to which call.
 *   npx tsx scripts/test-call-events.ts
 * Needs a placeholder DATABASE_URL (the module imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import { assignCallEvents, callWindow, CALL_EVENT_AFTER_MS, CALL_EVENT_BEFORE_MS, type CallEventRecords } from "../lib/call-events";

const T0 = Date.parse("2026-09-22T15:00:00Z");
const min = (n: number) => n * 60_000;
const at = (offsetMin: number) => new Date(T0 + min(offsetMin));
const NOW = at(120);

const empty: CallEventRecords = { contacts: [], quotes: [], appointments: [], jobs: [], invoices: [] };
const call = (id: string, contactId: string | null, startMin: number, endMin: number | null) => ({
  id,
  contactId,
  createdAt: at(startMin),
  endedAt: endMin === null ? null : at(endMin),
});

// ── callWindow ───────────────────────────────────────────────────────────────

{
  const w = callWindow(call("a", "c1", 0, 10), NOW);
  assert.equal(w.start, T0 - CALL_EVENT_BEFORE_MS);
  assert.equal(w.end, T0 + min(10) + CALL_EVENT_AFTER_MS);
  // A live call extends to now
  const live = callWindow(call("b", "c1", 0, null), NOW);
  assert.equal(live.end, NOW.getTime() + CALL_EVENT_AFTER_MS);
}

// ── quote sent during the call → that call ───────────────────────────────────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, quotes: [{ id: "q1", contactId: "c1", createdAt: at(4), sentAt: at(6) }] }, NOW);
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["quote_sent"]);
  assert.equal(out.get("a")?.[0].href, "/app/quotes/q1");
}

// ── a draft only counts as drafted ───────────────────────────────────────────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, quotes: [{ id: "q1", contactId: "c1", createdAt: at(4), sentAt: null }] }, NOW);
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["quote_drafted"]);
}

// ── written up 20 minutes after hanging up still belongs to the call ─────────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, appointments: [{ id: "ap1", contactId: "c1", createdAt: at(30) }] }, NOW);
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["appointment"]);
  // …but not an hour later
  const late = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, appointments: [{ id: "ap1", contactId: "c1", createdAt: at(70) }] }, NOW);
  assert.equal(late.get("a"), undefined);
}

// ── the record created a beat before the dial (row inserted first) ───────────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, jobs: [{ id: "j1", contactId: "c1", createdAt: at(-1), scheduledAt: at(60) }] }, NOW);
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["job"]);
}

// ── two calls with the same person: the later one wins the overlap ───────────

{
  const calls = [call("first", "c1", 0, 5), call("second", "c1", 15, 20)];
  const out = assignCallEvents(calls, { ...empty, invoices: [{ id: "i1", contactId: "c1", createdAt: at(17), issuedAt: at(18), status: "AWAITING_PAYMENT" }] }, NOW);
  assert.equal(out.get("first"), undefined);
  assert.deepEqual(out.get("second")?.map((e) => e.kind), ["invoice_sent"]);
}

// ── someone else's quote never attaches ──────────────────────────────────────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, quotes: [{ id: "q9", contactId: "c2", createdAt: at(4), sentAt: at(6) }] }, NOW);
  assert.equal(out.get("a"), undefined);
  // …and a call with nobody attached gets nothing
  const nobody = assignCallEvents([call("x", null, 0, 10)], { ...empty, quotes: [{ id: "q9", contactId: "c1", createdAt: at(4), sentAt: at(6) }] }, NOW);
  assert.equal(nobody.size, 0);
}

// ── saved as a lead during the call, won ten minutes later ───────────────────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, contacts: [{ id: "c1", status: "ACTIVE", createdAt: at(3), wonAt: at(13) }] }, NOW);
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["new_lead", "became_client"]);
}

// ── saved straight as a client (wonAt stamped with creation) → one event ─────

{
  const out = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, contacts: [{ id: "c1", status: "ACTIVE", createdAt: at(3), wonAt: at(3) }] }, NOW);
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["new_client"]);
  const plain = assignCallEvents([call("a", "c1", 0, 10)], { ...empty, contacts: [{ id: "c1", status: "ACTIVE", createdAt: at(3), wonAt: null }] }, NOW);
  assert.deepEqual(plain.get("a")?.map((e) => e.kind), ["new_client"]);
}

// ── events come back in time order ───────────────────────────────────────────

{
  const out = assignCallEvents(
    [call("a", "c1", 0, 10)],
    {
      ...empty,
      quotes: [{ id: "q1", contactId: "c1", createdAt: at(8), sentAt: at(9) }],
      appointments: [{ id: "ap1", contactId: "c1", createdAt: at(2) }],
    },
    NOW
  );
  assert.deepEqual(out.get("a")?.map((e) => e.kind), ["appointment", "quote_sent"]);
}

console.log("call-events: all tests passed");
