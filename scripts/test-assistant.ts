/**
 * Assistant tests. Run: npx tsx scripts/test-assistant.ts
 * Gating tests are pure. With LIVE_GEMINI_KEY + DATABASE_URL set, also runs a
 * real tool-calling conversation against the demo company (prints the reply
 * for an eyeball check — the point is verifying the Gemini function-calling
 * round-trip works end to end).
 */
import assert from "node:assert";
import { mergeBulkProposals, toolsForActor, type Proposal, type ToolCtx } from "../lib/assistant";
import {
  planPeriod,
  planBalance,
  trialBalance,
  centsToAtlasTokens,
  turnCostCents,
  ATLAS_PLAN_TOKENS,
  ATLAS_TRIAL_TOKENS,
} from "../lib/assistant-billing";
import { atlasAccess } from "../lib/assistant-access";
import type { Actor } from "../lib/permissions";

const base = { id: "u1", name: "Test", companyId: "c1", salesSeePayments: true };
const owner: Actor = { ...base, role: "OWNER" };
const tech: Actor = { ...base, role: "TECH" };
const sales: Actor = { ...base, role: "SALES" };
const salesNoMoney: Actor = { ...base, role: "SALES", salesSeePayments: false };

const names = (a: Actor) => toolsForActor(a).map((t) => t.decl.name).sort();

// 1. owner sees everything (v8: 96 tools — records, client extras, field ops, money extras, queue_next_step)
assert.deepEqual(
  names(owner),
  [
    "add_client_note", "add_job_note", "add_team_member", "assign_client",
    "business_summary", "cancel_appointment", "charge_saved_card", "clock",
    "close_lead", "collect_deposit", "convert_quote", "create_agreement_template",
    "create_client", "create_invoice", "create_job", "create_quote",
    "create_request", "create_service", "delete_record", "duplicate_document",
    "edit_payment", "email_client", "email_document", "export_data",
    "find_a_time", "get_client_activity", "get_client_details",
    "get_company_settings", "get_document", "get_job_checklist",
    "get_lead_board", "get_price_book", "get_route_plan", "get_schedule",
    "get_statement", "list_agreement_templates", "list_agreements",
    "list_clients", "list_expenses", "list_money", "list_pipeline",
    "list_subscriptions", "list_team", "log_expense", "manage_address",
    "manage_client_fields", "manage_lead_webhook", "manage_person",
    "manage_pipeline_stage", "manage_recurring_expense", "manage_saved_card",
    "manage_subscription", "manage_time_block", "manage_time_entry",
    "manage_web_form", "move_lead", "optimize_route", "post_team_message",
    "query_records", "queue_next_step", "quickbooks", "record_job_signoff", "record_payment",
    "refund_payment", "reply_in_portal", "report", "request_review",
    "respond_to_booking", "run_recurring_billing", "schedule_appointment",
    "search_clients", "send_agreement", "send_on_my_way", "send_payout",
    "send_portal_invite", "set_business_hours", "set_client_status", "team_map",
    "undo_import", "update_agreement", "update_agreement_template",
    "update_appointment", "update_checklist_item", "update_client",
    "update_client_note", "update_company_settings", "update_expense",
    "update_invoice", "update_job", "update_job_status", "update_quote",
    "update_request", "update_service", "update_team_member",
    "update_team_policy", "whats_needing_attention",
  ],
  "owner gets all tools"
);
console.log(`ok 1: owner sees all ${names(owner).length} tools`);

// 2. tech: schedule/jobs reads + the field actions techs can do, nothing else
assert.deepEqual(
  names(tech),
  [
    "add_job_note", "clock", "export_data", "find_a_time", "get_document",
    "get_job_checklist", "get_route_plan", "get_schedule", "list_pipeline",
    "manage_time_block", "optimize_route", "post_team_message", "query_records",
    "queue_next_step", "record_job_signoff", "report", "request_review", "send_on_my_way",
    "update_checklist_item", "update_job", "update_job_status",
    "whats_needing_attention",
  ],
  "tech tools"
);
console.log("ok 2: tech limited to schedule + job + field tools");

