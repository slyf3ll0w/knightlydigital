/**
 * Automations — AI-written, engine-run (docs/plans/ai-estimators-2026-09-19.md, Batch 2).
 *
 * An automation is a declarative spec: ONE trigger (an app event such as
 * "quote sent", or a time-based sweep such as "invoice 7 days overdue"),
 * an optional WHEN condition, and an allowlisted ACTION list. Conditions and
 * templates reuse the estimate tools' expression language (lib/estimator.ts)
 * over a flat context of fields ({client_first_name}, {quote_total}, …).
 *
 * The shape mirrors estimate tools on purpose: Atlas writes the spec once
 * (the user confirms a card that reads as plain English), and from then on
 * lib/automations-server.ts executes it with no model in the loop — free.
 *
 * Safety is by construction, not by prompt:
 *   - the action allowlist has nothing that moves money, deletes records, or
 *     changes team members / roles;
 *   - one automation fires at most once per (entity, event) — AutomationRun
 *     rows are the dedupe key — and a company caps out at a daily run count;
 *   - actions never emit events, so automations can't trigger each other.
 *
 * This file is pure (no Prisma) so tests and the client can import it.
 */

import {
  evaluate,
  identifiersIn,
  parseExpr,
  parseTemplate,
  renderTemplate,
  truthy,
  type EvalCtx,
  type Node,
  type TemplatePart,
  type Value,
} from "./estimator";

export const AUTOMATION_LIMITS = {
  actions: 5,
  perCompany: 30,
  /** Successful runs per company per rolling 24 h — a runaway rule stops here. */
  dailyRuns: 300,
  /** Entities one sweep considers per automation per tick. */
  sweepBatch: 200,
  maxDays: 120,
} as const;

// ── triggers ─────────────────────────────────────────────────────────────────

export type EntityType = "request" | "appointment" | "quote" | "job" | "invoice" | "contact";

export const EVENT_TRIGGERS = {
  "request.created": { label: "a new request comes in", entity: "request" as EntityType },
  "appointment.scheduled": { label: "an appointment is booked", entity: "appointment" as EntityType },
  "quote.sent": { label: "a quote is sent (first send)", entity: "quote" as EntityType },
  "quote.approved": { label: "a quote is approved", entity: "quote" as EntityType },
  "job.completed": { label: "a job is marked complete", entity: "job" as EntityType },
  "invoice.paid": { label: "an invoice is paid in full", entity: "invoice" as EntityType },
} as const;

export const SWEEP_TRIGGERS = {
  "quote.unanswered": { label: "a sent quote has had no answer for {days} days", entity: "quote" as EntityType, defaultDays: 5 },
  "invoice.overdue": { label: "an invoice is {days} days past due", entity: "invoice" as EntityType, defaultDays: 7 },
  "lead.stale": { label: "a lead has sat in the same stage for {days} days", entity: "contact" as EntityType, defaultDays: 14 },
} as const;

export type EventName = keyof typeof EVENT_TRIGGERS;
export type SweepName = keyof typeof SWEEP_TRIGGERS;
export type TriggerName = EventName | SweepName;

export const EVENT_NAMES = Object.keys(EVENT_TRIGGERS) as EventName[];
export const SWEEP_NAMES = Object.keys(SWEEP_TRIGGERS) as SweepName[];
export const TRIGGER_NAMES: TriggerName[] = [...EVENT_NAMES, ...SWEEP_NAMES];

export function isSweep(t: TriggerName): t is SweepName {
  return t in SWEEP_TRIGGERS;
}

export function triggerEntity(t: TriggerName): EntityType {
  return isSweep(t) ? SWEEP_TRIGGERS[t].entity : EVENT_TRIGGERS[t as EventName].entity;
}

// ── context fields (what conditions and templates may reference) ─────────────

