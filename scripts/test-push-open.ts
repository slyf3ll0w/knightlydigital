/**
 * Notification tap routing (lib/push-open.ts): a tap for the signed-in
 * membership stays in-app (router.push), a tap for another membership goes
 * through /app/open, anything outside /app is ignored.
 *
 *   npx tsx scripts/test-push-open.ts
 */
import assert from "node:assert/strict";
import { resolvePushOpen, safeAppPath } from "../lib/push-open";

const thread = "/app/messages/thread/abc123";
const wrapped = (u: string) => `/app/open?u=${u}&to=${encodeURIComponent(thread)}`;

// Same membership → straight to the destination, no /app/open
assert.deepEqual(resolvePushOpen(wrapped("user1"), "user1"), { kind: "push", to: thread });
// Membership unknown yet (session still loading) → in-app too; the switch would no-op anyway
assert.deepEqual(resolvePushOpen(wrapped("user1"), null), { kind: "push", to: thread });
// No membership named → in-app
assert.deepEqual(resolvePushOpen(`/app/open?to=${encodeURIComponent(thread)}`, "user1"), { kind: "push", to: thread });
// Another membership → the full /app/open switch
assert.deepEqual(resolvePushOpen(wrapped("user2"), "user1"), { kind: "assign", url: wrapped("user2") });
// A plain in-app url (older payloads, action buttons) → in-app
assert.deepEqual(resolvePushOpen("/app/calls/xyz", "user1"), { kind: "push", to: "/app/calls/xyz" });
assert.deepEqual(resolvePushOpen("/app", "user1"), { kind: "push", to: "/app" });
// Outside the app, or empty → ignored
assert.deepEqual(resolvePushOpen("https://evil.example/app/x", "user1"), { kind: "ignore" });
assert.deepEqual(resolvePushOpen("/hub/tok/messages", "user1"), { kind: "ignore" });
assert.deepEqual(resolvePushOpen("", "user1"), { kind: "ignore" });
assert.deepEqual(resolvePushOpen(null, "user1"), { kind: "ignore" });
// /app/open with a foreign `to` never becomes an open redirect
assert.deepEqual(resolvePushOpen("/app/open?to=https%3A%2F%2Fevil.example", "user1"), { kind: "push", to: "/app/dashboard" });
assert.deepEqual(resolvePushOpen("/app/open?to=%2Fhub%2Fx", "user1"), { kind: "push", to: "/app/dashboard" });
assert.deepEqual(resolvePushOpen("/app/open", "user1"), { kind: "push", to: "/app/dashboard" });

assert.equal(safeAppPath("/app/jobs?status=ACTIVE"), "/app/jobs?status=ACTIVE");
assert.equal(safeAppPath('/app/x"><script>'), "/app/xscript");
assert.equal(safeAppPath("//evil.example"), "/app/dashboard");
assert.equal(safeAppPath(undefined), "/app/dashboard");

console.log("test-push-open: ok");