// 3. sales: sell + money tools (toggle on) incl. actions, but no settings or job actions
{
  const n = names(sales);
  assert.ok(n.includes("search_clients") && n.includes("list_money") && n.includes("record_payment"));
  assert.ok(n.includes("create_client") && n.includes("schedule_appointment") && n.includes("cancel_appointment"));
  assert.ok(n.includes("update_appointment") && n.includes("update_client_note"), "sales get consolidated update tools");
  assert.ok(n.includes("respond_to_booking") && n.includes("collect_deposit"), "sales handle bookings + deposits");
  assert.ok(n.includes("email_document"), "sales can email quotes (invoice path re-checked inside)");
  assert.ok(!n.includes("get_company_settings"), "sales can't read settings");
  assert.ok(!n.includes("create_job") && !n.includes("update_job") && !n.includes("update_job_status"),
    "sales can't run job actions");
  assert.ok(!n.includes("delete_record") && !n.includes("log_expense") && !n.includes("update_service"),
    "manager-only actions hidden from sales");
  assert.ok(!n.includes("edit_payment") && !n.includes("manage_subscription"),
    "sales can't refund or manage subscriptions");
  assert.ok(!n.includes("list_expenses") && !n.includes("update_expense"), "expense tools are manager-only");
  assert.ok(!n.includes("undo_import") && !n.includes("manage_web_form") && !n.includes("manage_client_fields"),
    "import/forms/fields are manager-only");
  assert.ok(n.includes("list_clients"), "sales can list clients (scoped to their leads)");
  assert.ok(
    !n.includes("list_team") && !n.includes("add_team_member") && !n.includes("update_team_member") &&
    !n.includes("update_team_policy") && !n.includes("update_company_settings") && !n.includes("set_business_hours"),
    "team + settings tools hidden from sales");
  assert.ok(n.includes("update_quote"), "sales can mark quotes sent/approved");
  assert.ok(n.includes("update_invoice"), "sales w/ payments toggle can mark invoices sent");
  assert.ok(n.includes("get_lead_board") && n.includes("move_lead") && n.includes("close_lead"),
    "sales work the lead board (scoped to their leads)");
  assert.ok(!n.includes("manage_pipeline_stage") && !n.includes("manage_lead_webhook"),
    "board structure + webhook are manager-only");
  console.log("ok 3: sales sees sell + money + action tools, no settings/job/manager/team actions");
}

