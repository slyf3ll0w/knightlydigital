/**
 * lib/toast.ts — `kindForUrl`, the one mapping from a notice's URL to the
 * icon the bell and the live cards wear.
 *   npx tsx scripts/test-toast.ts
 */
import assert from "node:assert/strict";
import { kindForUrl, toast } from "../lib/toast";

const cases: Array<[string, ReturnType<typeof kindForUrl>]> = [
  ["/app/chat", "chat"],
  ["/app/chat?c=abc", "chat"],
  ["/app/leads", "lead"],
  ["/app/leads/123", "lead"],
  ["/app/requests/123", "request"],
  ["/app/quotes/123", "quote"],
  ["/app/contracts/123", "quote"],
  ["/app/invoices/123", "invoice"],
  ["/app/payments", "payment"],
  ["/app/schedule?d=2026-10-14", "booking"],
  ["/app/appointments/123", "booking"],
  ["/app/jobs/123", "booking"],
  ["/app/calls/123", "call"],
  ["/app/tasks", "task"],
  ["/app/messages/thread/123", "message"],
  ["/app/automations/123", "automation"],
  ["/app/dashboard", "automation"],
  ["", "automation"],
];
for (const [url, kind] of cases) assert.equal(kindForUrl(url), kind, url);

// An appointment the booking expiry push links (audit 2026-10-14 item 16) wears the booking glyph
assert.equal(kindForUrl("/app/appointments/clx123"), "booking");

// Without a window (server render) the toast is a no-op, not a throw
assert.doesNotThrow(() => toast("Saved"));

console.log("toast: all assertions passed");
