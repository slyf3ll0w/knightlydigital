import { randomBytes } from "crypto";
import { prisma } from "./db";
import { logActivity } from "./activity";
import { emailEnabled } from "./email";
import { companyCanSendSms } from "./sms";
import { aiEnabled } from "./ai";
import { atlasAccess, ATLAS_ACCESS_SELECT } from "./assistant-access";
import { isQuickBooksConfigured } from "./quickbooks";
import { zonedMidnight, zonedParts } from "./timezone";
import {
  AUTOMATION_LIMITS,
  compileAutomation,
  describeAutomation,
  evaluateFilter,
  evaluateWhen,
  isAction,
  renderAction,
  specFromJson,
  stepLabel,
  triggerEntity,
  TRIGGERS,
  type AutomationSpec,
  type CompiledAutomation,
  type EntityType,
  type TriggerDef,
  type TriggerName,
} from "./automations";
import { baseUrl, loadContext, type Loaded } from "./automations-context";
import { runAction, type AutomationRow } from "./automations-actions";

/**
 * The engine behind automations (lib/automations.ts has the spec, this
 * file runs it). Three ways a rule fires:
 *
 *   fireAutomations(companyId, event, entityId, meta?)  — call after a
 *     commit at the app's event points (lead moved, quote sent, job
 *     completed, call ended …). Never throws, never awaits anything the
 *     caller needs: fire-and-forget by design so a broken rule can't fail
 *     the user's action.
 *   runAutomationSweeps(now) / runScheduledAutomations(now) /
 *   runAutomationResumes(now) — hourly from /api/cron/recurring: the
 *     time-based triggers, the "every day at 8am" rules, and runs parked at
 *     a wait step.
 *   runManual(...) / the public webhook route — a person or an outside
 *     system pressed the button.
 *
 * Steps run in order. A filter that fails ends the run ("stopped at step
 * N"); a wait parks it in AutomationJob and the resume sweep reloads the
 * record FRESH before carrying on, so "wait 2 days, then only if the quote
 * is still unanswered" reads the real status.
 *
 * Guardrails live here, not in the prompt: dedupe per (automation, entity,
 * event) via AutomationRun rows; a per-company daily run cap; actions run
 * through the same lib helpers the app uses and never emit events, so rules
 * cannot cascade. previewAutomation() is the builder's dry run.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

export { loadContext } from "./automations-context";

// ── firing ───────────────────────────────────────────────────────────────────

const ACTIVITY_ENTITY: Partial<Record<EntityType, "invoice" | "quote" | "job" | "contact" | "payment">> = { invoice: "invoice", quote: "quote", job: "job", contact: "contact", payment: "payment" };

type RunStatus = "ok" | "skipped" | "failed" | "waiting";

/**
 * Run steps from `start`. Returns the status plus the log lines so far.
 * A wait step parks the run: the caller persists the AutomationJob.
 */
async function runSteps(
  automation: AutomationRow,
  compiled: CompiledAutomation,
  loaded: Loaded,
  start: number,
  now: Date,
  lines: string[]
): Promise<{ status: RunStatus; lines: string[]; waitUntil?: Date; nextStep?: number }> {
  let failed = false;
  for (let i = start; i < compiled.spec.steps.length; i++) {
    const step = compiled.spec.steps[i];
    if (step.type === "filter") {
      const v = evaluateFilter(compiled, i, loaded.ctx);
      if (v.error) {
        lines.push(`filter: error — ${v.error}`);
        return { status: "failed", lines };
      }
      if (!v.pass) {
        lines.push(`stopped at step ${i + 1}: ${stepLabel(step, compiled.spec)}`);
        return { status: "skipped", lines };
      }
      continue;
    }
    if (step.type === "wait") {
      const ms = step.amount * (step.unit === "hours" ? HOUR : DAY);
      lines.push(`waiting ${step.amount} ${step.unit}`);
      return { status: "waiting", lines, waitUntil: new Date(now.getTime() + ms), nextStep: i + 1 };
    }
    try {
      const r = await runAction(automation, compiled, i, loaded, now);
      lines.push(`${step.type}: ${r}`);
      if (r.startsWith("failed")) failed = true;
    } catch (err) {
      failed = true;
      lines.push(`${step.type}: failed — ${err instanceof Error ? err.message : "error"}`);
      console.error(`[automations] ${automation.name} step ${i} threw`, err);
    }
  }
  return { status: failed ? "failed" : "ok", lines };
}

