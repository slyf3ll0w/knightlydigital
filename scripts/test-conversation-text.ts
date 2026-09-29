/**
 * Unit tests for the text a Messages reply goes out as (lib/portal-messages.ts
 * conversationText): the message itself, nothing added, bounded in length.
 *   npx tsx scripts/test-conversation-text.ts   (needs a placeholder DATABASE_URL)
 */
import assert from "node:assert/strict";
import { conversationText } from "../lib/portal-messages";

// A reply is just the message: no company prefix, no opt-out tail, trimmed
assert.equal(conversationText("  On my way, 15 min.  "), "On my way, 15 min.");
assert.doesNotMatch(conversationText("Sounds good"), /STOP|:/);

// Multi-line messages keep their shape
assert.equal(conversationText("Two things:\n1. gate code\n2. dog"), "Two things:\n1. gate code\n2. dog");

// Long conversational texts are bounded, not cut at the old 260
const out = conversationText("x".repeat(1500));
assert.ok(out.length <= 1000, `bounded (${out.length})`);
assert.ok(out.length > 260, "not clipped at 260");
assert.ok(out.endsWith("…"));
assert.equal(conversationText("y".repeat(1000)).length, 1000, "exactly the cap passes untouched");

console.log("conversation-text: all assertions passed");
