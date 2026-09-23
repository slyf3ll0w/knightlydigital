import { prisma } from "../db";
import { isManager } from "../permissions";
import { str, stage, type Tool } from "./core";
import {
  AUTOMATION_GUIDE,
  AUTOMATION_LIMITS,
  compileAutomation,
  describeAutomation,
  fieldsFor,
  FIELD_HELP,
  specFromJson,
  TRIGGER_NAMES,
  ACTION_TYPES,
} from "../automations";
import { AUTOMATION_SELECT, previewAutomation } from "../automations-server";
import { emailEnabled } from "../email";

/**
 * Automation builder (docs/plans/ai-estimators-2026-09-19.md, Batch 2).
 * Same flow as estimate tools: guide → test (dry run over the last 30 days)
 * → create/update card. The card reads as plain English so the owner
 * confirms what will actually happen, unattended, from then on.
 */

const SPEC_PARAM = {
  type: "object",
  description: "The automation. Call action 'guide' first for the exact format, the triggers, the fields per trigger and the action allowlist.",
  properties: {
    trigger: {
      type: "object",
      properties: {
        event: { type: "string", enum: [...TRIGGER_NAMES] },
        days: { type: "number", description: "sweep triggers only (quote.unanswered / invoice.overdue / lead.stale): how many days" },
      },
      required: ["event"],
    },
    when: { type: "string", description: "optional condition expression over the trigger's fields, e.g. quote_total >= 300" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...ACTION_TYPES] },
          to: { type: "string", enum: ["managers", "assigned", "everyone"], description: "notify_team" },
          title: { type: "string", description: "notify_team (template)" },
          body: { type: "string", description: "notify_team / email_client / add_client_note (template)" },
          subject: { type: "string", description: "email_client (template)" },
          stageName: { type: "string", description: "move_lead: existing stage name" },
        },
        required: ["type"],
      },
    },
  },
  required: ["trigger", "actions"],
} as const;

async function guide(companyId: string) {
  const [stages, company] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { companyId, isConverted: false }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { reviewLink: true } }),
  ]);
  const fields: Record<string, string[]> = {};
  for (const t of TRIGGER_NAMES) fields[t] = fieldsFor(t);
  return {
    guide: AUTOMATION_GUIDE,
    fieldsByTrigger: fields,
    fieldHelp: FIELD_HELP,
    pipelineStages: stages.map((s) => s.name),
    emailLive: emailEnabled(),
    reviewLinkSet: Boolean(company?.reviewLink),
    limits: AUTOMATION_LIMITS,
    next: "Draft the spec, run action 'test' (it reports how often it would have fired in the last 30 days), show the user the plain-English summary, then stage 'create'.",
  };
}