/** Run one automation against one entity once. Returns the run status. */
async function fireOne(
  automation: AutomationRow,
  compiled: CompiledAutomation,
  event: TriggerName,
  entityType: EntityType,
  entityId: string,
  loaded: Loaded,
  now: Date,
  payload: Record<string, unknown> | null = null
): Promise<RunStatus> {
  const already = await prisma.automationRun.findFirst({ where: { automationId: automation.id, entityId, event }, select: { id: true } });
  if (already) return "skipped";

  const record = (status: RunStatus, detail: string) =>
    prisma.automationRun.create({ data: { automationId: automation.id, companyId: automation.companyId, event, entityType, entityId, status, detail: detail.slice(0, 1000) } });

  const okToday = await prisma.automationRun.count({ where: { companyId: automation.companyId, status: "ok", createdAt: { gte: new Date(now.getTime() - DAY) } } });
  if (okToday >= AUTOMATION_LIMITS.dailyRuns) {
    await record("skipped", `daily cap of ${AUTOMATION_LIMITS.dailyRuns} runs reached`);
    return "skipped";
  }

  // The leading filter is the common "doesn't apply" case — no row for a
  // plain non-match, only for a broken expression (so the owner can see it)
  const verdict = evaluateWhen(compiled, loaded.ctx);
  if (!verdict.fire) {
    if (verdict.error) await record("failed", `condition error: ${verdict.error}`);
    return "skipped";
  }
  const start = compiled.spec.steps[0]?.type === "filter" ? 1 : 0;

  const result = await runSteps(automation, compiled, loaded, start, now, []);
  const run = await record(result.status, result.lines.join(" · "));
  if (result.status === "waiting" && result.waitUntil && result.nextStep !== undefined) {
    await prisma.automationJob.create({
      data: { automationId: automation.id, runId: run.id, companyId: automation.companyId, event, entityType, entityId, nextStep: result.nextStep, resumeAt: result.waitUntil, status: "waiting", payload: payload ? (payload as object) : undefined },
    });
  }
  await prisma.automation.update({ where: { id: automation.id }, data: { runs: { increment: 1 }, lastRunAt: now } }).catch(() => {});
  const activityEntity = ACTIVITY_ENTITY[entityType];
  if (activityEntity && result.status !== "skipped") {
    logActivity({ companyId: automation.companyId, userName: "Automation", entityType: activityEntity, entityId: entityId.split(":")[0], action: "automation", detail: `${automation.name}: ${result.lines.join("; ")}`.slice(0, 500) });
  }
  return result.status;
}

async function activeAutomations(companyId: string, event: TriggerName) {
  const rows = await prisma.automation.findMany({
    where: { companyId, isActive: true, spec: { path: ["trigger", "event"], equals: event } },
    select: { id: true, companyId: true, name: true, createdById: true, spec: true },
  });
  return rows.flatMap((r) => {
    const c = compileAutomation(r.spec);
    return c.ok ? [{ row: r, compiled: c.compiled }] : [];
  });
}

export type FireMeta = { stage?: string; fieldId?: string };

function triggerMatches(spec: AutomationSpec, meta: FireMeta | undefined): boolean {
  const t = spec.trigger;
  if (t.stage && (meta?.stage ?? "").trim().toLowerCase() !== t.stage.trim().toLowerCase()) return false;
  if (t.fieldId && meta?.fieldId !== t.fieldId) return false;
  return true;
}

/**
 * App event happened (after commit). Fire-and-forget: returns immediately,
 * runs in the background, never throws. `meta` narrows option-bearing
 * triggers (lead.stage_changed → which stage; client.field_changed → which
 * field).
 */
/**
 * Events that happen to the same record again and again (a second note, a
 * later clock-in, another stage move). Their dedupe key carries the moment,
 * so a rule fires on every occurrence; everything else fires once per record.
 */
const REPEATABLE_EVENTS = new Set<TriggerName>([
  "lead.contact_made", "lead.no_answer", "lead.stage_changed", "client.note_added", "client.field_changed", "client.archived", "client.reactivated",
  "job.scheduled", "job.assigned", "job.on_my_way", "job.photo_added", "job.note_added", "job.archived", "appointment.rescheduled",
  "invoice.partially_paid", "invoice.past_due", "quote.changes_requested", "contract.sent", "team.clock_in", "team.clock_out",
  "subscription.paused", "review.requested", "request.archived",
]);

export function fireAutomations(companyId: string, event: TriggerName, rawEntityId: string, meta?: FireMeta): void {
  void (async () => {
    try {
      const list = (await activeAutomations(companyId, event)).filter(({ compiled }) => triggerMatches(compiled.spec, meta));
      if (list.length === 0) return;
      const now = new Date();
      const entityId = REPEATABLE_EVENTS.has(event) ? `${rawEntityId}:${now.getTime()}` : rawEntityId;
      // manual.run picks its entity per rule; every other trigger has one entity
      const byEntity = new Map<EntityType, Loaded | null>();
      for (const { row, compiled } of list) {
        const entityType = compiled.entity;
        if (!byEntity.has(entityType)) byEntity.set(entityType, await loadContext(companyId, entityType, entityId, now));
        const loaded = byEntity.get(entityType);
        if (!loaded) continue;
        await fireOne(row, compiled, event, entityType, entityId, loaded, now);
      }
    } catch (err) {
      console.error(`[automations] ${event} dispatch failed`, err);
    }
  })();
}

/** An inbound webhook hit an automation's URL. Awaited by the route (it answers 202 either way). */
export async function fireWebhook(automation: { id: string; companyId: string; name: string; createdById: string | null; spec: unknown }, entityId: string, payload: Record<string, unknown>): Promise<void> {
  const c = compileAutomation(automation.spec);
  if (!c.ok || c.compiled.spec.trigger.event !== "webhook.received") return;
  const now = new Date();
  const loaded = await loadContext(automation.companyId, "webhook", entityId, now, { payload });
  if (!loaded) return;
  await fireOne(automation, c.compiled, "webhook.received", "webhook", entityId, loaded, now, payload);
}

