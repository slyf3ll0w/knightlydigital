import { prisma } from "../db";
import { isManager } from "../permissions";
import { str, stage, type Tool } from "./core";
import {
  ACTION_TYPES,
  ACTIONS,
  AUTOMATION_GUIDE,
  AUTOMATION_LIMITS,
  CLIENT_ENTITIES,
  CLIENT_FIELDS,
  COMMON_FIELDS,
  compileAutomation,
  customFieldKey,
  describeAutomation,
  ENTITY_FIELDS,
  isActionType,
  specFromJson,
  TRIGGER_NAMES,
  TRIGGERS,
  type AutomationSpec,
  type EntityType,
  type TriggerDef,
} from "../automations";
import { AUTOMATION_SELECT, previewAutomation } from "../automations-server";
import { draftAutomation, loadDraftFacts } from "../automations-draft";

/**
 * Automations from the chat drawer (docs/plans/automations-builder-2026-09-24.md).
 * Same flow as estimate tools: guide → draft (the same brain the builder
 * page's Atlas panel uses — lib/automations-draft.ts) or write the spec by
 * hand → test (dry run over the last 30 days) → create / update card. The
 * card reads as plain English so the owner confirms what will actually
 * happen, unattended, from then on. The builder page at /app/automations
 * shows the same rule as cards.
 */

const SPEC_PARAM = {
  type: "object",
  description:
    "The automation (v2). Call action 'guide' first for the exact format. Shape: { trigger: { event, days?, hours?, schedule?: {every:'day'|'week', hour:0-23, weekday?:0-6}, stage?, fieldId?, entity? }, steps: [ {type:'filter', match:'all'|'any', rules:[{field, op, value?}], expr?} | {type:'wait', amount, unit:'hours'|'days'} | {type:<action>, ...params} ] }. Easier: action 'draft' with the owner's sentence returns a compiled spec you can pass straight to 'test' and 'create'.",
  properties: {
    trigger: {
      type: "object",
      properties: {
        event: { type: "string", enum: [...TRIGGER_NAMES] },
        days: { type: "number", description: "sweep triggers marked (days) in the guide" },
        hours: { type: "number", description: "sweep triggers marked (hours) in the guide" },
        schedule: { type: "object", description: "schedule.tick only: {every:'day'|'week', hour:0-23, weekday?:0-6 (0=Sun)}" },
        stage: { type: "string", description: "lead.stage_changed: only this stage (an existing stage name)" },
        fieldId: { type: "string", description: "client.field_changed: only this custom field (its id from 'guide')" },
        entity: { type: "string", enum: ["contact", "job", "quote", "invoice"], description: "manual.run: which page the Run button lives on" },
      },
      required: ["event"],
    },
    steps: {
      type: "array",
      description: "In order. A filter first = 'only if…'. A wait then a filter = re-check later. Then actions (the guide lists every action's params).",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["filter", "wait", ...ACTION_TYPES] },
          match: { type: "string", enum: ["all", "any"], description: "filter" },
          rules: { type: "array", description: "filter: [{field, op, value?}] — ops: eq neq contains not_contains empty not_empty in not_in gt gte lt lte is_true is_false weekday weekend between_hours", items: { type: "object", properties: { field: { type: "string" }, op: { type: "string" }, value: { type: "string" } } } },
          expr: { type: "string", description: "filter (advanced): an expression instead of rules" },
          amount: { type: "number", description: "wait" },
          unit: { type: "string", enum: ["hours", "days"], description: "wait" },
          to: { type: "string", enum: ["managers", "assigned", "everyone"], description: "notify_team" },
          userId: { type: "string", description: "notify_user / assign_job (a team member id from 'guide')" },
          title: { type: "string", description: "notify_team / notify_user / create_request / create_appointment / create_quote_draft / create_time_block (template)" },
          body: { type: "string", description: "notify_* details, email_client / email_address / text_client / portal_message / add_client_note / add_job_note (template)" },
          subject: { type: "string", description: "email_client / email_address (template)" },
          message: { type: "string", description: "send_quote_link / send_pay_link: a note to include" },
          stageName: { type: "string", description: "move_lead: an existing stage name" },
          outcome: { type: "string", enum: ["won", "lost"], description: "set_lead_outcome" },
          reason: { type: "string", description: "set_lead_outcome (lost)" },
          fieldId: { type: "string", description: "set_custom_field: a custom field id" },
          value: { type: "string", description: "set_custom_field (template)" },
          label: { type: "string", description: "add_checklist_item" },
          details: { type: "string", description: "create_request" },
          daysOut: { type: "number", description: "create_appointment / create_time_block" },
          hour: { type: "number", description: "create_appointment / create_time_block (0-23)" },
          kind: { type: "string", enum: ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"], description: "create_appointment" },
          templateId: { type: "string", description: "create_agreement: an agreement template id" },
          url: { type: "string", description: "send_webhook: https URL" },
          prompt: { type: "string", description: "atlas_draft: what to write (template); later steps may use {atlas_text}" },
        },
        required: ["type"],
      },
    },
  },
  required: ["trigger", "steps"],
} as const;

