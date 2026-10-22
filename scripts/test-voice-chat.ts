/**
 * Talking to Atlas — the pure helpers (lib/voice-chat-shared.ts).
 *   npx tsx scripts/test-voice-chat.ts
 */
import assert from "node:assert";
import { cardsSpeech, isAffirmative, isNegative, isStopPhrase, spokenForm, transcribeMime } from "../lib/voice-chat-shared";

// 1. yes / no / stop
for (const y of ["yes", "Yeah do it", "yep.", "Sure, go ahead", "confirm", "okay"]) assert.ok(isAffirmative(y), `yes: ${y}`);
for (const n of ["no", "Nope", "cancel that", "never mind", "leave it"]) assert.ok(isNegative(n), `no: ${n}`);
assert.ok(!isAffirmative("yesterday's jobs"), "a word that starts with yes isn't a yes");
assert.ok(!isNegative("note that down"), "note isn't no");
assert.ok(isStopPhrase("stop") && isStopPhrase("that's all, thanks") && isStopPhrase("I'm done"));
assert.ok(!isStopPhrase("stop the Hendersons' subscription for the winter"), "a long sentence with stop in it is a request");
console.log("ok 1: yes / no / stop");

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
