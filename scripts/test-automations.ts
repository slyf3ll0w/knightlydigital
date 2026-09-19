/**
 * Automation spec tests (lib/automations.ts). Pure — no DB, no network.
 * Run: npx tsx scripts/test-automations.ts
 */
import assert from "node:assert";
import {
  compileAutomation,
  describeAutomation,
  evaluateWhen,
  fieldsFor,
  renderAction,
  TRIGGER_NAMES,
} from "../lib/automations";

// 1. compile happy path (sweep with days + condition + every action type)
const spec = {
  trigger: { event: "quote.unanswered", days: "5" },
  when: "quote_total >= 300 and client_email != ''",
  actions: [
    { type: "email_client", subject: "Still thinking it over, {client_first_name}?", body: "Hi {client_first_name}, quote #{quote_number} for {quote_total|money}: {quote_link}" },
    { type: "notify_team", to: "managers", title: "Quote #{quote_number} unanswered {days} days", body: "{client_name} — {quote_total|money}" },
    { type: "add_client_note", body: "Automation sent a follow-up." },
    { type: "move_lead", stageName: "Follow-up" },
    { type: "request_review" },
  ],
};
const c = compileAutomation(spec);
assert.ok(c.ok, `compiles: ${!c.ok ? c.errors.join("; ") : ""}`);
if (c.ok) {
  assert.equal(c.compiled.spec.trigger.event, "quote.unanswered");
  assert.equal(c.compiled.spec.trigger.days, 5, "days coerced from string");
  assert.equal(c.compiled.spec.actions.length, 5);
  const d = describeAutomation(c.compiled.spec);
  assert.equal(d.trigger, "When a sent quote has had no answer for 5 days");
  assert.equal(d.when, "Only if: quote_total >= 300 and client_email != ''");
  assert.ok(d.actions[0].startsWith("Email the client:"));
  assert.ok(d.actions[3].includes("“Follow-up”"));

  const ctx = {
    client_name: "Sarah Lane", client_first_name: "Sarah", client_last_name: "Lane", client_email: "s@x.com", client_phone: "", client_company: "",
    client_status: "LEAD", lead_source: "Google", stage: "Quote Sent", city: "Allen", zip: "75002", assigned_to: "", company_name: "Pecan Ridge",
    days: 6, quote_number: 42, quote_title: "Driveway", quote_total: 564, quote_status: "AWAITING_RESPONSE", quote_link: "https://x/quote/abc", total: 564,
  };
  assert.deepEqual(evaluateWhen(c.compiled, ctx), { fire: true });
  assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, quote_total: 120, total: 120 }), { fire: false });
  assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, client_email: "" }), { fire: false });
  const email = renderAction(c.compiled, 0, ctx);
  assert.equal(email.subject, "Still thinking it over, Sarah?");
  assert.equal(email.body, "Hi Sarah, quote #42 for $564.00: https://x/quote/abc");
  const push = renderAction(c.compiled, 1, ctx);
  assert.equal(push.title, "Quote #42 unanswered 6 days");
  assert.equal(push.body, "Sarah Lane — $564.00");
}
console.log("ok 1: compile + describe + evaluate + render");

// 2. event trigger: days ignored, default 'to', when omitted → always fires
{
  const r = compileAutomation({ trigger: { event: "job.completed", days: 9 }, actions: [{ type: "notify_team", title: "Job done: {job_title}" }, { type: "request_review" }] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.compiled.spec.trigger.days, undefined);
    assert.equal((r.compiled.spec.actions[0] as { to: string }).to, "managers");
    assert.deepEqual(evaluateWhen(r.compiled, {}), { fire: true });
    assert.equal(describeAutomation(r.compiled.spec).trigger, "When a job is marked complete");
  }
  // default days for a sweep with none given
  const r2 = compileAutomation({ trigger: { event: "invoice.overdue" }, actions: [{ type: "notify_team", title: "x" }] });
  assert.ok(r2.ok && r2.compiled.spec.trigger.days === 7);
  // flat shape (event at top level) is accepted too
  const r3 = compileAutomation({ event: "lead.stale", days: 200, actions: [{ type: "move_lead", stage: "Cold" }] });
  assert.ok(r3.ok && r3.compiled.spec.trigger.days === 120 && (r3.compiled.spec.actions[0] as { stageName: string }).stageName === "Cold");
}
console.log("ok 2: event triggers + defaults");

// 3. compile errors are specific
{
  const bad = compileAutomation({
    trigger: { event: "quote.sent" },
    when: "invoice_balance > 0",
    actions: [
      { type: "email_client", subject: "", body: "Hi {pay_link}" },
      { type: "move_lead" },
      { type: "charge_card", amount: 100 },
      { type: "notify_team", title: "{unclosed" },
    ],
  });
  assert.ok(!bad.ok);
  if (!bad.ok) {
    const all = bad.errors.join("\n");
    for (const needle of ['when: unknown field "invoice_balance"', "subject is required", 'unknown field "pay_link"', "stageName is required", "type must be one of", "Unclosed {"]) {
      assert.ok(all.includes(needle), `expected: ${needle}\n--\n${all}`);
    }
  }
  const noTrigger = compileAutomation({ actions: [{ type: "request_review" }] });
  assert.ok(!noTrigger.ok && /trigger.event must be one of/.test(noTrigger.errors[0]));
  const noActions = compileAutomation({ trigger: { event: "quote.sent" }, actions: [] });
  assert.ok(!noActions.ok && /at least one action/.test(noActions.errors.join()));
  const tooMany = compileAutomation({ trigger: { event: "quote.sent" }, actions: Array(6).fill({ type: "request_review" }) });
  assert.ok(!tooMany.ok && /At most 5/.test(tooMany.errors.join()));
}
console.log("ok 3: compile errors");

// 4. every trigger has a field list that includes the base fields; bad expressions never throw out
{
  for (const t of TRIGGER_NAMES) {
    const f = fieldsFor(t);
    assert.ok(f.includes("client_first_name") && f.includes("company_name") && f.includes("days"), t);
  }
  const r = compileAutomation({ trigger: { event: "invoice.overdue" }, when: "invoice_balance / days > 10", actions: [{ type: "notify_team", title: "x" }] });
  assert.ok(r.ok);
  if (r.ok) {
    const res = evaluateWhen(r.compiled, { invoice_balance: 100, days: 0 });
    assert.equal(res.fire, false);
    assert.ok(/Division by zero/.test(res.error ?? ""));
  }
}
console.log("ok 4: fields + safe evaluation");

console.log("\nautomations: all green");