/** A person pressed Run on a record. Re-runnable: the dedupe key carries a timestamp. */
export async function runManual(automation: { id: string; companyId: string; name: string; createdById: string | null; spec: unknown }, entityId: string): Promise<{ status: RunStatus; detail: string } | { error: string }> {
  const c = compileAutomation(automation.spec);
  if (!c.ok) return { error: "This automation needs rebuilding." };
  if (c.compiled.spec.trigger.event !== "manual.run") return { error: "Only 'Run on a record' automations can be run by hand." };
  const now = new Date();
  const entityType = c.compiled.entity;
  const loaded = await loadContext(automation.companyId, entityType, entityId, now);
  if (!loaded) return { error: "That record wasn't found." };
  const key = `${entityId}:${now.getTime()}`;
  const status = await fireOne(automation, c.compiled, "manual.run", entityType, key, loaded, now);
  const run = await prisma.automationRun.findFirst({ where: { automationId: automation.id, entityId: key }, select: { detail: true } });
  return { status, detail: run?.detail ?? (status === "skipped" ? "The conditions didn't match." : "") };
}

// ── resumes (runs parked at a wait) ──────────────────────────────────────────

export async function runAutomationResumes(now = new Date()): Promise<{ resumed: number; cancelled: number; errors: number }> {
  const jobs = await prisma.automationJob.findMany({
    where: { status: "waiting", resumeAt: { lte: now } },
    orderBy: { resumeAt: "asc" },
    take: 500,
    include: { automation: { select: { id: true, companyId: true, name: true, createdById: true, spec: true, isActive: true } } },
  });
  let resumed = 0;
  let cancelled = 0;
  let errors = 0;
  for (const job of jobs) {
    try {
      // Claim it first — an overlapping tick must not resume the same run twice
      const claimed = await prisma.automationJob.updateMany({ where: { id: job.id, status: "waiting" }, data: { status: "done" } });
      if (claimed.count === 0) continue;
      const c = compileAutomation(job.automation.spec);
      if (!job.automation.isActive || !c.ok) {
        await prisma.automationJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
        await prisma.automationRun.update({ where: { id: job.runId }, data: { status: "skipped", detail: "cancelled: automation paused or changed while waiting" } }).catch(() => {});
        cancelled++;
        continue;
      }
      const payload = job.payload && typeof job.payload === "object" ? (job.payload as Record<string, unknown>) : null;
      const loaded = await loadContext(job.companyId, job.entityType as EntityType, job.entityId, now, { payload });
      const prior = await prisma.automationRun.findUnique({ where: { id: job.runId }, select: { detail: true } });
      const lines = prior?.detail ? [prior.detail] : [];
      if (!loaded) {
        await prisma.automationRun.update({ where: { id: job.runId }, data: { status: "skipped", detail: [...lines, "stopped: the record is gone"].join(" · ").slice(0, 1000) } }).catch(() => {});
        continue;
      }
      const result = await runSteps(job.automation, c.compiled, loaded, job.nextStep, now, lines);
      await prisma.automationRun.update({ where: { id: job.runId }, data: { status: result.status, detail: result.lines.join(" · ").slice(0, 1000) } });
      if (result.status === "waiting" && result.waitUntil && result.nextStep !== undefined) {
        await prisma.automationJob.create({
          data: { automationId: job.automationId, runId: job.runId, companyId: job.companyId, event: job.event, entityType: job.entityType, entityId: job.entityId, nextStep: result.nextStep, resumeAt: result.waitUntil, status: "waiting", payload: job.payload ?? undefined },
        });
      }
      resumed++;
    } catch (err) {
      errors++;
      console.error(`[automations] resume ${job.id} failed`, err);
    }
  }
  return { resumed, cancelled, errors };
}

/** Pausing or deleting a rule: nothing parked should wake up later. */
export async function cancelAutomationJobs(automationId: string): Promise<number> {
  const r = await prisma.automationJob.updateMany({ where: { automationId, status: "waiting" }, data: { status: "cancelled" } });
  return r.count;
}

// ── sweeps (time-based triggers) ─────────────────────────────────────────────

type Candidate = { id: string; days?: number; hours?: number };

function todayIn(tz: string, now: Date): { start: Date; end: Date; key: string } {
  const p = zonedParts(tz, now);
  const start = zonedMidnight(tz, p.y, p.m, p.d);
  return { start, end: new Date(start.getTime() + DAY), key: `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` };
}

