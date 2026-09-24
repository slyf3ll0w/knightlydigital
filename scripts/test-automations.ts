/**
 * Automation spec tests (lib/automations.ts, v2). Pure — no DB, no network.
 * Run: npx tsx scripts/test-automations.ts
 */
import assert from "node:assert";
import {
  ACTION_TYPES,
  ACTIONS,
  AUTOMATION_LIMITS,
  actionAllowedFor,
  compileAutomation,
  describeAutomation,
  evaluateFilter,
  evaluateWhen,
  fieldDefsFor,
  fieldsFor,
  filterExpr,
  renderAction,
  triggerEntity,
  TRIGGER_NAMES,
  TRIGGERS,
  type AutomationCtx,
  type FilterStep,
} from "../lib/automations";

const baseCtx: AutomationCtx = {
  client_name: "Sarah Lane", client_first_name: "Sarah", client_last_name: "Lane", client_email: "s@x.com", client_phone: "", client_company: "",
  client_status: "LEAD", client_can_text: false, lead_source: "Google", stage: "Quote Sent", city: "Allen", zip: "75002", assigned_to: "", company_name: "Pecan Ridge",
  days: 6, hours: 0, now_hour: 14, now_weekday: "Tue", today: "2026-09-24",
};

// 1. v2 happy path: sweep + leading filter + email + wait + re-check filter + notify
{
  const c = compileAutomation({
    trigger: { event: "quote.unanswered", days: "5" },
    steps: [
      { type: "filter", match: "all", rules: [{ field: "quote_total", op: "gte", value: 300 }, { field: "client_email", op: "not_empty" }] },
      { type: "email_client", subject: "Still thinking it over, {client_first_name}?", body: "Hi {client_first_name}, quote #{quote_number} for {quote_total|money}: {quote_link}" },
      { type: "wait", amount: 2, unit: "days" },
      { type: "filter", match: "all", rules: [{ field: "quote_status", op: "eq", value: "AWAITING_RESPONSE" }] },
      { type: "notify_team", to: "assigned", title: "Quote #{quote_number} still unanswered", body: "{client_name} — {quote_total|money}" },
    ],
  });
  assert.ok(c.ok, `compiles: ${!c.ok ? c.errors.join("; ") : ""}`);
  if (c.ok) {
    const { spec } = c.compiled;
    assert.equal(spec.version, 2);
    assert.equal(spec.trigger.days, 5, "days coerced from string");
    assert.equal(spec.steps.length, 5);
    assert.equal(c.compiled.entity, "quote");
    const d = describeAutomation(spec);
    assert.equal(d.trigger, "When a sent quote has had no answer for 5 days");
    assert.ok(d.when?.startsWith("Only if Quote total is at least 300 and Client email is not empty"), d.when ?? "");
    assert.equal(d.actions.length, 4);
    assert.ok(d.actions[0].startsWith("Email the client:"));
    assert.equal(d.actions[1], "Wait 2 days");
    assert.ok(d.actions[2].startsWith("Only if Quote status is “AWAITING_RESPONSE”"));

    const ctx: AutomationCtx = { ...baseCtx, quote_number: 42, quote_title: "Driveway", quote_total: 564, total: 564, quote_status: "AWAITING_RESPONSE", quote_link: "https://x/quote/abc", deposit_amount: 0 };
    assert.deepEqual(evaluateWhen(c.compiled, ctx), { fire: true });
    assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, quote_total: 120 }), { fire: false });
    assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, client_email: "" }), { fire: false });
    assert.deepEqual(evaluateFilter(c.compiled, 3, ctx), { pass: true });
    assert.deepEqual(evaluateFilter(c.compiled, 3, { ...ctx, quote_status: "APPROVED" }), { pass: false });
    const email = renderAction(c.compiled, 1, ctx);
    assert.equal(email.subject, "Still thinking it over, Sarah?");
    assert.equal(email.body, "Hi Sarah, quote #42 for $564.00: https://x/quote/abc");
    assert.equal(renderAction(c.compiled, 4, ctx).body, "Sarah Lane — $564.00");
  }
  console.log("ok 1: v2 compile + describe + evaluate + render");
}

