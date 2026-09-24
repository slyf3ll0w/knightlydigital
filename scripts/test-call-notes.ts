/**
 * Unit tests for the pure parts of lib/call-notes.ts (Atlas call notes):
 * transcript lines from Telnyx segments, the capped append, the prompt.
 *   npx tsx scripts/test-call-notes.ts
 * Needs a placeholder DATABASE_URL (the module imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import { TRANSCRIPT_MAX_CHARS, appendTranscriptText, atlasNotesPrompt, transcriptLine } from "../lib/call-notes";

// ── transcript lines ─────────────────────────────────────────────────────────
// Transcription runs on the customer leg: inbound = them, outbound = us.
assert.equal(transcriptLine("inbound", "  yes I need   the gutters done "), "Them: yes I need the gutters done");
assert.equal(transcriptLine("outbound", "Sure, what's the address?"), "You: Sure, what's the address?");
assert.equal(transcriptLine(undefined, "hello"), "hello");
assert.equal(transcriptLine("inbound", "   "), null);
assert.equal(transcriptLine("inbound", null), null);

// ── append + cap ─────────────────────────────────────────────────────────────
assert.equal(appendTranscriptText(null, "Them: hi"), "Them: hi\n");
assert.equal(appendTranscriptText("Them: hi\n", "You: hello"), "Them: hi\nYou: hello\n");
{
  const full = "x".repeat(TRANSCRIPT_MAX_CHARS);
  assert.equal(appendTranscriptText(full, "more"), full, "a full transcript takes nothing more");
  const nearly = "x".repeat(TRANSCRIPT_MAX_CHARS - 3);
  assert.equal(appendTranscriptText(nearly, "abcdef").length, TRANSCRIPT_MAX_CHARS);
}

// ── the prompt ───────────────────────────────────────────────────────────────
{
  const { system, prompt } = atlasNotesPrompt("Them: I need a quote for a fence\nYou: What length?\n", {
    direction: "INBOUND",
    party: "Maria Lopez",
    standing: "lead",
    businessName: "Streamflaire",
    assistantName: "Atlas",
    durationSec: 95,
  });
  assert.match(system, /You are Atlas/);
  assert.match(system, /Streamflaire/);
  assert.match(system, /never invent/);
  assert.match(prompt, /^Incoming call from Maria Lopez \(lead\) · 1:35 on the line\./);
  assert.match(prompt, /Them: I need a quote for a fence/);
  assert.match(prompt, /Write the call notes\.$/);
}
{
  const { prompt } = atlasNotesPrompt("You: hello?\n", {
    direction: "OUTBOUND",
    party: "(469) 833-5853",
    standing: "",
    businessName: "Lessly Holdings",
    assistantName: "Nova",
    durationSec: null,
  });
  assert.match(prompt, /^Outgoing call to \(469\) 833-5853\./, "no standing, no duration → plain first line");
}

console.log("test-call-notes: ok");