/** Entities a sweep trigger matches right now. */
async function sweepCandidates(companyId: string, event: TriggerName, spec: AutomationSpec, now: Date, take: number, tz: string): Promise<Candidate[]> {
  const def: TriggerDef = TRIGGERS[event];
  const days = spec.trigger.days ?? def.days?.default ?? 7;
  const hours = spec.trigger.hours ?? def.hours?.default ?? 24;
  const dayCutoff = new Date(now.getTime() - days * DAY);
  const daysOf = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / DAY) : days);
  switch (event) {
    case "quote.unanswered": {
      const rows = await prisma.quote.findMany({ where: { companyId, status: "AWAITING_RESPONSE", sentAt: { not: null, lte: dayCutoff } }, select: { id: true, sentAt: true }, orderBy: { sentAt: "asc" }, take });
      return rows.map((r) => ({ id: r.id, days: daysOf(r.sentAt) }));
    }
    case "invoice.overdue": {
      const rows = await prisma.invoice.findMany({ where: { companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] }, dueDate: { not: null, lte: dayCutoff } }, select: { id: true, dueDate: true }, orderBy: { dueDate: "asc" }, take });
      return rows.map((r) => ({ id: r.id, days: daysOf(r.dueDate) }));
    }
    case "lead.stale": {
      const rows = await prisma.contact.findMany({
        where: { companyId, status: "LEAD", pipelineStageId: { not: null }, stageChangedAt: { not: null, lte: dayCutoff }, pipelineStage: { isConverted: false } },
        select: { id: true, stageChangedAt: true }, orderBy: { stageChangedAt: "asc" }, take,
      });
      return rows.map((r) => ({ id: r.id, days: daysOf(r.stageChangedAt) }));
    }
    case "client.inactive": {
      // ACTIVE clients whose most recent completed job is older than N days (clients with no jobs are skipped)
      const rows = await prisma.contact.findMany({
        where: { companyId, status: "ACTIVE", jobs: { some: { completedAt: { not: null } }, none: { completedAt: { gt: dayCutoff } } } },
        select: { id: true, jobs: { where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" }, take: 1, select: { completedAt: true } } },
        take,
      });
      return rows.map((r) => ({ id: r.id, days: daysOf(r.jobs[0]?.completedAt ?? null) }));
    }
    case "appointment.upcoming": {
      const rows = await prisma.appointment.findMany({
        where: { companyId, status: "SCHEDULED", tentative: false, scheduledAt: { gt: now, lte: new Date(now.getTime() + hours * HOUR) } },
        select: { id: true, scheduledAt: true }, orderBy: { scheduledAt: "asc" }, take,
      });
      return rows.map((r) => ({ id: r.id, hours: Math.max(0, Math.round((r.scheduledAt.getTime() - now.getTime()) / HOUR)) }));
    }
    case "appointment.no_quote": {
      const cutoff = new Date(now.getTime() - hours * HOUR);
      const rows = await prisma.appointment.findMany({
        where: { companyId, status: "COMPLETED", scheduledAt: { lte: cutoff, gte: new Date(now.getTime() - 60 * DAY) } },
        select: { id: true, scheduledAt: true, contactId: true }, orderBy: { scheduledAt: "asc" }, take: take * 2,
      });
      const out: Candidate[] = [];
      for (const r of rows) {
        const quoted = await prisma.quote.findFirst({ where: { companyId, contactId: r.contactId, sentAt: { gte: r.scheduledAt } }, select: { id: true } });
        if (!quoted) out.push({ id: r.id, hours: Math.round((now.getTime() - r.scheduledAt.getTime()) / HOUR) });
        if (out.length >= take) break;
      }
      return out;
    }
    case "job.today": {
      const { start, end, key } = todayIn(tz, now);
      const rows = await prisma.job.findMany({ where: { companyId, status: "ACTIVE", scheduledAt: { gte: start, lt: end } }, select: { id: true }, orderBy: { scheduledAt: "asc" }, take });
      return rows.map((r) => ({ id: `${r.id}:${key}`, days: 0 }));
    }
    case "job.unscheduled": {
      const rows = await prisma.job.findMany({ where: { companyId, status: "ACTIVE", scheduledAt: null, outsourced: false, createdAt: { lte: dayCutoff } }, select: { id: true, createdAt: true }, orderBy: { createdAt: "asc" }, take });
      return rows.map((r) => ({ id: r.id, days: daysOf(r.createdAt) }));
    }
    case "job.completed_ago": {
      const rows = await prisma.job.findMany({ where: { companyId, completedAt: { not: null, lte: dayCutoff, gte: new Date(dayCutoff.getTime() - 30 * DAY) } }, select: { id: true, completedAt: true }, orderBy: { completedAt: "asc" }, take });
      return rows.map((r) => ({ id: r.id, days: daysOf(r.completedAt) }));
    }
    case "team.long_shift": {
      const cutoff = new Date(now.getTime() - hours * HOUR);
      const rows = await prisma.timeEntry.findMany({ where: { companyId, endedAt: null, startedAt: { lte: cutoff } }, select: { id: true, startedAt: true }, take });
      return rows.map((r) => ({ id: r.id, hours: Math.floor((now.getTime() - r.startedAt.getTime()) / HOUR) }));
    }
    default:
      return [];
  }
}

const AUTOMATION_ROW_SELECT = { id: true, companyId: true, name: true, createdById: true, spec: true, company: { select: { timezone: true } } } as const;

