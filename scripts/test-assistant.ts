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
    "business_summary", "get_client_activity", "get_company_settings",
    "get_price_book", "get_schedule", "list_money", "list_pipeline", "search_clients",
  ],
  "owner gets all tools"
);
console.log("ok 1: owner sees all 8 tools");

// 2. tech: schedule + pipeline(jobs) only — no clients, money, pricing, settings
assert.deepEqual(names(tech), ["get_schedule", "list_pipeline"], "tech tools");
console.log("ok 2: tech limited to schedule + jobs");

// 3. sales: sell tools + money (toggle on) but no settings
{
  const n = names(sales);
  assert.ok(n.includes("search_clients") && n.includes("list_money") && n.includes("business_summary"));
  assert.ok(!n.includes("get_company_settings"), "sales can't read settings");
  console.log("ok 3: sales sees sell + money tools, no settings");
}

// 4. salesSeePayments=false strips the money tools
{
  const n = names(salesNoMoney);
  assert.ok(!n.includes("list_money") && !n.includes("business_summary"));
  assert.ok(n.includes("search_clients"));
  console.log("ok 4: salesSeePayments=false removes money tools");
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
    "What's on the schedule in the next 7 days?",
    "Do we have any overdue invoices?",
    "What services do we offer online booking for, and how is booking configured?",
  ]) {
    const reply = await runAssistant(actor, [{ role: "user", content: q }]);
    console.log(`\nQ: ${q}\nA: ${reply ?? "(null — FAILED)"}`);
    assert.ok(reply, "live reply expected");
  }
  await prisma.$disconnect();
  console.log("\nAll assistant tests passed (incl. live round-trip).");
})();