// 2. v1 specs normalize: when → leading filter expr, actions → steps; stage alias; default 'to'
{
  const r = compileAutomation({ trigger: { event: "job.completed", days: 9 }, when: "job_total > 100", actions: [{ type: "notify_team", title: "Job done: {job_title}" }, { type: "move_lead", stage: "Cold" }, { type: "request_review" }] });
  assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
  if (r.ok) {
    const { spec } = r.compiled;
    assert.equal(spec.trigger.days, undefined, "events drop days");
    assert.equal(spec.steps.length, 4);
    assert.deepEqual(spec.steps[0], { type: "filter", match: "all", rules: [], expr: "job_total > 100" });
    assert.equal((spec.steps[1] as unknown as { to: string }).to, "managers");
    assert.equal((spec.steps[2] as unknown as { stageName: string }).stageName, "Cold");
    assert.equal(describeAutomation(spec).when, "Only if: job_total > 100");
    assert.deepEqual(evaluateWhen(r.compiled, { job_total: 50 }), { fire: false });
    assert.deepEqual(evaluateWhen(r.compiled, { job_total: 500 }), { fire: true });
  }
  const r2 = compileAutomation({ trigger: { event: "invoice.overdue" }, actions: [{ type: "notify_team", title: "x" }] });
  assert.ok(r2.ok && r2.compiled.spec.trigger.days === 7, "default days");
  const r3 = compileAutomation({ event: "lead.stale", days: 200, actions: [{ type: "move_lead", stageName: "Cold" }] });
  assert.ok(r3.ok && r3.compiled.spec.trigger.days === AUTOMATION_LIMITS.maxDays, "days capped");
  console.log("ok 2: v1 normalization + defaults");
}

// 3. every rule op compiles to a parseable expression, for text/number/enum/bool
{
  const defs = fieldDefsFor("invoice.paid");
  const cases: FilterStep[] = [
    { type: "filter", match: "all", rules: [{ field: "client_name", op: "eq", value: 'O"Brien \\ Sons' }] },
    { type: "filter", match: "any", rules: [{ field: "client_name", op: "contains", value: "Lane" }, { field: "city", op: "not_contains", value: "Dallas" }] },
    { type: "filter", match: "all", rules: [{ field: "client_status", op: "in", value: ["LEAD", "ACTIVE"] }, { field: "lead_source", op: "not_in", value: "Yelp, Ads" }] },
    { type: "filter", match: "all", rules: [{ field: "invoice_balance", op: "gt", value: 0 }, { field: "invoice_balance", op: "lte", value: "500" }, { field: "due_in_days", op: "lt", value: -3 }] },
    { type: "filter", match: "all", rules: [{ field: "client_email", op: "empty" }, { field: "pay_link", op: "not_empty" }, { field: "invoice_total", op: "not_empty" }] },
    { type: "filter", match: "all", rules: [{ field: "client_can_text", op: "is_true" }, { field: "now_weekday", op: "weekday" }, { field: "now_hour", op: "between_hours", value: [8, 18] }] },
  ];
  for (const step of cases) {
    const c = compileAutomation({ trigger: { event: "invoice.paid" }, steps: [step, { type: "notify_team", to: "managers", title: "t" }] });
    assert.ok(c.ok, `${filterExpr(step, defs)} → ${!c.ok ? c.errors.join("; ") : ""}`);
  }
  const ctx: AutomationCtx = { ...baseCtx, client_can_text: true, invoice_number: 1, invoice_total: 400, invoice_balance: 400, total: 400, invoice_status: "PAID", invoice_kind: "STANDARD", due_date: "2026-09-20", due_in_days: -4, pay_link: "https://x/pay/1" };
  const c = compileAutomation({ trigger: { event: "invoice.paid" }, steps: [cases[5], { type: "notify_team", to: "managers", title: "t" }] });
  assert.ok(c.ok);
  if (c.ok) {
    assert.deepEqual(evaluateWhen(c.compiled, ctx), { fire: true });
    assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, now_weekday: "Sat" }), { fire: false });
    assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, now_hour: 20 }), { fire: false });
    assert.deepEqual(evaluateWhen(c.compiled, { ...ctx, client_can_text: false }), { fire: false });
  }
  const c2 = compileAutomation({ trigger: { event: "invoice.paid" }, steps: [cases[2], { type: "notify_team", to: "managers", title: "t" }] });
  assert.ok(c2.ok);
  if (c2.ok) {
    assert.deepEqual(evaluateWhen(c2.compiled, ctx), { fire: true });
    assert.deepEqual(evaluateWhen(c2.compiled, { ...ctx, lead_source: "yelp" }), { fire: false }, "in/not_in are case-insensitive");
    assert.deepEqual(evaluateWhen(c2.compiled, { ...ctx, client_status: "ARCHIVED" }), { fire: false });
  }
  console.log("ok 3: rule ops compile + evaluate");
}