// 4. salesSeePayments=false strips the money tools (reads AND writes)
{
  const n = names(salesNoMoney);
  assert.ok(!n.includes("list_money") && !n.includes("business_summary") && !n.includes("record_payment"));
  assert.ok(!n.includes("list_subscriptions"));
  assert.ok(!n.includes("update_invoice") && !n.includes("create_invoice"), "no invoice tools without money access");
  assert.ok(n.includes("email_document"), "still visible via canSell — invoice path re-checks inside");
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

// 5b. money cards (charges, refunds, payouts) never merge — each is its own decision
{
  const mk = (id: string, kind: string, extra?: Partial<Proposal>): Proposal => ({
    id, kind, title: `t-${id}`, lines: [],
    endpoint: `/api/x/${id}`, method: "POST", payload: { id }, ...extra,
  });
  const merged = mergeBulkProposals([
    mk("a", "refund_payment", { money: true }),
    mk("b", "refund_payment", { money: true }),
    mk("c", "update_client", { confirmLabel: "Save changes" }),
    mk("d", "update_client"),
  ]);
  assert.equal(merged.length, 3, "2 money cards stay solo; 2 updates merge");
  assert.ok(merged.filter((p) => p.money).length === 2);
  assert.equal(merged.find((p) => p.batch)?.confirmLabel, "Save changes", "batch keeps the verb");
  console.log("ok 5b: money cards never merge");
}

// 5c. v8 gating: money movers + field ops land only where the pages allow them
{
  const s = names(sales);
  const t = names(tech);
  const o = names(owner);
  assert.ok(!s.includes("refund_payment") && !s.includes("charge_saved_card") && !s.includes("send_payout"),
    "sales can't move money");
  assert.ok(!s.includes("clock") && !s.includes("send_on_my_way") && !s.includes("update_checklist_item"),
    "sales have no field actions");
  assert.ok(s.includes("get_client_details") && s.includes("email_client") && s.includes("reply_in_portal"),
    "sales work client extras + messaging");
  assert.ok(t.includes("clock") && t.includes("get_job_checklist") && t.includes("query_records") && t.includes("report"),
    "techs get field ops + the power reads (scoped inside)");
  assert.ok(!t.includes("get_statement") && !t.includes("get_client_details") && !t.includes("manage_time_entry"),
    "techs see no money, client extras, or others' hours");
  assert.ok(!names(salesNoMoney).includes("get_statement"), "statements need money access");
  assert.ok(o.includes("manage_time_entry") && o.includes("team_map") && o.includes("quickbooks") && o.includes("run_recurring_billing"),
    "managers get hours, team map, QBO, billing runs");
  console.log("ok 5c: v8 tool gating");
}

// 5d. plan metering math (lib/assistant-billing.ts) — pure
{
  const active = new Date("2026-01-31T15:00:00Z");
  // Jan 31 anchor: Feb period clamps to the 28th, March period back to the 31st
  const feb = planPeriod(active, new Date("2026-03-01T00:00:00Z"));
  assert.equal(feb.start.toISOString(), "2026-02-28T15:00:00.000Z");
  assert.equal(feb.end.toISOString(), "2026-03-31T15:00:00.000Z");
  const first = planPeriod(active, new Date("2026-02-10T00:00:00Z"));
  assert.equal(first.start.toISOString(), "2026-01-31T15:00:00.000Z");
  assert.equal(first.end.toISOString(), "2026-02-28T15:00:00.000Z");
  // a stale stored period reads as a fresh allowance
  const stale = planBalance(
    { atlasPlanActiveAt: active, atlasPeriodStart: first.start, atlasPeriodTokensUsed: 5000 },
    new Date("2026-03-05T00:00:00Z")
  )!;
  assert.equal(stale.used, 0);
  assert.equal(stale.remaining, ATLAS_PLAN_TOKENS);
  const current = planBalance(
    { atlasPlanActiveAt: active, atlasPeriodStart: feb.start, atlasPeriodTokensUsed: 5000 },
    new Date("2026-03-05T00:00:00Z")
  )!;
  assert.equal(current.used, 5000);
  assert.equal(current.remaining, ATLAS_PLAN_TOKENS - 5000);
  // pricing: a typical 3-round turn (~40k in, 1.5k out) is a couple of cents → a few hundred tokens
  const cents = turnCostCents({ tokensIn: 40_000, tokensOut: 1_500, tokensCached: 20_000 });
  assert.ok(cents > 0.5 && cents < 5, `turn cost in a sane range: ${cents}`);
  const tokens = centsToAtlasTokens(cents);
  assert.ok(tokens >= 50 && tokens <= 500, `tokens per turn sane: ${tokens}`);
  assert.equal(centsToAtlasTokens(0), 0, "no cost, no tokens");
  assert.equal(centsToAtlasTokens(0.0001), 1, "rounds up — no free turns");
  console.log(`ok 5d: plan periods + pricing (sample turn ≈ ${cents.toFixed(2)}¢ = ${tokens} tokens)`);
}

// 5e. the trial rides the same meter: one-time allowance, no refill, then locked
{
  const never = { atlasTrialStartedAt: null, atlasTrialTokensUsed: 0 };
  assert.equal(trialBalance(never), null, "no trial until started");
  const started = { atlasTrialStartedAt: new Date("2026-09-01T00:00:00Z"), atlasTrialTokensUsed: 1_240 };
  const b = trialBalance(started)!;
  assert.equal(b.included, ATLAS_TRIAL_TOKENS);
  assert.equal(b.used, 1_240);
  assert.equal(b.remaining, ATLAS_TRIAL_TOKENS - 1_240);
  assert.equal(b.refillsAt, null, "the trial never refills");
  // overshoot by one turn never goes negative
  const over = trialBalance({ ...started, atlasTrialTokensUsed: ATLAS_TRIAL_TOKENS + 300 })!;
  assert.equal(over.remaining, 0);

  // the access ladder, default policy (assistantEnabled null, no plan)
  const noPlan = { atlasPlanActiveAt: null, atlasPeriodStart: null, atlasPeriodTokensUsed: 0 };
  const offer = atlasAccess({ assistantEnabled: null, ...noPlan, ...never });
  assert.deepEqual(offer, { level: "locked", trialUsed: false, reason: "trial-offer" });
  const running = atlasAccess({ assistantEnabled: null, ...noPlan, ...started });
  assert.equal(running.level, "trial");
  if (running.level === "trial") {
    assert.equal(running.meter.remaining, ATLAS_TRIAL_TOKENS - 1_240);
    assert.equal(running.meter.refillsAt, null);
  }
  const spent = atlasAccess({ assistantEnabled: null, ...noPlan, ...started, atlasTrialTokensUsed: ATLAS_TRIAL_TOKENS });
  assert.deepEqual(spent, { level: "locked", trialUsed: true, reason: "trial-ended" });
  // whitelist and off win over everything; a plan wins over the trial
  assert.equal(atlasAccess({ assistantEnabled: true, ...noPlan, ...never }).level, "full");
  assert.equal(atlasAccess({ assistantEnabled: false, ...noPlan, ...started }).level, "off");
  const planned = atlasAccess({
    assistantEnabled: null,
    atlasPlanActiveAt: new Date("2026-08-15T00:00:00Z"),
    atlasPeriodStart: null,
    atlasPeriodTokensUsed: 0,
    ...started,
    atlasTrialTokensUsed: ATLAS_TRIAL_TOKENS, // spent trial is irrelevant once a plan is on
  });
  assert.equal(planned.level, "plan");
  if (planned.level === "plan") assert.ok(planned.meter.refillsAt, "plan meter carries its refill date");
  console.log(`ok 5e: trial = one-time ${ATLAS_TRIAL_TOKENS.toLocaleString()} tokens on the shared meter, ladder intact`);
}

// 5f. queue_next_step: refuses with nothing staged, records the follow-up otherwise
(async () => {
  const tool = toolsForActor(owner).find((t) => t.decl.name === "queue_next_step")!;
  const empty: ToolCtx = { proposals: [] };
  const refused = await tool.run(owner, { instruction: "Optimize Mike's route for 2026-09-09" }, empty);
  assert.ok("error" in refused && !empty.nextStep, "nothing staged → refused");
  const ctx: ToolCtx = { proposals: [{ id: "p1", kind: "update_job", title: "t", lines: [], endpoint: "/x", method: "PATCH", payload: {} }] };
  const ok = await tool.run(owner, { instruction: "Optimize Mike's route for 2026-09-09" }, ctx);
  assert.equal((ok as { queued?: boolean }).queued, true);
  assert.equal(ctx.nextStep, "Optimize Mike's route for 2026-09-09");
  assert.ok(toolsForActor(tech).some((t) => t.decl.name === "queue_next_step"), "every role can queue");
  console.log("ok 5f: queue_next_step gates on staged cards and records the follow-up");
})();

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
    "Email the most recent draft invoice to its client.", // exercises get/list + email_document staging
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