async function guide(companyId: string) {
  const facts = await loadDraftFacts(companyId);
  const triggers = TRIGGER_NAMES.map((t) => {
    const d: TriggerDef = TRIGGERS[t];
    return {
      name: t,
      label: d.label,
      entity: d.entity,
      kind: d.kind,
      ...(d.days ? { days: d.days } : {}),
      ...(d.hours ? { hours: d.hours } : {}),
      ...(d.stagePick ? { stagePick: true } : {}),
      ...(d.fieldPick ? { fieldPick: true } : {}),
      ...(d.entityPick ? { entityPick: d.entityPick } : {}),
    };
  });
  const fieldsByEntity: Record<string, { key: string; label: string; type: string; options?: readonly string[] }[]> = {};
  for (const e of Object.keys(ENTITY_FIELDS) as EntityType[]) {
    fieldsByEntity[e] = [...(CLIENT_ENTITIES.includes(e) ? CLIENT_FIELDS : []), ...ENTITY_FIELDS[e], ...COMMON_FIELDS].map((f) => ({ key: f.key, label: f.label, type: f.type, ...(f.options ? { options: f.options } : {}) }));
  }
  return {
    guide: AUTOMATION_GUIDE,
    triggers,
    fieldsByEntity,
    dynamicFields: {
      customClientFields: facts.customFields.map((f) => ({ key: customFieldKey(f.label), id: f.id, label: f.label })),
      webhook: "data_<key> for every top-level key of the JSON body",
      afterAtlasDraft: "atlas_text",
    },
    actions: ACTION_TYPES.map((t) => ({ type: t, label: ACTIONS[t].label, needs: ACTIONS[t].needs, params: ACTIONS[t].params.map((p) => ({ key: p.key, kind: p.kind, required: Boolean(p.required), ...(p.options ? { options: p.options.map((o) => o.value) } : {}) })), hint: ACTIONS[t].hint })),
    pipelineStages: facts.stages,
    teamMembers: facts.users,
    agreementTemplates: facts.agreementTemplates,
    emailLive: facts.emailLive,
    smsLive: facts.smsLive,
    reviewLinkSet: facts.reviewLinkSet,
    quickbooksConnected: facts.quickbooksConnected,
    limits: AUTOMATION_LIMITS,
    builderPage: "/app/automations",
    next: "Easiest: action 'draft' with the owner's words returns a compiled spec. Then action 'test' (how often it would have fired in the last 30 days), tell the user the plain-English summary and the numbers, then stage 'create' (or 'update' with automationId).",
  };
}

/** Warnings a compiled spec deserves before it goes live (things that will be skipped until set up). */
async function warningsFor(companyId: string, spec: AutomationSpec, facts: Awaited<ReturnType<typeof loadDraftFacts>>): Promise<string[]> {
  const warnings: string[] = [];
  const names = new Set(facts.stages.map((s) => s.toLowerCase()));
  for (const s of spec.steps) {
    if (!isActionType(s.type)) continue;
    if (s.type === "move_lead" && typeof s.stageName === "string" && !names.has(s.stageName.toLowerCase())) warnings.push(`No pipeline stage named "${s.stageName}" — the move will be skipped until one exists.`);
    if ((s.type === "email_client" || s.type === "email_address" || s.type === "send_quote_link" || s.type === "send_pay_link" || s.type === "send_payment_reminder") && !facts.emailLive) warnings.push("Email isn't configured on this server yet — email steps will be skipped until it is.");
    if (s.type === "text_client" && !facts.smsLive) warnings.push("The business line can't text yet — text steps will be skipped until its registration is active.");
    if (s.type === "request_review" && !facts.reviewLinkSet) warnings.push("No review link is set (Settings → Branding & client experience) — review requests will be skipped until one is.");
    if (s.type === "push_to_quickbooks" && !facts.quickbooksConnected) warnings.push("QuickBooks isn't connected — that step will be skipped.");
    if ((s.type === "notify_user" || s.type === "assign_job") && typeof s.userId === "string" && !facts.users.some((u) => u.id === s.userId)) warnings.push(`No active team member with id ${s.userId} — pick one from 'guide'.`);
    if (s.type === "create_agreement" && typeof s.templateId === "string" && !facts.agreementTemplates.some((t) => t.id === s.templateId)) warnings.push(`No agreement template with id ${s.templateId}.`);
  }
  if (spec.trigger.event === "lead.stage_changed" && spec.trigger.stage && !names.has(spec.trigger.stage.toLowerCase())) warnings.push(`No pipeline stage named "${spec.trigger.stage}" — the trigger would never fire.`);
  if (spec.trigger.event === "webhook.received") warnings.push("The webhook URL is shown on the rule's page at /app/automations once it's saved.");
  void companyId;
  return Array.from(new Set(warnings));
}

