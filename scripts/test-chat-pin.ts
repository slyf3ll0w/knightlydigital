/**
 * The chat panes' "stay at the newest message" rule (lib/chat-pin.ts,
 * ticket #txii6p). Plain node:  npx tsx scripts/test-chat-pin.ts
 */
import assert from "node:assert/strict";
import { stickAfterScroll } from "../lib/chat-pin";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const pane = (scrollTop: number, scrollHeight = 2000, clientHeight = 600) => ({ scrollTop, scrollHeight, clientHeight });

test("at the bottom = following", () => {
  assert.equal(stickAfterScroll(pane(1400), 1000, false), true);
  assert.equal(stickAfterScroll(pane(1340), 1400, true), true);
});

test("our own glide down never switches following off part-way", () => {
  assert.equal(stickAfterScroll(pane(900), 600, true), true);
});

test("the user scrolling up away from the bottom stops following", () => {
  assert.equal(stickAfterScroll(pane(800), 1400, true), false);
});

test("scrolling down short of the bottom keeps whatever was decided", () => {
  assert.equal(stickAfterScroll(pane(900), 800, false), false);
});

console.log(`\n${passed} tests passed`);