const BASE_FIELDS = [
  "client_name", "client_first_name", "client_last_name", "client_email", "client_phone", "client_company",
  "client_status", "lead_source", "stage", "city", "zip", "assigned_to", "company_name", "days",
] as const;

const ENTITY_FIELDS: Record<EntityType, readonly string[]> = {
  request: ["request_number", "request_title", "request_details", "request_source"],
  appointment: ["appointment_number", "appointment_title", "appointment_type", "appointment_when"],
  quote: ["quote_number", "quote_title", "quote_total", "quote_status", "quote_link", "total"],
  job: ["job_number", "job_title", "job_address", "job_total", "total"],
  invoice: ["invoice_number", "invoice_total", "invoice_balance", "invoice_status", "due_date", "pay_link", "total"],
  contact: [],
};

export function fieldsFor(trigger: TriggerName): string[] {
  return [...BASE_FIELDS, ...ENTITY_FIELDS[triggerEntity(trigger)]];
}

export const FIELD_HELP: Record<string, string> = {
  client_name: "full name", client_first_name: "first name", client_email: "email or empty", client_phone: "phone or empty",
  client_company: "the client's business name or empty", client_status: "LEAD / ACTIVE / ARCHIVED", lead_source: "how they found you, or empty",
  stage: "pipeline stage name or empty", assigned_to: "salesperson's name or empty", company_name: "YOUR company's name",
  days: "sweeps only: days waiting / overdue / in stage (0 for events)",
  request_source: "internal / client_hub / booking_form / estimate_form", appointment_when: "date and time as text",
  quote_total: "dollars (number)", total: "the money amount of the entity (number)", quote_link: "client approval link",
  invoice_balance: "dollars still owed (number)", pay_link: "client pay link", due_date: "YYYY-MM-DD or empty",
  job_total: "sum of job line items (number)",
};

// ── actions ──────────────────────────────────────────────────────────────────

export type AutomationAction =
  | { type: "notify_team"; to: "managers" | "assigned" | "everyone"; title: string; body?: string }
  | { type: "email_client"; subject: string; body: string }
  | { type: "add_client_note"; body: string }
  | { type: "move_lead"; stageName: string }
  | { type: "request_review" };

export const ACTION_TYPES = ["notify_team", "email_client", "add_client_note", "move_lead", "request_review"] as const;

export type AutomationSpec = {
  version: 1;
  trigger: { event: TriggerName; days?: number };
  /** Expression over fieldsFor(trigger); omitted = always. */
  when?: string;
  actions: AutomationAction[];
};

export type CompiledAutomation = {
  spec: AutomationSpec;
  when: Node | null;
  /** Per action: template field → parsed template. */
  templates: Record<string, TemplatePart[]>[];
};

export type CompileResult = { ok: true; compiled: CompiledAutomation } | { ok: false; errors: string[] };