function cardLines(spec: AutomationSpec): string[] {
  const d = describeAutomation(spec);
  return [d.trigger, ...d.steps.map((s) => (s.kind === "action" ? `→ ${s.text}` : `   ${s.text}`))];
}

const manageAutomation: Tool = {
  decl: {
    name: "manage_automation",
    description:
      "Build and maintain the company's automations (managers): 'when X happens, do Y' rules that run by themselves with no AI cost — e.g. email a client when their quote has sat 5 days, text a lead when they reach a stage, wait a day after a job completes then request a review, email the office a Monday-morning count of overdue invoices, notify the assigned salesperson when a webhook lead lands. One trigger, then a linear list of steps (filters, waits, actions). Workflow: 'draft' (the owner's sentence → a compiled spec; or 'guide' + write the spec yourself) → 'test' (dry run: how many times it would have fired in the last 30 days, with samples) → 'create' (card) or 'update' with automationId. 'list' / 'get' show saved rules. The action allowlist in 'guide' is the WHOLE list — never promise charging, deleting, archiving or status changes. The builder page /app/automations shows the same rules as cards.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["guide", "draft", "list", "get", "test", "create", "update"] },
        automationId: { type: "string" },
        prompt: { type: "string", description: "draft: the owner's words. With automationId, it's a change to that rule ('also text them after 2 days')." },
        name: { type: "string", description: "short rule name, e.g. '5-day quote follow-up'" },
        description: { type: "string", description: "one line on why this rule exists" },
        spec: SPEC_PARAM,
        isActive: { type: "boolean", description: "update: pause/resume" },
      },
      required: ["action"],
    },
  },
  allowed: (a) => isManager(a.role),
  run: async (actor, args, ctx) => {
    const action = str(args.action, 10);
    if (action === "guide") return guide(actor.companyId);

    if (action === "draft") {
      const prompt = str(args.prompt, 2000);
      if (prompt.length < 8) return { error: "Pass the owner's words as prompt." };
      const id = str(args.automationId, 40);
      let current = null;
      if (id) {
        const row = await prisma.automation.findFirst({ where: { id, companyId: actor.companyId }, select: AUTOMATION_SELECT });
        if (!row) return { error: "No automation with that id — use action 'list'." };
        current = { name: row.name, description: row.description, spec: specFromJson(row.spec) };
      }
      const facts = await loadDraftFacts(actor.companyId);
      const res = await draftAutomation(actor, { prompt, current, company: facts });
      if (!res.ok) return { error: res.error, ...(res.errors ? { errors: res.errors } : {}), fix: "Say it differently, or write the spec by hand from 'guide'." };
      const warnings = await warningsFor(actor.companyId, res.spec, facts);
      return {
        name: res.name,
        description: res.description,
        spec: res.spec,
        summary: describeAutomation(res.spec),
        notes: res.notes,
        warnings: warnings.length > 0 ? warnings : undefined,
        next: id ? "Run 'test' with this spec, then stage 'update' with the automationId and the spec." : "Run 'test' with this spec, then stage 'create' with name, description and the spec.",
      };
    }

    if (action === "list") {
      const rows = await prisma.automation.findMany({ where: { companyId: actor.companyId }, select: AUTOMATION_SELECT, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
      return {
        automations: rows.map((r) => {
          const spec = specFromJson(r.spec);
          return { id: r.id, name: r.name, isActive: r.isActive, runs: r.runs, lastRunAt: r.lastRunAt, ...(spec ? describeAutomation(spec) : { broken: true }) };
        }),
        page: "/app/automations",
      };
    }

    if (action === "get") {
      const row = await prisma.automation.findFirst({ where: { id: str(args.automationId, 40), companyId: actor.companyId }, select: AUTOMATION_SELECT });
      if (!row) return { error: "No automation with that id — use action 'list'." };
      const spec = specFromJson(row.spec);
      return { ...row, spec, summary: spec ? describeAutomation(spec) : undefined, page: `/app/automations/${row.id}` };
    }

    if (action === "test") {
      let raw: unknown = args.spec;
      const id = str(args.automationId, 40);
      if (!raw && id) {
        const row = await prisma.automation.findFirst({ where: { id, companyId: actor.companyId }, select: { spec: true } });
        if (!row) return { error: "No automation with that id." };
        raw = row.spec;
      }
      if (!raw) return { error: "Pass the spec to test (or an automationId)." };
      const c = compileAutomation(raw);
      if (!c.ok) return { compiles: false, errors: c.errors, fix: "Correct the spec and test again (or use action 'draft')." };
      const facts = await loadDraftFacts(actor.companyId);
      const warnings = await warningsFor(actor.companyId, c.compiled.spec, facts);
      // The engine's preview: {candidates, matches, sample, errors} today; the
      // sample rows may be plain labels or {label, href, rendered} objects.
      const preview = (await previewAutomation(actor.companyId, c.compiled)) as {
        candidates: number;
        matches: number;
        sample: (string | { label: string; href?: string; rendered?: unknown })[];
        errors: string[];
        warnings?: string[];
      };
      const examples = preview.sample.map((s) => (typeof s === "string" ? s : s.label));
      const allWarnings = [...warnings, ...(preview.warnings ?? [])];
      return {
        compiles: true,
        summary: describeAutomation(c.compiled.spec),
        last30Days: { wouldHaveFired: preview.matches, of: preview.candidates, examples },
        conditionErrors: preview.errors.length > 0 ? preview.errors : undefined,
        warnings: allWarnings.length > 0 ? allWarnings : undefined,
        note: "Tell the user the summary and the last-30-days numbers in plain words, then stage create/update.",
      };
    }

    if (action === "create") {
      const name = str(args.name, 80);
      if (!name) return { error: "name is required" };
      if (!args.spec) return { error: "spec is required — use action 'draft' or 'guide' for the format." };
      const dup = await prisma.automation.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (dup) return { error: `An automation named "${name}" already exists (id ${dup.id}) — use action 'update'.` };
      const count = await prisma.automation.count({ where: { companyId: actor.companyId } });
      if (count >= AUTOMATION_LIMITS.perCompany) return { error: `Limit of ${AUTOMATION_LIMITS.perCompany} automations reached.` };
      const c = compileAutomation(args.spec);
      if (!c.ok) return { error: "The spec doesn't compile.", errors: c.errors };
      return {
        ...stage(ctx, {
          kind: "manage_automation",
          title: `Create automation "${name}"`,
          lines: [...cardLines(c.compiled.spec), "Runs by itself from now on — no Atlas tokens per run. Pause, change or delete it any time under Automations."],
          endpoint: "/api/app/automations",
          method: "POST",
          payload: { name, description: str(args.description, 200) || null, spec: c.compiled.spec },
          confirmLabel: "Turn it on",
          href: "/app/automations",
        }),
        note: "Once confirmed it's live. Never stage this create again — use 'list' then 'update' for changes.",
      };
    }

    if (action === "update") {
      const row = await prisma.automation.findFirst({ where: { id: str(args.automationId, 40), companyId: actor.companyId }, select: AUTOMATION_SELECT });
      if (!row) return { error: "No automation with that id — use action 'list' first." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const name = str(args.name, 80);
      if (name && name !== row.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      const description = str(args.description, 200);
      if (description && description !== row.description) {
        payload.description = description;
        lines.push(`Why: ${description}`);
      }
      if (typeof args.isActive === "boolean" && args.isActive !== row.isActive) {
        payload.isActive = args.isActive;
        lines.push(args.isActive ? "Resume it" : "Pause it (nothing fires while paused)");
      }
      if (args.spec) {
        const c = compileAutomation(args.spec);
        if (!c.ok) return { error: "The new spec doesn't compile.", errors: c.errors };
        payload.spec = c.compiled.spec;
        lines.push("New rule:", ...cardLines(c.compiled.spec));
      }
      if (lines.length === 0) return { error: "Nothing to change." };
      return stage(ctx, {
        kind: "manage_automation",
        title: `Update automation "${row.name}"`,
        lines,
        endpoint: `/api/app/automations/${row.id}`,
        method: "PATCH",
        payload,
        href: `/app/automations/${row.id}`,
      });
    }

    return { error: "action must be guide, draft, list, get, test, create or update" };
  },
};

export const automationTools: Tool[] = [manageAutomation];
