/**
 * Talking to Atlas — the pure helpers (lib/voice-chat-shared.ts).
 *   npx tsx scripts/test-voice-chat.ts
 */
import assert from "node:assert";
import { cardsSpeech, isAffirmative, isNegative, isStopPhrase, latestPendingTurn, spokenForm, supersededBy, supersedeKey, transcribeMime } from "../lib/voice-chat-shared";

// 1. yes / no / stop
for (const y of ["yes", "Yeah do it", "yep.", "Sure, go ahead", "confirm", "okay", "Yes please", "I confirm.", "Yes, send it!", "go ahead, thanks", "yeah yeah do it", "That's right"]) {
  assert.ok(isAffirmative(y), `yes: ${y}`);
}
for (const n of ["no", "Nope", "cancel that", "never mind", "leave it"]) assert.ok(isNegative(n), `no: ${n}`);
assert.ok(!isAffirmative("yesterday's jobs"), "a word that starts with yes isn't a yes");
// A yes that goes on is an instruction, not a confirmation (2026-11-02).
for (const notYes of [
  "Yes, but change the subject",
  "yes and also email Bob",
  "Yes except make it Monday",
  "yes, Monday",
  "Yeah, send it to her work email instead",
  "sure thing boss",
  "okay what's on the schedule",
  "please",
  "thanks",
  "",
]) {
  assert.ok(!isAffirmative(notYes), `not a bare yes: "${notYes}"`);
}
assert.ok(!isNegative("note that down"), "note isn't no");
assert.ok(isStopPhrase("stop") && isStopPhrase("that's all, thanks") && isStopPhrase("I'm done"));
assert.ok(!isStopPhrase("stop the Hendersons' subscription for the winter"), "a long sentence with stop in it is a request");
console.log("ok 1: yes / no / stop");

// 1b. a spoken yes reaches only the latest reply that still has a card waiting
{
  type C = { id: string; kind: string; endpoint: string; state: string };
  const card = (id: string, state = "pending", kind = "update_job", endpoint = "/api/app/jobs/ckjob000000000000000001"): C => ({ id, kind, endpoint, state });
  assert.deepEqual(latestPendingTurn([]), { index: -1, cards: [] });
  assert.deepEqual(latestPendingTurn([{ proposals: [card("a", "done")] }, {}]), { index: -1, cards: [] }, "nothing waiting");
  const msgs = [
    { proposals: [card("old")] }, // an older draft, still pending
    { proposals: [] }, // a question in between
    { proposals: [card("new1"), card("new2", "done"), card("new3")] },
    {}, // "what's on Friday?" — no cards, doesn't hide the ones before it
  ];
  const latest = latestPendingTurn(msgs);
  assert.equal(latest.index, 2);
  assert.deepEqual(latest.cards.map((c) => c.id), ["new1", "new3"], "only the latest reply's pending cards; the older draft is left alone");
  console.log("ok 1b: latest pending turn");

  // 1c. a fresh draft for the same record replaces the older pending one
  const sarah = "/api/app/contacts/cksarah00000000000000001/message";
  const bob = "/api/app/contacts/ckbob0000000000000000001/message";
  assert.equal(supersedeKey({ kind: "email_client", endpoint: sarah }), `email_client:${sarah}`);
  assert.equal(supersedeKey({ kind: "email_client", endpoint: `${sarah}?x=1` }), `email_client:${sarah}`, "query string ignored");
  assert.equal(supersedeKey({ kind: "create_quote", endpoint: "/api/app/quotes" }), null, "a create names no record");
  assert.equal(supersedeKey({ kind: "update_job", endpoint: "/api/app/jobs/ckjob000000000000000001", batch: [] }), null, "batches never supersede");
  const older = [
    card("friday", "pending", "email_client", sarah),
    card("bobmail", "pending", "email_client", bob),
    card("sent", "done", "email_client", sarah),
    card("job", "pending", "update_job", "/api/app/jobs/ckjob000000000000000001"),
  ];
  const replaced = supersededBy(older, [card("monday", "pending", "email_client", sarah)]);
  assert.deepEqual(replaced.map((c) => c.id), ["friday"], "only the pending email to the same person");
  assert.deepEqual(supersededBy(older, [card("q", "pending", "create_quote", "/api/app/quotes")]), [], "a new quote replaces nothing");
  console.log("ok 1c: superseded drafts");
}

// 2. spoken form: links and paths out, bullets flattened, long answers cut
const spoken = spokenForm("Here's the quote link: https://workbenchfsm.com/quote/abc123\n- Panel upgrade $2,400\n- Permit $180\nOpen /app/quotes/q1 to edit.");
assert.ok(!/https?:/.test(spoken) && !/\/app\//.test(spoken), "no urls or paths");
assert.ok(spoken.includes("the link in the chat") && spoken.includes("the page in the chat"));
assert.ok(!spoken.includes("- "), "bullets gone");
const long = spokenForm(Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(" "));
assert.ok(long.length < 1000 && long.endsWith("The rest is in the chat."), "cut with a pointer");
console.log("ok 2: spoken form");

// 3. card speech: ordinary → voice-confirmable; guarded → tap
assert.deepEqual(cardsSpeech([]), { text: "", voiceConfirmable: false });
const one = cardsSpeech([{ title: "Update Sarah Henderson", guarded: false }]);
assert.ok(one.voiceConfirmable && /Say yes to confirm/.test(one.text) && one.text.includes("Update Sarah Henderson"));
const many = cardsSpeech([{ title: "A", guarded: false }, { title: "B", guarded: false }, { title: "Refund $40", guarded: true }]);
assert.ok(many.voiceConfirmable && /2 changes/.test(many.text) && /Refund \$40/.test(many.text) && /tap in the chat/.test(many.text));
const guardedOnly = cardsSpeech([{ title: "Delete client", guarded: true }]);
assert.ok(!guardedOnly.voiceConfirmable && /needs a tap/.test(guardedOnly.text));
console.log("ok 3: card speech");

// 4. recorder mime → Gemini mime
assert.equal(transcribeMime("audio/webm;codecs=opus"), "audio/webm");
assert.equal(transcribeMime("audio/mp4"), "audio/m4a");
assert.equal(transcribeMime(""), "audio/webm");
console.log("ok 4: transcribe mime");

console.log("\nAll voice-chat tests passed.");
