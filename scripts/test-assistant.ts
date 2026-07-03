/**
 * Assistant tests. Run: npx tsx scripts/test-assistant.ts
 * Gating tests are pure. With LIVE_GEMINI_KEY + DATABASE_URL set, also runs a
 * real tool-calling conversation against the demo company (prints the reply
 * for an eyeball check — the point is verifying the Gemini function-calling
 * round-trip works end to end).
 */
import assert from "node:assert";
import { toolsForActor } from "../lib/assistant";
import type { Actor } from "../lib/permissions";

const base = { id: "u1", name: "Test", companyId: "c1", salesSeePayments: true };
const owner: Actor = { ...base, role: "OWNER" };
const tech: Actor = { ...base, role: "TECH" };
const sales: Actor = { ...base, role: "SALES" };
const salesNoMoney: Actor = { ...base, role: "SALES", salesSeePayments: false };

const names = (a: Actor) => toolsForActor(a).map((t) => t.decl.name).sort();

// 1. owner sees everything
assert.deepEqual(
  names(owner),
  [
    "add_client_note", "business_summary", "cancel_appointment", "create_client",
    "create_invoice", "create_job", "create_quote", "create_request",
    "get_client_activity", "get_company_settings", "get_price_book", "get_schedule",
    "list_agreements", "list_money", "list_pipeline", "list_subscriptions",
    "record_payment", "reschedule_appointment", "reschedule_job",
    "schedule_appointment", "search_clients", "update_client", "update_job_status",
    "whats_needing_attention",
  ],
  "owner gets all tools"
);
console.log("ok 1: owner sees all 24 tools");

// 2. tech: schedule/jobs reads + the job actions techs can do, nothing else
assert.deepEqual(
  names(tech),
  ["get_schedule", "list_pipeline", "reschedule_job", "update_job_status", "whats_needing_attention"],
  "tech tools"
);
console.log("ok 2: tech limited to schedule + job tools");

// 3. sales: sell + money tools (toggle on) incl. actions, but no settings or job actions
{
  const n = names(sales);
  assert.ok(n.includes("search_clients") && n.includes("list_money") && n.includes("record_payment"));
  assert.ok(n.includes("create_client") && n.includes("schedule_appointment") && n.includes("cancel_appointment"));
  assert.ok(!n.includes("get_company_settings"), "sales can't read settings");
  assert.ok(!n.includes("create_job") && !n.includes("update_job_status"), "sales can't run job actions");
  console.log("ok 3: sales sees sell + money + action tools, no settings/job actions");
}

// 4. salesSeePayments=false strips the money tools (reads AND writes)
{
  const n = names(salesNoMoney);
  assert.ok(!n.includes("list_money") && !n.includes("business_summary") && !n.includes("record_payment"));
  assert.ok(!n.includes("list_subscriptions"));
  assert.ok(n.includes("search_clients") && n.includes("create_quote"));
  console.log("ok 4: salesSeePayments=false removes money reads and writes");
}

// 5. optional live round-trip
(async () => {
  const liveKey = process.env.LIVE_GEMINI_KEY;
  if (!liveKey || !process.env.DATABASE_URL) {
    console.log("(live test skipped — set LIVE_GEMINI_KEY and DATABASE_URL)");
    console.log("\nAll assistant gating tests passed.");
    return;
  }
  process.env.GEMINI_API_KEY = liveKey;
  const { prisma } = await import("../lib/db");
  const { runAssistant } = await import("../lib/assistant");
  const co = await prisma.company.findFirst({
    where: { slug: "streamflare-demo-co" },
    select: { id: true },
  });
  if (!co) { console.log("live: demo co not found"); return; }
  const demoOwner = await prisma.user.findFirst({
    where: { companyId: co.id, role: "OWNER" },
    select: { id: true, name: true },
  });
  const actor: Actor = {
    id: demoOwner!.id, name: demoOwner!.name, role: "OWNER",
    companyId: co.id, salesSeePayments: true,
  };
  for (const q of [
    "Has Laura signed her agreement yet?", // the exact failure David hit — partial name + agreements
    "What needs my attention right now?",
    "Add a new client named Test Wizard, phone 555-0100, then tell me what you did.",
  ]) {
    const r = await runAssistant(actor, [{ role: "user", content: q }]);
    console.log(`\nQ: ${q}\nA: ${r?.reply ?? "(null — FAILED)"}`);
    if (r && r.proposals.length > 0) {
      console.log(`PROPOSALS: ${r.proposals.map((p) => `${p.kind}: ${p.title} -> ${p.method} ${p.endpoint}`).join(" | ")}`);
    }
    assert.ok(r?.reply, "live reply expected");
  }
  await prisma.$disconnect();
  console.log("\nAll assistant tests passed (incl. live round-trip).");
})();
