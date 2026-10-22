/**
 * lib/ai-claude.ts — the Gemini-shape ↔ Messages API translation Atlas rides
 * on when AI_MODEL_ASSISTANT is a claude-* model.
 *
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-ai-claude.ts
 *
 * Pure checks always run. With ANTHROPIC_API_KEY set, one live round trip
 * (a tool call + its result) runs against claude-haiku-5-5 as well.
 */
import assert from "node:assert";
import { effortFor, fromClaudeContent, toClaudeMessages, toClaudeTools, aiChatClaude } from "../lib/ai-claude";
import type { AIContent } from "../lib/ai";

// 1. history → messages: ids kept, thinking replayed, empty text dropped, first turn is the user's
{
  const contents: AIContent[] = [
    { role: "model", parts: [{ text: "stray assistant turn from a sliced history" }] },
    { role: "user", parts: [{ text: "Set every active client's Tier to Silver" }] },
    {
      role: "model",
      parts: [
        { thinking: "need the clients first", signature: "sig1" },
        { text: "" },
        { functionCall: { name: "query_records", args: { entity: "clients", status: "ACTIVE" } }, id: "toolu_1", thoughtSignature: "x" },
      ],
    },
    { role: "user", parts: [{ functionResponse: { name: "query_records", response: { total: 2 } }, id: "toolu_1" }] },
  ];
  const m = toClaudeMessages(contents);
  assert.equal(m.length, 3, "leading assistant turn dropped");
  assert.equal(m[0].role, "user");
  const asst = m[1].content as { type: string }[];
  assert.deepEqual(asst.map((b) => b.type), ["thinking", "tool_use"], "thinking kept, empty text dropped");
  const res = m[2].content as { type: string; tool_use_id?: string; content?: string }[];
  assert.equal(res[0].type, "tool_result");
  assert.equal(res[0].tool_use_id, "toolu_1");
  assert.equal(res[0].content, JSON.stringify({ total: 2 }));
  console.log("ok 1: history → messages");
}

// 2. a Gemini-made call (no id) in the same turn gets a synthesized id its result reuses
{
  const contents: AIContent[] = [
    { role: "user", parts: [{ text: "hi" }] },
    { role: "model", parts: [{ functionCall: { name: "list_team", args: {} } }, { functionCall: { name: "get_schedule", args: { day: "today" } } }] },
    { role: "user", parts: [{ functionResponse: { name: "list_team", response: {} } }, { functionResponse: { name: "get_schedule", response: {} } }] },
  ];
  const m = toClaudeMessages(contents);
  const calls = m[1].content as { type: string; id: string }[];
  const results = m[2].content as { type: string; tool_use_id: string }[];
  assert.deepEqual(results.map((r) => r.tool_use_id), calls.map((c) => c.id), "results pair with calls in order");
  assert.ok(calls[0].id !== calls[1].id);
  console.log("ok 2: synthesized ids pair in order");
}

// 3. reply → parts, tools → input_schema, effort ladder
{
  const parts = fromClaudeContent([
    { type: "thinking", thinking: "t", signature: "s" },
    { type: "text", text: "Done." },
    { type: "tool_use", id: "toolu_9", name: "update_client", input: { clientId: "c1", fields: { Tier: "Silver" } } },
  ] as never);
  assert.deepEqual(parts, [
    { thinking: "t", signature: "s" },
    { text: "Done." },
    { functionCall: { name: "update_client", args: { clientId: "c1", fields: { Tier: "Silver" } } }, id: "toolu_9" },
  ]);
  const tools = toClaudeTools([
    { name: "a", description: "A", parameters: { type: "object", properties: { x: { type: "string" } }, required: ["x"] } },
    { name: "b", description: "B" },
  ]);
  assert.equal(tools[0].input_schema.type, "object");
  assert.deepEqual(tools[1].input_schema, { type: "object", properties: {} }, "no params → empty object schema");
  assert.equal(effortFor(undefined), "medium");
  assert.equal(effortFor(0), "low");
  assert.equal(effortFor(1024), "medium");
  assert.equal(effortFor(8192), "high");
  console.log("ok 3: reply parts, tool schemas, effort");
}

// 4. live: one tool round trip on Haiku (needs ANTHROPIC_API_KEY)
(async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("(live test skipped — set ANTHROPIC_API_KEY)");
    return;
  }
  const tools = [
    {
      name: "get_weather_stub",
      description: "Returns the weather for a city. Always call it when asked about weather.",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  ];
  const contents: AIContent[] = [{ role: "user", parts: [{ text: "What's the weather in Allen, Texas? Use the tool." }] }];
  const model = process.env.AI_MODEL_ASSISTANT?.startsWith("claude-") ? process.env.AI_MODEL_ASSISTANT : "claude-haiku-5-5";
  const usage: { tokensIn: number; tokensOut: number; tokensCached: number }[] = [];
  const first = await aiChatClaude(
    { system: "You are a terse test assistant.", systemVolatile: `Now: ${new Date().toISOString()}`, contents, tools, maxOutputTokens: 1024, thinkingBudget: 256, companyId: null, onUsage: (u) => usage.push(u) },
    model
  );
  assert.ok(first, "first call answered");
  const call = first!.find((p) => "functionCall" in p) as { functionCall: { name: string; args: Record<string, unknown> }; id?: string } | undefined;
  assert.ok(call && call.id, "model called the tool with an id");
  contents.push({ role: "model", parts: first! });
  contents.push({ role: "user", parts: [{ functionResponse: { name: call!.functionCall.name, response: { city: call!.functionCall.args.city, tempF: 71, sky: "clear" } }, id: call!.id }] });
  const second = await aiChatClaude(
    { system: "You are a terse test assistant.", systemVolatile: `Now: ${new Date().toISOString()}`, contents, tools, maxOutputTokens: 1024, thinkingBudget: 256, companyId: null, onUsage: (u) => usage.push(u) },
    model
  );
  assert.ok(second, "second call answered");
  const text = second!.map((p) => ("text" in p ? p.text : "")).join("");
  assert.ok(/71/.test(text), `answer uses the tool result: ${text}`);
  console.log(`ok 4: live round trip on ${model} — "${text.trim().slice(0, 80)}" (usage ${JSON.stringify(usage)})`);
})().then(() => console.log("\nAll Claude adapter tests passed."));
