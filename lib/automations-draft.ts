import { prisma } from "./db";
import type { Actor } from "./permissions";
import { emailEnabled } from "./email";
import { companyCanSendSms } from "./sms";
import { meteredOneShot, oneShotJson } from "./atlas-oneshot";
import type { AtlasAccess } from "./assistant-access";
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
  TRIGGER_NAMES,
  TRIGGERS,
  type AutomationSpec,
  type EntityType,
  type FieldDef,
  type TriggerDef,
} from "./automations";

/**
 * Atlas drafts an automation from a sentence (docs/plans/automations-builder-
 * 2026-09-24.md, phase 5). One metered call on the assistant's model returns
 * {name, description, spec, notes}; the spec goes through compileAutomation
 * — the same gate the builder's Save and the API use — and a spec that
 * doesn't compile gets ONE repair round with the exact errors before we give
 * up. Nothing here writes to the database: the builder page (or the chat
 * drawer's card) saves it, so the owner always sees the cards first.
 *
 * With `current` set this is a CHANGE: the rule on screen is in the prompt
 * and the model is told to keep everything the owner didn't mention.
 */

export type DraftCompanyFacts = {
  stages: string[];
  customFields: { id: string; label: string }[];
  users: { id: string; name: string }[];
  agreementTemplates: { id: string; name: string }[];
  emailLive: boolean;
  smsLive: boolean;
  reviewLinkSet: boolean;
  quickbooksConnected: boolean;
  assistantName: string;
};

/** What the drafter needs to know about this company (stage names, ids for pickers, what is live). */
export async function loadDraftFacts(companyId: string): Promise<DraftCompanyFacts> {
  const [stages, fields, users, templates, company, qbo, smsLive] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { companyId, isConverted: false }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.contactFieldDef.findMany({ where: { companyId, isActive: true }, select: { id: true, label: true }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractTemplate.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { reviewLink: true, assistantName: true } }),
    prisma.quickBooksConnection.findUnique({ where: { companyId }, select: { id: true } }),
    companyCanSendSms(companyId).catch(() => false),
  ]);
  return {
    stages: stages.map((s) => s.name),
    customFields: fields,
    users,
    agreementTemplates: templates,
    emailLive: emailEnabled(),
    smsLive,
    reviewLinkSet: Boolean(company?.reviewLink),
    quickbooksConnected: Boolean(qbo),
    assistantName: company?.assistantName || "Atlas",
  };
}

export type DraftCurrent = { name: string; description: string | null; spec: AutomationSpec | null };

export type DraftResult =
  | { ok: true; name: string; description: string; spec: AutomationSpec; notes: string[]; atlasTokens: number; access: AtlasAccess }
  | { ok: false; status: number; error: string; errors?: string[]; atlasLocked?: boolean };

type Reply = { name?: unknown; description?: unknown; spec?: unknown; notes?: unknown };

const THINK_DRAFT = 2048;
const THINK_FIX = 1024;

function fieldLine(d: FieldDef): string {
  const opts = d.options ? ` one of ${d.options.join("|")}` : "";
  return `${d.key} (${d.type}${opts})${d.help ? ` — ${d.help}` : ""}`;
}

