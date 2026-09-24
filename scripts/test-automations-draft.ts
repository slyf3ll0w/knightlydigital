/**
 * Atlas automation drafter — the system prompt (lib/automations-draft.ts).
 * Pure: no model call, no DB query (the module constructs the Prisma client
 * at load, so a placeholder DATABASE_URL is enough).
 * Run: npx tsx scripts/test-automations-draft.ts
 */
import assert from "node:assert";
import { ACTION_TYPES, TRIGGER_NAMES, customFieldKey } from "../lib/automations";
import { draftSystem, type DraftCompanyFacts } from "../lib/automations-draft";

const facts: DraftCompanyFacts = {
  stages: ["New", "Contacted", "Estimate Scheduled", "Quote Sent"],
  customFields: [{ id: "cf_1", label: "Gate code" }],
  users: [{ id: "u_1", name: "Maria Lopez" }],
  agreementTemplates: [{ id: "ct_1", name: "Service agreement" }],
  emailLive: true,
  smsLive: false,
  reviewLinkSet: false,
  quickbooksConnected: false,
  assistantName: "Atlas",
};

// 1. a new-rule prompt names every trigger and every action, and this company's facts
{
  const sys = draftSystem(facts, null);
  for (const t of TRIGGER_NAMES) assert.ok(sys.includes(`  ${t} —`), `trigger ${t} listed`);
  for (const a of ACTION_TYPES) assert.ok(sys.includes(`  ${a}(`), `action ${a} listed`);
  assert.ok(sys.includes('"Estimate Scheduled"'), "stage names quoted");
  assert.ok(sys.includes(`${customFieldKey("Gate code")} (id cf_1`), "custom field key + id");
  assert.ok(sys.includes("Maria Lopez (id u_1)"), "team member id");
  assert.ok(sys.includes("Service agreement (id ct_1)"), "agreement template id");
  assert.ok(sys.includes("texting: NOT live yet"), "sms state");
  assert.ok(sys.includes("review link: not set"), "review link state");
  assert.ok(sys.includes("This is a NEW rule"), "new-rule instruction");
  assert.ok(!sys.includes("CURRENT RULE"), "no current rule on a new draft");
  assert.ok(sys.includes("data_<key>"), "webhook fields explained");
  assert.ok(sys.includes("atlas_text"), "atlas_text explained");
  console.log("ok 1: new-rule system prompt is complete");
}

// 2. a change carries the current rule and the keep-everything instruction
{
  const sys = draftSystem(facts, {
    name: "5-day quote follow-up",
    description: "Nudge quiet quotes",
    spec: { version: 2, trigger: { event: "quote.unanswered", days: 5 }, steps: [{ type: "email_client", subject: "Still thinking it over?", body: "Hi {client_first_name}" }] },
  });
  assert.ok(sys.includes("THIS IS A CHANGE"), "change instruction");
  assert.ok(sys.includes("CURRENT RULE"), "current rule header");
  assert.ok(sys.includes('"quote.unanswered"'), "current spec embedded");
  assert.ok(sys.includes("5-day quote follow-up"), "current name embedded");
  console.log("ok 2: change prompt embeds the current rule");
}

// 3. an empty company says so instead of listing nothing
{
  const sys = draftSystem({ ...facts, stages: [], customFields: [], users: [], agreementTemplates: [] }, null);
  assert.ok(sys.includes("never use move_lead"), "no stages → no move_lead");
  assert.ok(sys.includes("never use create_agreement"), "no templates → no create_agreement");
  console.log("ok 3: empty company facts");
}

console.log("all automation draft tests passed");
