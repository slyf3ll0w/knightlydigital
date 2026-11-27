import assert from "node:assert/strict";
import { stagesOfBoard, MAX_BOARDS, MAIN_BOARD_NAME } from "../lib/pipeline";

// The stages one board shows: its own columns in order, then the shared Converted section.
const stages = [
  { id: "m1", boardId: null, isConverted: false },
  { id: "b1", boardId: "B", isConverted: false },
  { id: "m2", boardId: null, isConverted: false },
  { id: "b2", boardId: "B", isConverted: false },
  { id: "conv", boardId: null, isConverted: true },
];
assert.deepEqual(stagesOfBoard(stages, null).map((s) => s.id), ["m1", "m2", "conv"]);
assert.deepEqual(stagesOfBoard(stages, "B").map((s) => s.id), ["b1", "b2", "conv"]);
// A board with no columns left still closes with Converted
assert.deepEqual(stagesOfBoard(stages, "nope").map((s) => s.id), ["conv"]);
assert.ok(MAX_BOARDS >= 1);
assert.equal(MAIN_BOARD_NAME, "Main board");
console.log("lead-boards: all passed");