/** The reference the model reads: the guide, the triggers, the fields per entity, and what this company has. */
export function draftSystem(facts: DraftCompanyFacts, current: DraftCurrent | null): string {
  const entities = new Set<EntityType>();
  const triggers = TRIGGER_NAMES.map((t) => {
    const d: TriggerDef = TRIGGERS[t];
    entities.add(d.entity);
    const extra = [d.days ? `days (default ${d.days.default}: ${d.days.help})` : "", d.hours ? `hours (default ${d.hours.default}: ${d.hours.help})` : "", d.stagePick ? "stage? (a stage name)" : "", d.fieldPick ? "fieldId? (a custom field id)" : "", d.entityPick ? `entity: ${d.entityPick.join("|")}` : "", d.kind === "schedule" ? "schedule {every, hour, weekday?}" : ""]
      .filter(Boolean)
      .join("; ");
    return `  ${t} — "${d.label}" [entity ${d.entity}${extra ? `; ${extra}` : ""}]`;
  });
  const perEntity = (Object.keys(ENTITY_FIELDS) as EntityType[])
    .filter((e) => entities.has(e))
    .map((e) => {
      const own = ENTITY_FIELDS[e].map(fieldLine);
      const client = CLIENT_ENTITIES.includes(e) ? " + every client_* field" : "";
      return `  ${e}:${client}${own.length > 0 ? `\n    ${own.join("\n    ")}` : e === "webhook" ? "\n    data_<key> for every top-level key of the JSON body" : ""}`;
    });
  const custom = facts.customFields.map((f) => `${customFieldKey(f.label)} (id ${f.id}, "${f.label}")`);
  const lines = [
    `You draft automations for ${facts.assistantName}, the assistant inside WorkBench, a field-service app. The owner describes a rule in plain words; you return the spec the engine runs. You never run anything yourself.`,
    "",
    AUTOMATION_GUIDE,
    "",
    "TRIGGERS (name — plain label [entity; options]):",
    ...triggers,
    "",
    "FIELDS available to filters and {templates}, by the trigger's entity:",
    `  client_* (on every entity that has a client): ${CLIENT_FIELDS.map(fieldLine).join("; ")}`,
    `  always: ${COMMON_FIELDS.map(fieldLine).join("; ")}`,
    ...perEntity,
    `  after an atlas_draft step: atlas_text (text)`,
    "",
    "ACTIONS (type(params) — what it does):",
    ...ACTION_TYPES.map((t) => `  ${t}(${ACTIONS[t].params.map((p) => `${p.key}${p.required ? "" : "?"}: ${p.kind}${p.options ? ` one of ${p.options.map((o) => o.value).join("|")}` : ""}`).join(", ")}) — ${ACTIONS[t].hint}`),
    "",
    "THIS COMPANY:",
    `  pipeline stages (move_lead.stageName and trigger.stage must be one of these, spelled exactly): ${facts.stages.length > 0 ? facts.stages.map((s) => `"${s}"`).join(", ") : "(none set up yet — never use move_lead or a stage pick)"}`,
    `  custom client fields (use the key in filters/templates, the id in set_custom_field.fieldId and trigger.fieldId): ${custom.length > 0 ? custom.join(", ") : "(none)"}`,
    `  team members (notify_user.userId / assign_job.userId): ${facts.users.length > 0 ? facts.users.map((u) => `${u.name} (id ${u.id})`).join(", ") : "(none)"}`,
    `  agreement templates (create_agreement.templateId): ${facts.agreementTemplates.length > 0 ? facts.agreementTemplates.map((t) => `${t.name} (id ${t.id})`).join(", ") : "(none — never use create_agreement)"}`,
    `  email to clients: ${facts.emailLive ? "live" : "NOT live yet (email actions will be skipped until it is — still allowed, but say so in notes)"}`,
    `  texting: ${facts.smsLive ? "live" : "NOT live yet (text_client will be skipped until the business line is registered — still allowed, but say so in notes)"}`,
    `  review link: ${facts.reviewLinkSet ? "set" : "not set (request_review will be skipped until it is — say so in notes)"}`,
    `  QuickBooks: ${facts.quickbooksConnected ? "connected" : "not connected (push_to_quickbooks will be skipped — say so in notes)"}`,
    "",
    "RULES:",
    '  - Return ONLY one JSON object: {"name": string (≤60 chars, how the owner would name it), "description": string (one line on why it exists), "spec": {...}, "notes": string[]}. No prose outside the JSON.',
    "  - spec.version is 2; spec.trigger and spec.steps exactly as the reference shows. Use structured filter rules ({field, op, value}); use expr only when rules truly can't say it.",
    "  - Put an optional filter FIRST (right after the trigger) for \"only if…\". Put a wait, then a filter, when the owner wants to re-check later (\"if they still haven't answered\"). A wait can't be the last step.",
    "  - Every action must be allowed for the trigger's entity (client actions need a client; send_quote_link needs a quote trigger; and so on). Never invent an action, a field, a stage name, a user id or a template id.",
    `  - At most ${AUTOMATION_LIMITS.actions} actions and ${AUTOMATION_LIMITS.steps} steps.`,
    "  - Client-facing text (email_client, text_client, portal_message): warm, short, plain, under the business's name, with {client_first_name} and the relevant link ({quote_link}, {pay_link}); never pushy or misleading. Texts under 300 characters. Team notifications: short, factual, with the record number and the client name.",
    "  - If something the owner asked for isn't possible (no such action, no such trigger, a stage that doesn't exist), do the nearest allowed thing and say what you couldn't do in notes. Notes are for the owner: plain, ≤ 5 lines.",
    current
      ? `  - THIS IS A CHANGE to the rule below. Keep everything the owner didn't ask to change (same trigger, same steps, same wording) and return the FULL new spec. In notes, list exactly what changed.\nCURRENT RULE:\n${JSON.stringify({ name: current.name, description: current.description ?? "", spec: current.spec }, null, 0)}`
      : "  - This is a NEW rule. Pick the one trigger that matches the moment the owner described.",
  ];
  return lines.join("\n");
}