// 4. compile errors are specific
{
  const bad = compileAutomation({
    trigger: { event: "quote.sent" },
    steps: [
      { type: "filter", match: "all", rules: [{ field: "invoice_balance", op: "gt", value: 0 }, { field: "quote_total", op: "nope" }] },
      { type: "email_client", subject: "" },
      { type: "send_pay_link" },
      { type: "charge_card" },
      { type: "wait", amount: 1, unit: "days" },
    ],
  });
  assert.ok(!bad.ok);
  if (!bad.ok) {
    const all = bad.errors.join("\n");
    assert.ok(all.includes('unknown field "invoice_balance"'), all);
    assert.ok(all.includes('unknown comparison "nope"'), all);
    assert.ok(all.includes("subject is required"), all);
    assert.ok(all.includes("can't run on a quote trigger"), all);
    assert.ok(all.includes("type must be filter, wait, or one of"), all);
    assert.ok(all.includes("a wait needs something after it"), all);
  }
  const noTrigger = compileAutomation({ trigger: { event: "quote.deleted" }, steps: [] });
  assert.ok(!noTrigger.ok && noTrigger.errors[0].startsWith("trigger.event must be one of"));
  const noActions = compileAutomation({ trigger: { event: "quote.sent" }, steps: [{ type: "filter", match: "all", rules: [] }] });
  assert.ok(!noActions.ok && noActions.errors.includes("Add at least one action"));
  const tooMany = compileAutomation({ trigger: { event: "quote.sent" }, steps: Array.from({ length: 6 }, () => ({ type: "add_client_note", body: "x" })) });
  assert.ok(!tooMany.ok && tooMany.errors.some((e) => e.startsWith("At most 5 actions")));
  const badUrl = compileAutomation({ trigger: { event: "quote.sent" }, steps: [{ type: "send_webhook", url: "http://example.com/x" }] });
  assert.ok(!badUrl.ok && badUrl.errors.some((e) => e.includes("https://")));
  const badEmail = compileAutomation({ trigger: { event: "quote.sent" }, steps: [{ type: "email_address", to: "nope", subject: "s", body: "b" }] });
  assert.ok(!badEmail.ok && badEmail.errors.some((e) => e.includes("isn't an email address")));
  console.log("ok 4: compile errors");
}

// 5. trigger options: schedule, stage pick, manual entity, hours sweeps
{
  const sc = compileAutomation({ trigger: { event: "schedule.tick", schedule: { every: "week", hour: 7, weekday: 1 } }, steps: [{ type: "notify_team", to: "managers", title: "{jobs_today} jobs today, {overdue_invoices} overdue" }] });
  assert.ok(sc.ok, !sc.ok ? sc.errors.join("; ") : "");
  if (sc.ok) {
    assert.deepEqual(sc.compiled.spec.trigger.schedule, { every: "week", hour: 7, weekday: 1 });
    assert.equal(describeAutomation(sc.compiled.spec).trigger, "When every Mon at 7am");
    assert.equal(sc.compiled.entity, "company");
  }
  const daily = compileAutomation({ trigger: { event: "schedule.tick", schedule: { every: "day", hour: 17 } }, steps: [{ type: "email_address", to: "office@x.com", subject: "Day end", body: "{open_quotes} quotes open" }] });
  assert.ok(daily.ok && describeAutomation(daily.compiled.spec).trigger === "When every day at 5pm");
  const stage = compileAutomation({ trigger: { event: "lead.stage_changed", stage: "Estimate Scheduled" }, steps: [{ type: "text_client", body: "See you soon {client_first_name}!" }] });
  assert.ok(stage.ok && describeAutomation(stage.compiled.spec).trigger === "When a lead moves to “Estimate Scheduled”");
  const manual = compileAutomation({ trigger: { event: "manual.run", entity: "job" }, steps: [{ type: "add_job_note", body: "Ran by hand" }] });
  assert.ok(manual.ok && manual.compiled.entity === "job" && describeAutomation(manual.compiled.spec).trigger === "When you press Run on a job");
  const manualBad = compileAutomation({ trigger: { event: "manual.run", entity: "expense" }, steps: [{ type: "notify_team", to: "managers", title: "x" }] });
  assert.ok(manualBad.ok && manualBad.compiled.entity === "contact", "unknown manual entity falls back to the first choice");
  const up = compileAutomation({ trigger: { event: "appointment.upcoming", hours: 2 }, steps: [{ type: "send_appointment_reminder" }] });
  assert.ok(up.ok && up.compiled.spec.trigger.hours === 2 && describeAutomation(up.compiled.spec).trigger === "When an appointment starts in 2 hours");
  console.log("ok 5: trigger options");
}