/** Hourly: every active sweep automation across every company. */
export async function runAutomationSweeps(now = new Date()): Promise<{ automations: number; fired: number; errors: number }> {
  const sweepNames = (Object.keys(TRIGGERS) as TriggerName[]).filter((t) => TRIGGERS[t].kind === "sweep");
  const rows = await prisma.automation.findMany({
    where: { isActive: true, OR: sweepNames.map((e) => ({ spec: { path: ["trigger", "event"], equals: e } })) },
    select: AUTOMATION_ROW_SELECT,
  });
  let fired = 0;
  let errors = 0;
  for (const row of rows) {
    const c = compileAutomation(row.spec);
    if (!c.ok) continue;
    const event = c.compiled.spec.trigger.event;
    if (TRIGGERS[event].kind !== "sweep") continue;
    try {
      const tz = row.company.timezone ?? "America/Chicago";
      const cands = await sweepCandidates(row.companyId, event, c.compiled.spec, now, AUTOMATION_LIMITS.sweepBatch, tz);
      if (cands.length === 0) continue;
      const done = await prisma.automationRun.findMany({ where: { automationId: row.id, event, entityId: { in: cands.map((x) => x.id) } }, select: { entityId: true } });
      const seen = new Set(done.map((d) => d.entityId));
      const entityType = c.compiled.entity;
      for (const cand of cands) {
        if (seen.has(cand.id)) continue;
        const loaded = await loadContext(row.companyId, entityType, cand.id, now, { days: cand.days, hours: cand.hours });
        if (!loaded) continue;
        const status = await fireOne(row, c.compiled, event, entityType, cand.id, loaded, now);
        if (status === "ok") fired++;
        if (status === "failed") errors++;
      }
    } catch (err) {
      errors++;
      console.error(`[automations] sweep ${row.name} failed`, err);
    }
  }
  return { automations: rows.length, fired, errors };
}

