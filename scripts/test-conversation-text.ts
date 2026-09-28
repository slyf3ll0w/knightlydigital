/**
 * Unit tests for the text a Messages reply goes out as (lib/portal-messages.ts
 * conversationText): bare in a conversation, one-time introduction on the
 * first business-initiated text.
 *   npx tsx scripts/test-conversation-text.ts   (needs a placeholder DATABASE_URL)
 */
import assert from "node:assert/strict";
import { conversationText } from "../lib/portal-messages";

const base = { companyName: "Lessly Holdings", senderName: "David Lessly" };

// A reply inside a conversation is just the message: no prefix, no tail
assert.equal(conversationText({ ...base, body: "  On my way, 15 min.  ", introduce: false }), "On my way, 15 min.");
assert.doesNotMatch(conversationText({ ...base, body: "Sounds good", introduce: false }), /STOP|Lessly/);

// The first text to someone who never wrote us says who it is and how to stop — once
const first = conversationText({ ...base, body: "Hi Maria, this is about your fence quote.", introduce: true });
assert.equal(first, "Hi Maria, this is about your fence quote.\n\n— David at Lessly Holdings. Reply STOP to opt out.");

// No sender name → the company alone
assert.match(conversationText({ companyName: "Acme Co", body: "Hello", introduce: true }), /— Acme Co\. Reply STOP to opt out\.$/);
assert.match(conversationText({ companyName: "Acme Co", senderName: "  ", body: "Hello", introduce: true }), /— Acme Co\./);

// Long conversational texts are bounded, not cut at the old 260
const long = "x".repeat(1500);
const out = conversationText({ ...base, body: long, introduce: false });
assert.ok(out.length <= 1000, `bounded (${out.length})`);
assert.ok(out.length > 260, "not clipped at 260");
assert.ok(out.endsWith("…"));

console.log("conversation-text: all assertions passed");