// 6. dynamic fields: custom_* on client entities, data_* on webhooks, atlas_text after atlas_draft
{
  const custom = compileAutomation({ trigger: { event: "client.field_changed" }, steps: [{ type: "filter", match: "all", rules: [{ field: "custom_gate_code", op: "not_empty" }] }, { type: "add_client_note", body: "Gate: {custom_gate_code}" }] });
  assert.ok(custom.ok, !custom.ok ? custom.errors.join("; ") : "");
  const hook = compileAutomation({ trigger: { event: "webhook.received" }, steps: [{ type: "filter", match: "all", rules: [{ field: "data_source", op: "eq", value: "facebook" }] }, { type: "notify_team", to: "managers", title: "New {data_source} lead: {data_name}" }] });
  assert.ok(hook.ok, !hook.ok ? hook.errors.join("; ") : "");
  if (hook.ok) {
    assert.deepEqual(evaluateWhen(hook.compiled, { data_source: "Facebook", data_name: "Ann" }), { fire: true });
    assert.equal(renderAction(hook.compiled, 1, { data_source: "Facebook", data_name: "Ann" }).title, "New Facebook lead: Ann");
  }
  // a key the sender left out reads as "" instead of breaking the run
  if (hook.ok) {
    assert.deepEqual(evaluateWhen(hook.compiled, { data_name: "Ann" }), { fire: false });
    assert.equal(renderAction(hook.compiled, 1, { data_source: "Facebook" }).title, "New Facebook lead:");
  }
  const hookBad = compileAutomation({ trigger: { event: "webhook.received" }, steps: [{ type: "email_client", subject: "s", body: "b" }] });
  assert.ok(!hookBad.ok && hookBad.errors.some((e) => e.includes("can't run on a webhook payload trigger")));
  const atlasBefore = compileAutomation({ trigger: { event: "job.completed" }, steps: [{ type: "email_client", subject: "Thanks", body: "{atlas_text}" }, { type: "atlas_draft", prompt: "Write a thank-you for {client_first_name}" }] });
  assert.ok(!atlasBefore.ok && atlasBefore.errors.some((e) => e.includes('unknown field "atlas_text"')));
  const atlasAfter = compileAutomation({ trigger: { event: "job.completed" }, steps: [{ type: "atlas_draft", prompt: "Write a thank-you for {client_first_name}" }, { type: "email_client", subject: "Thanks", body: "{atlas_text}" }] });
  assert.ok(atlasAfter.ok, !atlasAfter.ok ? atlasAfter.errors.join("; ") : "");
  console.log("ok 6: dynamic fields");
}

// 7. catalog integrity: every trigger has a recipe + fields; every action's params render a label; needs-lists reference real entities
{
  for (const t of TRIGGER_NAMES) {
    assert.ok(TRIGGERS[t].recipe.length > 10, `${t} recipe`);
    assert.ok(fieldsFor(t).includes("company_name"), `${t} fields`);
    const entity = triggerEntity(t);
    assert.ok(fieldsFor(t).length > 3 || entity === "webhook", `${t} has fields`);
  }
  for (const a of ACTION_TYPES) {
    const def = ACTIONS[a];
    assert.ok(def.hint.length > 5, `${a} hint`);
    const minimal: Record<string, unknown> = { type: a };
    for (const pd of def.params) {
      if (!pd.required) continue;
      minimal[pd.key] = pd.kind === "number" ? (pd.min ?? 1) : pd.kind === "select" ? pd.options?.[0].value : pd.kind === "email" ? "a@b.co" : pd.kind === "url" ? "https://example.com/h" : "x";
    }
    const trig = def.needs === "any" ? "schedule.tick" : def.needs === "client" ? "job.completed" : def.needs[0] === "quote" ? "quote.sent" : def.needs[0] === "invoice" ? "invoice.paid" : def.needs[0] === "job" ? "job.completed" : def.needs[0] === "appointment" ? "appointment.scheduled" : "payment.received";
    const c = compileAutomation({ trigger: { event: trig }, steps: [minimal] });
    assert.ok(c.ok, `${a} minimal compiles on ${trig}: ${!c.ok ? c.errors.join("; ") : ""}`);
    if (c.ok) assert.ok(describeAutomation(c.compiled.spec).actions[0].length > 3, `${a} label`);
  }
  assert.ok(actionAllowedFor("send_quote_link", "quote") && !actionAllowedFor("send_quote_link", "job"));
  assert.ok(actionAllowedFor("notify_team", "webhook") && !actionAllowedFor("email_client", "expense"));
  console.log(`ok 7: catalog integrity (${TRIGGER_NAMES.length} triggers, ${ACTION_TYPES.length} actions)`);
}

console.log("all automation tests passed");