function s(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function compileAutomation(raw: unknown): CompileResult {
  const errors: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // trigger
  const t = (r.trigger && typeof r.trigger === "object" ? r.trigger : {}) as Record<string, unknown>;
  const eventName = s(t.event ?? r.event, 40) as TriggerName;
  if (!TRIGGER_NAMES.includes(eventName)) {
    return { ok: false, errors: [`trigger.event must be one of: ${TRIGGER_NAMES.join(", ")}`] };
  }
  let days: number | undefined;
  if (isSweep(eventName)) {
    const d = Number(t.days ?? r.days);
    days = Number.isFinite(d) && d >= 1 ? Math.min(AUTOMATION_LIMITS.maxDays, Math.round(d)) : SWEEP_TRIGGERS[eventName].defaultDays;
  }
  const known = new Set(fieldsFor(eventName));

  // when
  const whenSrc = s(r.when, 500) || undefined;
  let when: Node | null = null;
  if (whenSrc) {
    try {
      when = parseExpr(whenSrc);
      for (const name of identifiersIn(when)) if (!known.has(name)) errors.push(`when: unknown field "${name}" — for this trigger use: ${[...known].join(", ")}`);
    } catch (e) {
      errors.push(`when: ${(e as Error).message}`);
    }
  }

  // actions
  const rawActions = Array.isArray(r.actions) ? r.actions : [];
  if (rawActions.length === 0) errors.push("Add at least one action");
  if (rawActions.length > AUTOMATION_LIMITS.actions) errors.push(`At most ${AUTOMATION_LIMITS.actions} actions`);
  const actions: AutomationAction[] = [];
  const templates: Record<string, TemplatePart[]>[] = [];
  const tpl = (where: string, src: string, into: Record<string, TemplatePart[]>, key: string) => {
    try {
      const parts = parseTemplate(src);
      for (const p of parts) if ("expr" in p) for (const name of identifiersIn(p.expr)) if (!known.has(name)) errors.push(`${where}: unknown field "${name}"`);
      into[key] = parts;
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  };
  rawActions.slice(0, AUTOMATION_LIMITS.actions).forEach((ra, idx) => {
    const a = (ra ?? {}) as Record<string, unknown>;
    const type = s(a.type, 20);
    const where = `Action ${idx + 1} (${type || "?"})`;
    const t: Record<string, TemplatePart[]> = {};
    switch (type) {
      case "notify_team": {
        const to = s(a.to, 10);
        const title = s(a.title, 120);
        if (!title) errors.push(`${where}: title is required`);
        const body = s(a.body, 500) || undefined;
        tpl(`${where} title`, title, t, "title");
        if (body) tpl(`${where} body`, body, t, "body");
        actions.push({ type, to: to === "assigned" || to === "everyone" ? to : "managers", title, body });
        break;
      }
      case "email_client": {
        const subject = s(a.subject, 150);
        const body = s(a.body, 2000);
        if (!subject) errors.push(`${where}: subject is required`);
        if (!body) errors.push(`${where}: body is required`);
        tpl(`${where} subject`, subject, t, "subject");
        tpl(`${where} body`, body, t, "body");
        actions.push({ type, subject, body });
        break;
      }
      case "add_client_note": {
        const body = s(a.body, 1000);
        if (!body) errors.push(`${where}: body is required`);
        tpl(`${where} body`, body, t, "body");
        actions.push({ type, body });
        break;
      }
      case "move_lead": {
        const stageName = s(a.stageName ?? a.stage, 60);
        if (!stageName) errors.push(`${where}: stageName is required (an existing pipeline stage)`);
        actions.push({ type, stageName });
        break;
      }
      case "request_review":
        actions.push({ type });
        break;
      default:
        errors.push(`${where}: type must be one of ${ACTION_TYPES.join(", ")}`);
    }
    templates.push(t);
  });

  if (errors.length > 0) return { ok: false, errors: Array.from(new Set(errors)).slice(0, 20) };
  const spec: AutomationSpec = {
    version: 1,
    trigger: { event: eventName, ...(days !== undefined ? { days } : {}) },
    ...(whenSrc ? { when: whenSrc } : {}),
    actions,
  };
  return { ok: true, compiled: { spec, when, templates } };
}

export function specFromJson(raw: unknown): AutomationSpec | null {
  const c = compileAutomation(raw);
  return c.ok ? c.compiled.spec : null;
}

// ── plain-English rendering (cards, settings page) ───────────────────────────

export function triggerLabel(spec: AutomationSpec): string {
  const t = spec.trigger.event;
  if (isSweep(t)) return SWEEP_TRIGGERS[t].label.replace("{days}", String(spec.trigger.days ?? SWEEP_TRIGGERS[t].defaultDays));
  return EVENT_TRIGGERS[t].label;
}

export function actionLabel(a: AutomationAction): string {
  switch (a.type) {
    case "notify_team":
      return `Notify ${a.to === "managers" ? "the managers" : a.to === "assigned" ? "the assigned salesperson" : "the whole team"}: “${a.title}”`;
    case "email_client":
      return `Email the client: “${a.subject}”`;
    case "add_client_note":
      return `Add a note on the client: “${a.body.length > 80 ? `${a.body.slice(0, 77)}…` : a.body}”`;
    case "move_lead":
      return `Move the lead to “${a.stageName}”`;
    case "request_review":
      return "Send a review request (if a review link is set)";
  }
}

export function describeAutomation(spec: AutomationSpec): { trigger: string; when: string | null; actions: string[] } {
  return {
    trigger: `When ${triggerLabel(spec)}`,
    when: spec.when ? `Only if: ${spec.when}` : null,
    actions: spec.actions.map(actionLabel),
  };
}

// ── evaluation ───────────────────────────────────────────────────────────────

export type AutomationCtx = Record<string, Value>;

const EMPTY_BOOK: EvalCtx["priceBook"] = new Map();

/** Does the rule fire for this context? Evaluation errors count as "no" and are reported. */
export function evaluateWhen(compiled: CompiledAutomation, ctx: AutomationCtx): { fire: boolean; error?: string } {
  if (!compiled.when) return { fire: true };
  try {
    return { fire: truthy(evaluate(compiled.when, { vars: ctx, priceBook: EMPTY_BOOK })) };
  } catch (e) {
    return { fire: false, error: (e as Error).message };
  }
}

/** Render one action's template fields against the context. */
export function renderAction(compiled: CompiledAutomation, index: number, ctx: AutomationCtx): Record<string, string> {
  const out: Record<string, string> = {};
  const evalCtx: EvalCtx = { vars: ctx, priceBook: EMPTY_BOOK };
  for (const [key, parts] of Object.entries(compiled.templates[index] ?? {})) out[key] = renderTemplate(parts, evalCtx);
  return out;
}

// ── the builder's reference card ─────────────────────────────────────────────

export const AUTOMATION_GUIDE = `AUTOMATION SPEC — reference

An automation = ONE trigger + optional condition + 1–5 actions. It runs by itself with no AI in the loop (free for the user). It fires at most once per record per trigger.

spec = {
  trigger: { event: "quote.unanswered", days: 5 },      // days only for the sweep triggers
  when: "quote_total >= 300 and client_email != ''",     // optional expression; omit for always
  actions: [
    { type: "email_client", subject: "Still thinking it over, {client_first_name}?", body: "Hi {client_first_name},\\n\\nJust checking in on quote #{quote_number} for {quote_total|money}. You can review and approve it here: {quote_link}\\n\\nAny questions, just reply.\\n" },
    { type: "notify_team", to: "managers", title: "Quote #{quote_number} unanswered {days} days", body: "{client_name} — {quote_total|money}" },
    { type: "add_client_note", body: "Automation sent a 5-day quote follow-up." },
    { type: "move_lead", stageName: "Follow-up" },
    { type: "request_review" }
  ]
}

Triggers (events, fire when it happens): request.created, appointment.scheduled, quote.sent, quote.approved, job.completed, invoice.paid.
Triggers (sweeps, checked hourly, need days): quote.unanswered, invoice.overdue, lead.stale.
Fields you may use in when/templates depend on the trigger — action 'guide' lists them. Templates: {field}, {field|money}, {field|int}. Conditions use the estimate-tool expression language (== != < <= > >= and or not, contains(text, part), lower(text)).
Actions (the WHOLE allowlist — nothing else exists): notify_team (to: managers | assigned | everyone), email_client (needs the client to have an email; the business's email must be live), add_client_note, move_lead (stageName must be an existing pipeline stage from action 'guide'), request_review (job.completed / invoice.paid; needs the company's review link).
Never promise an action that isn't in the list (no texting, no charging, no deleting, no scheduling). Never make an email pushy or misleading — it goes out under the business's name.
Always run action 'test' first: it reports how often the rule WOULD have fired over the last 30 days so the user can sanity-check before confirming.`;