function strs(v: unknown, max: number, len: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, max) : [];
}

export async function draftAutomation(
  actor: Pick<Actor, "id" | "companyId">,
  opts: { prompt: string; current?: DraftCurrent | null; company: DraftCompanyFacts }
): Promise<DraftResult> {
  const prompt = opts.prompt.trim().slice(0, 2000);
  if (prompt.length < 8) return { ok: false, status: 400, error: "Describe the rule in a sentence first." };
  const current = opts.current ?? null;
  const system = draftSystem(opts.company, current);
  let userPrompt = current ? `The owner's change request:\n${prompt}` : `The owner's description:\n${prompt}`;
  let tokens = 0;
  let access: AtlasAccess = { level: "off" };
  let lastErrors: string[] = [];

  for (let round = 1; round <= 2; round++) {
    const res = await meteredOneShot(actor, {
      kind: "automation-draft",
      system,
      prompt: userPrompt,
      maxOutputTokens: 2048,
      temperature: 0.2,
      thinkingBudget: round === 1 ? THINK_DRAFT : THINK_FIX,
      timeoutMs: 60_000,
    });
    if (!res.ok) return { ok: false, status: res.status, error: res.error, atlasLocked: res.atlasLocked };
    tokens += res.atlasTokens;
    access = res.access;
    const reply = oneShotJson<Reply>(res.text);
    if (!reply || !reply.spec || typeof reply.spec !== "object") {
      lastErrors = ["The reply had no spec."];
    } else {
      const c = compileAutomation(reply.spec);
      if (c.ok) {
        const name = typeof reply.name === "string" && reply.name.trim() ? reply.name.trim().slice(0, 80) : current?.name ?? describeAutomation(c.compiled.spec).trigger.replace(/^When /, "").slice(0, 80);
        const description = typeof reply.description === "string" ? reply.description.trim().slice(0, 200) : current?.description ?? "";
        return { ok: true, name, description, spec: c.compiled.spec, notes: strs(reply.notes, 6, 200), atlasTokens: tokens, access };
      }
      lastErrors = c.errors;
    }
    // one repair round: the exact compile errors go back with the bad reply
    userPrompt = `${current ? "The owner's change request" : "The owner's description"}:\n${prompt}\n\nYour previous JSON did not compile. Fix these and return the whole JSON again:\n- ${lastErrors.join("\n- ")}\n\nPrevious JSON:\n${JSON.stringify(reply ?? {}).slice(0, 6000)}`;
  }
  return { ok: false, status: 424, error: `${opts.company.assistantName} couldn't turn that into a rule that compiles — try saying it a different way, or build the cards by hand.`, errors: lastErrors.slice(0, 8) };
}
