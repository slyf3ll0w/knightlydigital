/**
 * Unit tests for lib/assistant/progress.ts — the one-line status the drawer
 * shows while Atlas works.   npx tsx scripts/test-assistant-progress.ts
 */
import assert from "node:assert/strict";
import { describeToolCall, describeToolCalls } from "../lib/assistant/progress";

assert.equal(describeToolCall("list_clients"), "Looking up clients…");
assert.equal(describeToolCall("search_jobs"), "Looking up jobs…");
assert.equal(describeToolCall("get_quote_line_items"), "Looking up quote line items…");
assert.equal(describeToolCall("create_quote"), "Drafting quote…");
assert.equal(describeToolCall("stage_job_update"), "Drafting job update…");
assert.equal(describeToolCall("update_contact"), "Preparing changes to contact…");
assert.equal(describeToolCall("assign_job"), "Preparing changes to job…");
assert.equal(describeToolCall("send_invoice"), "Preparing to send invoice…");
assert.equal(describeToolCall("delete_client"), "Preparing to remove client…");
assert.equal(describeToolCall("optimize_route"), "Working out route…");
assert.equal(describeToolCall("help_search"), "Checking the Help Center…");
assert.equal(describeToolCall("queue_next_step"), "Lining up the next step…");
// the page designer's tools (lib/assistant/design.ts)
assert.equal(describeToolCall("get_client_theme"), "Looking at your client pages…");
assert.equal(describeToolCall("draft_client_theme"), "Drafting a new look…");
assert.equal(describeToolCall("publish_client_theme"), "Preparing to publish the new look…");
assert.equal(describeToolCall("revert_client_theme"), "Preparing to put a look back…");
// An unrecognised shape still reads as a sentence, never as a raw identifier.
assert.equal(describeToolCall("manage_pipeline_stage"), "Working on manage pipeline stage…");
assert.equal(describeToolCall("list"), "Looking up…");

// Rounds collapse to one line.
assert.equal(describeToolCalls([]), "Thinking…");
assert.equal(describeToolCalls(["list_clients"]), "Looking up clients…");
assert.equal(describeToolCalls(["stage_job_update", "stage_job_update", "stage_job_update"]), "Drafting job update (3)…");
assert.equal(describeToolCalls(["list_clients", "search_jobs"]), "Looking up clients (2 steps)…");

console.log("assistant-progress: all assertions passed");
