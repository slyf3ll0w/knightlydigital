/**
 * Assistant tests. Run: npx tsx scripts/test-assistant.ts
 * Gating tests are pure. With LIVE_GEMINI_KEY + DATABASE_URL set, also runs a
 * real tool-calling conversation against the demo company (prints the reply
 * for an eyeball check — the point is verifying the Gemini function-calling
 * round-trip works end to end).
 */
import assert from "node:assert";
import { mergeBulkProposals, toolsForActor, type Proposal } from "../lib/assistant";
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
    "add_client_note", "add_team_member", "business_summary", "cancel_appointment",
    "convert_quote", "create_client", "create_invoice", "create_job", "create_quote",
    "create_request", "delete_client", "delete_expense", "delete_payment", "edit_payment",
    "get_client_activity", "get_company_settings", "get_price_book", "get_schedule",
    "list_agreements", "list_clients", "list_expenses", "list_money", "list_pipeline",
    "list_subscriptions", "list_team", "log_expense", "record_payment",
    "reschedule_appointment", "reschedule_job", "schedule_appointment", "search_clients",
    "send_portal_invite", "set_business_hours", "set_client_status", "update_client",
    "update_company_settings", "update_expense", "update_invoice_status",
    "update_job_status", "update_quote_status", "update_service_price",
    "update_team_member", "update_team_policy", "whats_needing_attention",
  ],
  "owner gets all tools"
);
console.log("ok 1: owner sees all 44 tools");

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
  assert.ok(!n.includes("delete_client") && !n.includes("log_expense") && !n.includes("update_service_price"),
    "manager-only actions hidden from sales");
  assert.ok(!n.includes("edit_payment") && !n.includes("delete_payment"),
    "sales can't refund (edit/remove payments)");
  assert.ok(!n.includes("list_expenses") && !n.includes("update_expense") && !n.includes("delete_expense"),
    "expense tools are manager-only");
  assert.ok(n.includes("list_clients"), "sales can list clients (scoped to their leads)");
  assert.ok(
    !n.includes("list_team") && !n.includes("add_team_member") && !n.includes("update_team_member") &&
    !n.includes("update_team_policy") && !n.includes("update_company_settings") && !n.includes("set_business_hours"),
    "team + settings tools hidden from sales");
  assert.ok(n.includes("update_quote_status"), "sales can mark quotes sent/approved");
  assert.ok(n.includes("update_invoice_status"), "sales w/ payments toggle can mark invoices sent");
  console.log("ok 3: sales sees sell + money + action tools, no settings/job/manager/team actions");
}

// 4. salesSeePayments=false strips the money tools (reads AND writes)
{
  const n = names(salesNoMoney);
  assert.ok(!n.includes("list_money") && !n.includes("business_summary") && !n.includes("record_payment"));
  assert.ok(!n.includes("list_subscriptions"));
  assert.ok(!n.includes("update_invoice_status"), "no invoice status without money access");
  assert.ok(n.includes("search_clients") && n.includes("create_quote"));
  console.log("ok 4: salesSeePayments=false removes money reads and writes");
}

// 5. bulk proposals of the same kind merge into ONE batch card; danger never merges
{
  const mk = (id: string, kind: string, extra?: Partial<Proposal>): Proposal => ({
    id, kind, title: `t-${id}`, lines: [`l-${id}`],
    endpoint: `/api/x/${id}`, method: "PATCH", payload: { id }, ...extra,
  });
  const merged = mergeBulkProposals([
    mk("a", "update_client"),
    mk("b", "create_quote"),
    mk("c", "update_client"),
    mk("d", "update_client"),
    mk("e", "delete_client", { danger: true, confirmText: "X" }),
    mk("f", "delete_client", { danger: true, confirmText: "Y" }),
  ]);
  assert.equal(merged.length, 4, "3 update_client → 1 batch; quote + 2 danger stay solo");
  const batch = merged.find((p) => p.batch);
  assert.ok(batch && batch.batch!.length === 3 && batch.title.startsWith("3 changes"));
  assert.deepEqual(batch!.batch!.map((b) => b.payload.id), ["a", "c", "d"], "order preserved");
  assert.equal(merged.filter((p) => p.danger).length, 2, "danger cards untouched");
  const single = mergeBulkProposals([mk("a", "update_client")]);
  assert.ok(single.length === 1 && !single[0].batch, "singles pass through unchanged");
  console.log("ok 5: same-kind proposals merge into one batch card");
}

// 6. optional live round-trip
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