/** ISO-8601 week key ("2026-W39") for the weekly schedule dedupe. */
function isoWeek(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Hourly: "every day at 8am" / "every Monday at 7am" rules whose hour is now, in the company's zone. */
export async function runScheduledAutomations(now = new Date()): Promise<{ automations: number; fired: number; errors: number }> {
  const rows = await prisma.automation.findMany({ where: { isActive: true, spec: { path: ["trigger", "event"], equals: "schedule.tick" } }, select: AUTOMATION_ROW_SELECT });
  let fired = 0;
  let errors = 0;
  for (const row of rows) {
    const c = compileAutomation(row.spec);
    if (!c.ok) continue;
    const sc = c.compiled.spec.trigger.schedule;
    if (!sc) continue;
    const tz = row.company.timezone ?? "America/Chicago";
    const p = zonedParts(tz, now);
    if (p.hour !== sc.hour) continue;
    if (sc.every === "week" && p.weekday !== (sc.weekday ?? 1)) continue;
    const key = sc.every === "week" ? isoWeek(p.y, p.m, p.d) : `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    const entityId = `${row.companyId}:${key}`;
    try {
      const loaded = await loadContext(row.companyId, "company", entityId, now);
      if (!loaded) continue;
      const status = await fireOne(row, c.compiled, "schedule.tick", "company", entityId, loaded, now);
      if (status === "ok") fired++;
      if (status === "failed") errors++;
    } catch (err) {
      errors++;
      console.error(`[automations] schedule ${row.name} failed`, err);
    }
  }
  return { automations: rows.length, fired, errors };
}

// ── preview (dry run for the builder) ────────────────────────────────────────

/** Entities the trigger would have matched over the last `windowDays` (or the sweep's live candidates). */
async function previewCandidates(companyId: string, spec: AutomationSpec, entity: EntityType, now: Date, windowDays: number, take: number, tz: string): Promise<Candidate[]> {
  const since = new Date(now.getTime() - windowDays * DAY);
  const event = spec.trigger.event;
  const def: TriggerDef = TRIGGERS[event];
  if (def.kind === "sweep") return sweepCandidates(companyId, event, spec, now, take, tz);
  if (def.kind === "schedule") return [{ id: `${companyId}:preview` }];
  if (def.kind === "webhook") return [{ id: "preview" }];
  const ids = (rows: { id: string }[]) => rows.map((r) => ({ id: r.id }));
  const w = { companyId, createdAt: { gte: since } };
  switch (event) {
    case "quote.sent": return ids(await prisma.quote.findMany({ where: { companyId, sentAt: { gte: since } }, select: { id: true }, take }));
    case "quote.viewed": return ids(await prisma.quote.findMany({ where: { companyId, firstViewedAt: { gte: since } }, select: { id: true }, take }));
    case "quote.approved": return ids(await prisma.quote.findMany({ where: { companyId, approvedAt: { gte: since } }, select: { id: true }, take }));
    case "quote.changes_requested": return ids(await prisma.quote.findMany({ where: { companyId, status: "CHANGES_REQUESTED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "quote.converted": return ids(await prisma.quote.findMany({ where: { companyId, status: "CONVERTED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "quote.deposit_paid": return ids(await prisma.quote.findMany({ where: { companyId, invoices: { some: { kind: "DEPOSIT", paidAt: { gte: since } } } }, select: { id: true }, take }));
    case "job.completed": return ids(await prisma.job.findMany({ where: { companyId, completedAt: { gte: since } }, select: { id: true }, take }));
    case "job.scheduled": return ids(await prisma.job.findMany({ where: { companyId, scheduledAt: { not: null }, updatedAt: { gte: since } }, select: { id: true }, take }));
    case "job.started": return ids(await prisma.job.findMany({ where: { companyId, timeEntries: { some: { startedAt: { gte: since } } } }, select: { id: true }, take }));
    case "job.on_my_way": return ids(await prisma.job.findMany({ where: { companyId, onMyWaySentAt: { gte: since } }, select: { id: true }, take }));
    case "job.archived": return ids(await prisma.job.findMany({ where: { companyId, status: "ARCHIVED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "subscription.visit_generated": return ids(await prisma.job.findMany({ where: { ...w, subscriptionId: { not: null } }, select: { id: true }, take }));
    case "invoice.sent": return ids(await prisma.invoice.findMany({ where: { companyId, issuedAt: { gte: since } }, select: { id: true }, take }));
    case "invoice.viewed": return ids(await prisma.invoice.findMany({ where: { companyId, firstViewedAt: { gte: since } }, select: { id: true }, take }));
    case "invoice.paid": return ids(await prisma.invoice.findMany({ where: { companyId, paidAt: { gte: since } }, select: { id: true }, take }));
    case "invoice.partially_paid": return ids(await prisma.invoice.findMany({ where: { companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] }, payments: { some: { paidAt: { gte: since } } } }, select: { id: true }, take }));
    case "invoice.past_due": return ids(await prisma.invoice.findMany({ where: { companyId, status: "PAST_DUE" }, select: { id: true }, take }));
    case "payment.autocharge_failed": return ids(await prisma.invoice.findMany({ where: { companyId, autoChargeLastError: { not: null }, updatedAt: { gte: since } }, select: { id: true }, take }));
    case "payment.refunded": return ids(await prisma.payment.findMany({ where: { companyId, refunds: { some: { createdAt: { gte: since } } } }, select: { id: true }, take }));
    case "appointment.rescheduled": return ids(await prisma.appointment.findMany({ where: { companyId, status: "SCHEDULED", updatedAt: { gte: since }, createdAt: { lt: since } }, select: { id: true }, take }));
    case "appointment.cancelled": return ids(await prisma.appointment.findMany({ where: { companyId, status: "CANCELLED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "appointment.completed": return ids(await prisma.appointment.findMany({ where: { companyId, status: "COMPLETED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "appointment.no_show": return ids(await prisma.appointment.findMany({ where: { companyId, status: "NO_SHOW", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "lead.created": return ids(await prisma.contact.findMany({ where: { ...w, status: "LEAD" }, select: { id: true }, take }));
    case "lead.stage_changed": return ids(await prisma.contact.findMany({ where: { companyId, stageChangedAt: { gte: since }, ...(spec.trigger.stage ? { pipelineStage: { name: { equals: spec.trigger.stage, mode: "insensitive" } } } : {}) }, select: { id: true }, take }));
    case "lead.won": return ids(await prisma.contact.findMany({ where: { companyId, wonAt: { gte: since } }, select: { id: true }, take }));
    case "lead.lost": return ids(await prisma.contact.findMany({ where: { companyId, lostAt: { gte: since } }, select: { id: true }, take }));
    case "lead.contact_made":
    case "lead.no_answer": {
      const calls = await prisma.call.findMany({ where: { ...w, contactId: { not: null } }, select: { contactId: true }, distinct: ["contactId"], take });
      return calls.flatMap((c) => (c.contactId ? [{ id: c.contactId }] : []));
    }
    case "client.created": return ids(await prisma.contact.findMany({ where: { ...w, status: "ACTIVE" }, select: { id: true }, take }));
    case "client.archived": return ids(await prisma.contact.findMany({ where: { companyId, status: "ARCHIVED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "client.reactivated": return ids(await prisma.contact.findMany({ where: { companyId, status: "ACTIVE", updatedAt: { gte: since }, createdAt: { lt: since } }, select: { id: true }, take }));
    case "client.note_added": return ids(await prisma.contact.findMany({ where: { companyId, contactNotes: { some: { createdAt: { gte: since } } } }, select: { id: true }, take }));
    case "client.field_changed": return ids(await prisma.contact.findMany({ where: { companyId, updatedAt: { gte: since }, customFields: { not: { equals: null } } }, select: { id: true }, take }));
    case "review.requested": {
      const reqs = await prisma.reviewRequest.findMany({ where: { companyId, sentAt: { gte: since }, contactId: { not: null } }, select: { contactId: true }, distinct: ["contactId"], take });
      return reqs.flatMap((r) => (r.contactId ? [{ id: r.contactId }] : []));
    }
    case "request.converted": return ids(await prisma.request.findMany({ where: { companyId, status: "CONVERTED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "request.archived": return ids(await prisma.request.findMany({ where: { companyId, status: "ARCHIVED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "call.inbound": return ids(await prisma.call.findMany({ where: { ...w, direction: "INBOUND", status: "COMPLETED" }, select: { id: true }, take }));
    case "call.missed": return ids(await prisma.call.findMany({ where: { ...w, status: "MISSED" }, select: { id: true }, take }));
    case "call.voicemail": return ids(await prisma.call.findMany({ where: { ...w, status: "VOICEMAIL" }, select: { id: true }, take }));
    case "call.outbound_completed": return ids(await prisma.call.findMany({ where: { ...w, direction: "OUTBOUND", status: "COMPLETED" }, select: { id: true }, take }));
    case "message.text_received": return ids(await prisma.portalMessage.findMany({ where: { ...w, direction: "INBOUND", via: "sms" }, select: { id: true }, take }));
    case "message.portal_received": return ids(await prisma.portalMessage.findMany({ where: { ...w, direction: "INBOUND", via: "portal" }, select: { id: true }, take }));
    case "message.email_opened": return ids(await prisma.clientMessage.findMany({ where: { companyId, firstViewedAt: { gte: since } }, select: { id: true }, take }));
    case "contract.sent": return ids(await prisma.contract.findMany({ where: { companyId, sentAt: { gte: since } }, select: { id: true }, take }));
    case "contract.signed": return ids(await prisma.contract.findMany({ where: { companyId, signedAt: { gte: since } }, select: { id: true }, take }));
    case "team.clock_in": return ids(await prisma.timeEntry.findMany({ where: { companyId, startedAt: { gte: since } }, select: { id: true }, take }));
    case "team.clock_out": return ids(await prisma.timeEntry.findMany({ where: { companyId, endedAt: { gte: since } }, select: { id: true }, take }));
    case "team.member_added": return ids(await prisma.user.findMany({ where: { ...w, isActive: true }, select: { id: true }, take }));
    case "subscription.started": return ids(await prisma.subscription.findMany({ where: w, select: { id: true }, take }));
    case "subscription.paused": return ids(await prisma.subscription.findMany({ where: { companyId, status: "PAUSED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "subscription.cancelled": return ids(await prisma.subscription.findMany({ where: { companyId, status: "CANCELLED", updatedAt: { gte: since } }, select: { id: true }, take }));
    case "manual.run": {
      // the five most recent records of the chosen kind
      const n = 5;
      switch (entity) {
        case "job": return ids(await prisma.job.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, select: { id: true }, take: n }));
        case "quote": return ids(await prisma.quote.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, select: { id: true }, take: n }));
        case "invoice": return ids(await prisma.invoice.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, select: { id: true }, take: n }));
        default: return ids(await prisma.contact.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, select: { id: true }, take: n }));
      }
    }
    default: {
      // everything else: the entity's recent rows by createdAt
      switch (entity) {
        case "request": return ids(await prisma.request.findMany({ where: w, select: { id: true }, take }));
        case "appointment": return ids(await prisma.appointment.findMany({ where: w, select: { id: true }, take }));
        case "quote": return ids(await prisma.quote.findMany({ where: w, select: { id: true }, take }));
        case "job": return ids(await prisma.job.findMany({ where: w, select: { id: true }, take }));
        case "invoice": return ids(await prisma.invoice.findMany({ where: w, select: { id: true }, take }));
        case "contact": return ids(await prisma.contact.findMany({ where: w, select: { id: true }, take }));
        case "payment": return ids(await prisma.payment.findMany({ where: w, select: { id: true }, take }));
        case "call": return ids(await prisma.call.findMany({ where: w, select: { id: true }, take }));
        case "message": return ids(await prisma.portalMessage.findMany({ where: w, select: { id: true }, take }));
        case "contract": return ids(await prisma.contract.findMany({ where: w, select: { id: true }, take }));
        case "time_entry": return ids(await prisma.timeEntry.findMany({ where: w, select: { id: true }, take }));
        case "team_member": return ids(await prisma.user.findMany({ where: w, select: { id: true }, take }));
        case "subscription": return ids(await prisma.subscription.findMany({ where: w, select: { id: true }, take }));
        case "expense": return ids(await prisma.expense.findMany({ where: w, select: { id: true }, take }));
        default: return [];
      }
    }
  }
}

export type PreviewSample = { label: string; href: string; rendered: { step: number; type: string; text: string }[] };
export type Preview = { candidates: number; matches: number; sample: PreviewSample[]; errors: string[]; warnings: string[] };

/** What a step would do for this record, as one line for the preview. */
function renderStepLine(compiled: CompiledAutomation, index: number, loaded: Loaded): string {
  const step = compiled.spec.steps[index];
  if (step.type === "filter") return evaluateFilter(compiled, index, loaded.ctx).pass ? "passes" : "stops here";
  if (step.type === "wait") return `waits ${step.amount} ${step.unit}`;
  const r = renderAction(compiled, index, loaded.ctx);
  const parts = Object.values(r).filter(Boolean);
  const text = parts.length > 0 ? parts.join(" — ") : stepLabel(step, compiled.spec);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** Things that will make actions skip, checked once for the builder's Test button. */
export async function automationWarnings(companyId: string, compiled: CompiledAutomation): Promise<string[]> {
  const out: string[] = [];
  const actions = compiled.spec.steps.filter(isAction);
  const has = (t: string) => actions.some((a) => a.type === t);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { ...ATLAS_ACCESS_SELECT, reviewLink: true } });
  if (has("move_lead")) {
    const names = new Set((await prisma.pipelineStage.findMany({ where: { companyId, isConverted: false }, select: { name: true } })).map((s) => s.name.toLowerCase()));
    for (const a of actions) if (a.type === "move_lead" && !names.has(String(a.stageName).toLowerCase())) out.push(`No pipeline stage named "${a.stageName}" — the move will be skipped until one exists.`);
  }
  if ((has("email_client") || has("email_address") || has("send_quote_link") || has("send_pay_link") || has("send_payment_reminder")) && !emailEnabled()) out.push("Email isn't configured on this server yet — email steps will be skipped until it is.");
  if ((has("text_client") || has("send_appointment_reminder")) && !(await companyCanSendSms(companyId))) out.push("Texting isn't live on your business line yet — text steps will be skipped (reminders fall back to email).");
  if (has("request_review") && !company?.reviewLink) out.push("No review link is set (Settings → Branding & client experience) — review requests will be skipped until one is.");
  if (has("push_to_quickbooks")) {
    const conn = isQuickBooksConfigured() ? await prisma.quickBooksConnection.findUnique({ where: { companyId }, select: { id: true } }) : null;
    if (!conn) out.push("QuickBooks isn't connected — the push will be skipped.");
  }
  if (has("atlas_draft")) {
    const access = company ? atlasAccess(company) : null;
    if (!aiEnabled() || !access || access.level === "off") out.push("Atlas isn't available on this account — the draft step will be skipped.");
    else if (access.level === "locked") out.push("Atlas is out of tokens right now — the draft step will be skipped until the meter refills.");
  }
  const userIds = actions.flatMap((a) => (a.type === "notify_user" || a.type === "assign_job") && a.userId ? [String(a.userId)] : []);
  if (userIds.length > 0) {
    const active = new Set((await prisma.user.findMany({ where: { companyId, isActive: true, id: { in: userIds } }, select: { id: true } })).map((u) => u.id));
    if (userIds.some((id) => !active.has(id))) out.push("A chosen team member is no longer active — that step will be skipped.");
  }
  if (has("set_custom_field")) {
    const ids = actions.flatMap((a) => (a.type === "set_custom_field" && a.fieldId ? [String(a.fieldId)] : []));
    const defs = new Set((await prisma.contactFieldDef.findMany({ where: { companyId, isActive: true, id: { in: ids } }, select: { id: true } })).map((d) => d.id));
    if (ids.some((id) => !defs.has(id))) out.push("A chosen custom field no longer exists — that step will be skipped.");
  }
  if (has("create_agreement")) {
    const ids = actions.flatMap((a) => (a.type === "create_agreement" && a.templateId ? [String(a.templateId)] : []));
    const tpls = new Set((await prisma.contractTemplate.findMany({ where: { companyId, isActive: true, id: { in: ids } }, select: { id: true } })).map((t) => t.id));
    if (ids.some((id) => !tpls.has(id))) out.push("A chosen agreement template no longer exists — that step will be skipped.");
  }
  return out;
}

export async function previewAutomation(companyId: string, compiled: CompiledAutomation, windowDays = 30): Promise<Preview> {
  const now = new Date();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  const tz = company?.timezone ?? "America/Chicago";
  const entity = compiled.entity;
  const cands = await previewCandidates(companyId, compiled.spec, entity, now, windowDays, 100, tz);
  let matches = 0;
  const sample: PreviewSample[] = [];
  const errors = new Set<string>();
  for (const cand of cands) {
    const loaded = await loadContext(companyId, entity, cand.id, now, { days: cand.days, hours: cand.hours, payload: entity === "webhook" ? { example: "value", name: "Sample Lead", source: "webhook" } : null });
    if (!loaded) continue;
    const v = evaluateWhen(compiled, loaded.ctx);
    if (v.error) errors.add(v.error);
    if (!v.fire) continue;
    matches++;
    if (sample.length < 3) {
      const rendered: PreviewSample["rendered"] = [];
      try {
        compiled.spec.steps.forEach((st, i) => {
          if (i === 0 && st.type === "filter") return;
          rendered.push({ step: i + 1, type: st.type, text: renderStepLine(compiled, i, loaded) });
        });
      } catch (e) {
        errors.add(`template: ${(e as Error).message}`);
      }
      sample.push({ label: loaded.label || cand.id, href: loaded.link, rendered });
    }
  }
  const warnings = await automationWarnings(companyId, compiled);
  return { candidates: cands.length, matches, sample, errors: [...errors], warnings };
}

// ── API shape ────────────────────────────────────────────────────────────────

export function mintWebhookToken(): string {
  return randomBytes(32).toString("base64url");
}

export function webhookUrlFor(token: string | null | undefined): string | null {
  return token ? `${baseUrl()}/api/public/automations/${token}` : null;
}

/** API shape for a stored automation (routes + pages). */
export function automationShape(r: { id: string; name: string; description: string | null; spec: unknown; isActive: boolean; runs: number; lastRunAt: Date | null; updatedAt: Date; webhookToken?: string | null }) {
  const spec = specFromJson(r.spec);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.isActive,
    runs: r.runs,
    lastRunAt: r.lastRunAt,
    updatedAt: r.updatedAt,
    spec,
    entity: spec ? triggerEntity(spec.trigger) : null,
    summary: spec ? describeAutomation(spec) : null,
    broken: !spec,
    webhookUrl: spec?.trigger.event === "webhook.received" ? webhookUrlFor(r.webhookToken) : null,
  };
}

export type AutomationShape = ReturnType<typeof automationShape>;

export const AUTOMATION_SELECT = {
  id: true, companyId: true, name: true, description: true, spec: true, isActive: true, createdById: true, runs: true, lastRunAt: true, createdAt: true, updatedAt: true, webhookToken: true,
} as const;