const manageAutomation: Tool = {
  decl: {
    name: "manage_automation",
    description:
      "Build and maintain the company's automations (managers): 'when X happens, do Y' rules that run by themselves with no AI cost — e.g. email a client when their quote has sat 5 days, ping the managers when a big quote is approved, move a stale lead, request a review when a job completes. Workflow: 'guide' (triggers, per-trigger fields, the action allowlist, the company's stage names) → 'test' the spec (dry run: how many times it would have fired in the last 30 days, with samples) → 'create' (card) or 'update' with automationId. 'list' / 'get' show saved rules. The action allowlist is the WHOLE list — never promise texting, charging, scheduling or deleting.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["guide", "list", "get", "test", "create", "update"] },
        automationId: { type: "string" },
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

    if (action === "list") {
      const rows = await prisma.automation.findMany({ where: { companyId: actor.companyId }, select: AUTOMATION_SELECT, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
      return {
        automations: rows.map((r) => {
          const spec = specFromJson(r.spec);
          return { id: r.id, name: r.name, isActive: r.isActive, runs: r.runs, lastRunAt: r.lastRunAt, ...(spec ? describeAutomation(spec) : { broken: true }) };
        }),
        page: "/app/settings/automations",
      };
    }

    if (action === "get") {
      const row = await prisma.automation.findFirst({ where: { id: str(args.automationId, 40), companyId: actor.companyId }, select: AUTOMATION_SELECT });
      if (!row) return { error: "No automation with that id — use action 'list'." };
      return { ...row, summary: specFromJson(row.spec) ? describeAutomation(specFromJson(row.spec)!) : undefined };
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
      if (!c.ok) return { compiles: false, errors: c.errors, fix: "Correct the spec and test again." };
      const warnings: string[] = [];
      if (c.compiled.spec.actions.some((a) => a.type === "move_lead")) {
        const names = new Set((await prisma.pipelineStage.findMany({ where: { companyId: actor.companyId, isConverted: false }, select: { name: true } })).map((s) => s.name.toLowerCase()));
        for (const a of c.compiled.spec.actions) if (a.type === "move_lead" && !names.has(a.stageName.toLowerCase())) warnings.push(`No pipeline stage named "${a.stageName}" — the move will be skipped until one exists.`);
      }
      if (c.compiled.spec.actions.some((a) => a.type === "email_client") && !emailEnabled()) warnings.push("Email isn't configured on this server yet — email actions will be skipped until it is.");
      if (c.compiled.spec.actions.some((a) => a.type === "request_review")) {
        const co = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { reviewLink: true } });
        if (!co?.reviewLink) warnings.push("The company has no review link set (Settings → Branding & client experience) — review requests will be skipped until one is.");
      }
      const preview = await previewAutomation(actor.companyId, c.compiled);
      return {
        compiles: true,
        summary: describeAutomation(c.compiled.spec),
        last30Days: { wouldHaveFired: preview.matches, of: preview.candidates, examples: preview.sample },
        conditionErrors: preview.errors.length > 0 ? preview.errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        note: "Tell the user the summary and the last-30-days numbers in plain words, then stage create/update.",
      };
    }

    if (action === "create") {
      const name = str(args.name, 80);
      if (!name) return { error: "name is required" };
      if (!args.spec) return { error: "spec is required — call action 'guide' for the format." };
      const dup = await prisma.automation.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (dup) return { error: `An automation named "${name}" already exists (id ${dup.id}) — use action 'update'.` };
      const count = await prisma.automation.count({ where: { companyId: actor.companyId } });
      if (count >= AUTOMATION_LIMITS.perCompany) return { error: `Limit of ${AUTOMATION_LIMITS.perCompany} automations reached.` };
      const c = compileAutomation(args.spec);
      if (!c.ok) return { error: "The spec doesn't compile.", errors: c.errors };
      const d = describeAutomation(c.compiled.spec);
      return {
        ...stage(ctx, {
          kind: "manage_automation",
          title: `Create automation "${name}"`,
          lines: [d.trigger, ...(d.when ? [d.when] : []), ...d.actions.map((a) => `→ ${a}`), "Runs by itself from now on — no Atlas tokens per run. Pause or delete it any time under Settings → Automations."],
          endpoint: "/api/app/automations",
          method: "POST",
          payload: { name, description: str(args.description, 200) || null, spec: c.compiled.spec },
          confirmLabel: "Turn it on",
          href: "/app/settings/automations",
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
        const d = describeAutomation(c.compiled.spec);
        lines.push("New rule:", d.trigger, ...(d.when ? [d.when] : []), ...d.actions.map((a) => `→ ${a}`));
      }
      if (lines.length === 0) return { error: "Nothing to change." };
      return stage(ctx, {
        kind: "manage_automation",
        title: `Update automation "${row.name}"`,
        lines,
        endpoint: `/api/app/automations/${row.id}`,
        method: "PATCH",
        payload,
        href: "/app/settings/automations",
      });
    }

    return { error: "action must be guide, list, get, test, create or update" };
  },
};

export const automationTools: Tool[] = [manageAutomation];
