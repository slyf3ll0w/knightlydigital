import { prisma } from "./db";
import { notifyUsers, companyManagerIds } from "./push";
import { sendEmail, emailEnabled, companyEmailBlocked, clientMessageEmail } from "./email";
import { sendReviewRequest, invoiceBalance } from "./payments";
import { logActivity } from "./activity";
import {
  AUTOMATION_LIMITS,
  compileAutomation,
  describeAutomation,
  evaluateWhen,
  isSweep,
  renderAction,
  specFromJson,
  triggerEntity,
  SWEEP_NAMES,
  type AutomationCtx,
  type AutomationSpec,
  type CompiledAutomation,
  type EntityType,
  type EventName,
  type SweepName,
  type TriggerName,
} from "./automations";

/**
 * The engine behind automations (lib/automations.ts has the spec).
 *
 *   fireAutomations(companyId, event, entityId)  — call after a commit at
 *     the app's event points (request created, quote sent/approved, job
 *     completed, invoice paid, appointment booked). Never throws, never
 *     awaits anything the caller needs: it's fire-and-forget by design so a
 *     broken rule can't fail the user's action.
 *   runAutomationSweeps(now) — hourly from /api/cron/recurring: the
 *     time-based triggers (quote unanswered N days, invoice N days overdue,
 *     lead stale N days).
 *   previewAutomation(companyId, spec) — dry run over the last 30 days for
 *     the builder's 'test' action ("would have fired 12 of 40 times").
 *
 * Guardrails live here, not in the prompt: dedupe per (automation, entity,
 * event) via AutomationRun rows; a per-company daily run cap; actions run
 * through the same lib helpers the app uses (email gates, review dedupe)
 * and never emit events, so rules cannot cascade.
 */

const DAY = 86_400_000;
const MAX_EMAILS_PER_CONTACT_PER_DAY = 3; // tighter than the human route's 10 — this is a robot
const MAX_EMAILS_PER_COMPANY_PER_DAY = 200; // shared with the human route's count

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
}

// ── context ──────────────────────────────────────────────────────────────────

type Loaded = {
  ctx: AutomationCtx;
  contact: { id: string; firstName: string; email: string | null; pipelineStageId: string | null; assignedToId: string | null } | null;
  jobId: string | null;
  jobTitle: string | null;
  assignedUserId: string | null;
  /** In-app path for team notifications. */
  link: string;
};

const CONTACT_SELECT = {
  id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true, status: true, leadSource: true,
  city: true, zip: true, pipelineStageId: true, assignedToId: true, stageChangedAt: true,
  pipelineStage: { select: { name: true } }, assignedTo: { select: { id: true, name: true } },
} as const;

type ContactRow = {
  id: string; firstName: string; lastName: string; companyName: string | null; email: string | null; phone: string | null; status: string;
  leadSource: string | null; city: string | null; zip: string | null; pipelineStageId: string | null; assignedToId: string | null;
  stageChangedAt: Date | null; pipelineStage: { name: string } | null; assignedTo: { id: string; name: string } | null;
};

function baseCtx(contact: ContactRow | null, companyName: string, days: number): AutomationCtx {
  return {
    client_name: contact ? `${contact.firstName} ${contact.lastName}`.trim() : "",
    client_first_name: contact?.firstName ?? "",
    client_last_name: contact?.lastName ?? "",
    client_email: contact?.email ?? "",
    client_phone: contact?.phone ?? "",
    client_company: contact?.companyName ?? "",
    client_status: contact?.status ?? "",
    lead_source: contact?.leadSource ?? "",
    stage: contact?.pipelineStage?.name ?? "",
    city: contact?.city ?? "",
    zip: contact?.zip ?? "",
    assigned_to: contact?.assignedTo?.name ?? "",
    company_name: companyName,
    days,
  };
}

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const dayStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const daysSince = (d: Date | null | undefined, now: Date) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY)) : 0);

/** Load the entity + its client into the flat field context the spec language reads. */
export async function loadContext(
  companyId: string,
  entityType: EntityType,
  entityId: string,
  now = new Date()
): Promise<Loaded | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, timezone: true } });
  if (!company) return null;
  const tz = company.timezone ?? "America/Chicago";

  switch (entityType) {
    case "request": {
      const r = await prisma.request.findFirst({ where: { id: entityId, companyId }, include: { contact: { select: CONTACT_SELECT } } });
      if (!r) return null;
      return {
        ctx: { ...baseCtx(r.contact, company.name, 0), request_number: r.requestNumber, request_title: r.title, request_details: r.details ?? "", request_source: r.source },
        contact: r.contact, jobId: null, jobTitle: null, assignedUserId: r.contact.assignedToId, link: `/app/requests/${r.id}`,
      };
    }
    case "appointment": {
      const a = await prisma.appointment.findFirst({ where: { id: entityId, companyId }, include: { contact: { select: CONTACT_SELECT } } });
      if (!a) return null;
      const when = a.scheduledAt.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return {
        ctx: { ...baseCtx(a.contact, company.name, 0), appointment_number: a.appointmentNumber ?? 0, appointment_title: a.title, appointment_type: a.type, appointment_when: when },
        contact: a.contact, jobId: null, jobTitle: null, assignedUserId: a.assignedToId ?? a.contact.assignedToId, link: `/app/appointments/${a.id}`,
      };
    }
    case "quote": {
      const q = await prisma.quote.findFirst({ where: { id: entityId, companyId }, include: { contact: { select: CONTACT_SELECT } } });
      if (!q) return null;
      const total = money(q.total);
      return {
        ctx: {
          ...baseCtx(q.contact, company.name, daysSince(q.sentAt, now)),
          quote_number: q.quoteNumber, quote_title: q.title ?? "", quote_total: total, total, quote_status: q.status, quote_link: `${baseUrl()}/quote/${q.publicToken}`,
        },
        contact: q.contact, jobId: q.jobId, jobTitle: q.title, assignedUserId: q.contact.assignedToId, link: `/app/quotes/${q.id}`,
      };
    }
    case "job": {
      const j = await prisma.job.findFirst({
        where: { id: entityId, companyId },
        include: { contact: { select: CONTACT_SELECT }, lineItems: { select: { quantity: true, unitPrice: true } }, assignments: { select: { userId: true }, take: 1 } },
      });
      if (!j) return null;
      const total = money(j.lineItems.reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0));
      return {
        ctx: { ...baseCtx(j.contact, company.name, 0), job_number: j.jobNumber, job_title: j.title, job_address: j.address ?? "", job_total: total, total },
        contact: j.contact, jobId: j.id, jobTitle: j.title, assignedUserId: j.assignments[0]?.userId ?? j.contact.assignedToId, link: `/app/jobs/${j.id}`,
      };
    }
    case "invoice": {
      const i = await prisma.invoice.findFirst({ where: { id: entityId, companyId }, include: { contact: { select: CONTACT_SELECT }, payments: true, job: { select: { title: true } } } });
      if (!i) return null;
      const total = money(i.total);
      const balance = money(invoiceBalance(i));
      return {
        ctx: {
          ...baseCtx(i.contact, company.name, daysSince(i.dueDate, now)),
          invoice_number: i.invoiceNumber, invoice_total: total, total, invoice_balance: balance, invoice_status: i.status, due_date: dayStr(i.dueDate), pay_link: `${baseUrl()}/pay/${i.publicToken}`,
        },
        contact: i.contact, jobId: i.jobId, jobTitle: i.job?.title ?? i.subject ?? null, assignedUserId: i.contact?.assignedToId ?? null, link: `/app/invoices/${i.id}`,
      };
    }
    case "contact": {
      const c = await prisma.contact.findFirst({ where: { id: entityId, companyId }, select: CONTACT_SELECT });
      if (!c) return null;
      return { ctx: baseCtx(c, company.name, daysSince(c.stageChangedAt, now)), contact: c, jobId: null, jobTitle: null, assignedUserId: c.assignedToId, link: `/app/contacts/${c.id}` };
    }
  }
}

// ── actions ──────────────────────────────────────────────────────────────────

type AutomationRow = { id: string; companyId: string; name: string; createdById: string | null };

async function actorUserId(companyId: string, createdById: string | null): Promise<string | null> {
  if (createdById) {
    const u = await prisma.user.findFirst({ where: { id: createdById, companyId, isActive: true }, select: { id: true } });
    if (u) return u.id;
  }
  const owner = await prisma.user.findFirst({ where: { companyId, role: "OWNER", isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return owner?.id ?? null;
}

async function runAction(
  automation: AutomationRow,
  compiled: CompiledAutomation,
  index: number,
  loaded: Loaded
): Promise<string> {
  const action = compiled.spec.actions[index];
  const rendered = renderAction(compiled, index, loaded.ctx);
  const { companyId } = automation;

  switch (action.type) {
    case "notify_team": {
      let ids: string[];
      if (action.to === "assigned") ids = loaded.assignedUserId ? [loaded.assignedUserId] : await companyManagerIds(companyId);
      else if (action.to === "everyone") ids = (await prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true } })).map((u) => u.id);
      else ids = await companyManagerIds(companyId);
      await notifyUsers(ids, { title: rendered.title.slice(0, 120), body: rendered.body?.slice(0, 500), url: loaded.link, tag: `automation-${automation.id}-${loaded.link}` });
      return `notified ${ids.length}`;
    }
    case "email_client": {
      const contact = loaded.contact;
      if (!contact?.email) return "skipped: client has no email";
      if (!emailEnabled()) return "skipped: email not configured";
      if (await companyEmailBlocked(companyId)) return "skipped: company email blocked";
      const since = new Date(Date.now() - DAY);
      const [toContact, byCompany] = await Promise.all([
        prisma.clientMessage.count({ where: { companyId, contactId: contact.id, createdAt: { gte: since } } }),
        prisma.clientMessage.count({ where: { companyId, createdAt: { gte: since } } }),
      ]);
      if (toContact >= MAX_EMAILS_PER_CONTACT_PER_DAY) return "skipped: client already emailed 3× today";
      if (byCompany >= MAX_EMAILS_PER_COMPANY_PER_DAY) return "skipped: company daily email cap";
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, phone: true, website: true, email: true, logoUrl: true } });
      if (!company) return "skipped: company missing";
      const senderId = await actorUserId(companyId, automation.createdById);
      const signature = [company.name, company.phone, company.website].filter(Boolean).join("\n");
      const subject = rendered.subject.slice(0, 150);
      const body = rendered.body.slice(0, 10_000);
      const message = await prisma.clientMessage.create({
        data: { companyId, contactId: contact.id, senderId, subject, body, signature },
      });
      const email = clientMessageEmail({
        messageSubject: subject,
        messageBody: body,
        signature,
        logoUrl: company.logoUrl,
        readUrl: `${baseUrl()}/message/${message.publicToken}`,
        pixelUrl: `${baseUrl()}/api/public/open/${message.publicToken}`,
      });
      const sent = await sendEmail({
        companyId, to: contact.email, subject: email.subject, html: email.html,
        replyTo: company.email || undefined, fromName: company.name, pageBackground: "#ffffff",
      });
      if (!sent) {
        await prisma.clientMessage.delete({ where: { id: message.id } }).catch(() => {});
        return "failed: email send failed";
      }
      return `emailed ${contact.email}`;
    }
    case "add_client_note": {
      if (!loaded.contact) return "skipped: no client";
      const userId = await actorUserId(companyId, automation.createdById);
      if (!userId) return "skipped: no active owner to author the note";
      await prisma.contactNote.create({ data: { contactId: loaded.contact.id, userId, body: `[${automation.name}] ${rendered.body}`.slice(0, 2000) } });
      return "note added";
    }
    case "move_lead": {
      if (!loaded.contact) return "skipped: no client";
      const stage = await prisma.pipelineStage.findFirst({
        where: { companyId, isConverted: false, name: { equals: action.stageName, mode: "insensitive" } },
        select: { id: true, name: true },
      });
      if (!stage) return `skipped: no stage named "${action.stageName}"`;
      if (loaded.contact.pipelineStageId === stage.id) return "skipped: already in that stage";
      if (!loaded.contact.pipelineStageId) return "skipped: client is not on the leads board";
      const first = await prisma.contact.findFirst({ where: { companyId, pipelineStageId: stage.id }, orderBy: { pipelineOrder: "asc" }, select: { pipelineOrder: true } });
      await prisma.contact.update({
        where: { id: loaded.contact.id },
        data: { pipelineStageId: stage.id, pipelineOrder: (first?.pipelineOrder ?? 1) - 1, stageChangedAt: new Date() },
      });
      return `moved to ${stage.name}`;
    }
    case "request_review": {
      if (!loaded.contact?.email) return "skipped: client has no email";
      await sendReviewRequest({ companyId, contactId: loaded.contact.id, jobId: loaded.jobId, email: loaded.contact.email, contactFirstName: loaded.contact.firstName, jobTitle: loaded.jobTitle });
      return "review request sent (or already sent recently)";
    }
  }
}

// ── firing ───────────────────────────────────────────────────────────────────

const ACTIVITY_ENTITY: Partial<Record<EntityType, "invoice" | "quote" | "job" | "contact">> = { invoice: "invoice", quote: "quote", job: "job", contact: "contact" };

/** Run one automation against one entity once. Returns the run status. */
async function fireOne(
  automation: AutomationRow,
  compiled: CompiledAutomation,
  event: TriggerName,
  entityType: EntityType,
  entityId: string,
  loaded: Loaded,
  now: Date
): Promise<"ok" | "skipped" | "failed"> {
  const already = await prisma.automationRun.findFirst({ where: { automationId: automation.id, entityId, event }, select: { id: true } });
  if (already) return "skipped";

  const okToday = await prisma.automationRun.count({ where: { companyId: automation.companyId, status: "ok", createdAt: { gte: new Date(now.getTime() - DAY) } } });
  const record = (status: "ok" | "skipped" | "failed", detail: string) =>
    prisma.automationRun.create({ data: { automationId: automation.id, companyId: automation.companyId, event, entityType, entityId, status, detail: detail.slice(0, 1000) } });

  if (okToday >= AUTOMATION_LIMITS.dailyRuns) {
    await record("skipped", `daily cap of ${AUTOMATION_LIMITS.dailyRuns} runs reached`);
    return "skipped";
  }
  const verdict = evaluateWhen(compiled, loaded.ctx);
  if (!verdict.fire) {
    // Conditions that don't match are the common case — don't log a row for
    // every non-match, only for a broken expression (so the owner can see it)
    if (verdict.error) await record("failed", `condition error: ${verdict.error}`);
    return "skipped";
  }

  const results: string[] = [];
  let failed = false;
  for (let i = 0; i < compiled.spec.actions.length; i++) {
    try {
      const r = await runAction(automation, compiled, i, loaded);
      results.push(`${compiled.spec.actions[i].type}: ${r}`);
      if (r.startsWith("failed")) failed = true;
    } catch (err) {
      failed = true;
      results.push(`${compiled.spec.actions[i].type}: failed — ${err instanceof Error ? err.message : "error"}`);
      console.error(`[automations] ${automation.name} action ${i} threw`, err);
    }
  }
  await record(failed ? "failed" : "ok", results.join(" · "));
  await prisma.automation.update({ where: { id: automation.id }, data: { runs: { increment: 1 }, lastRunAt: now } }).catch(() => {});
  const activityEntity = ACTIVITY_ENTITY[entityType];
  if (activityEntity) {
    logActivity({ companyId: automation.companyId, userName: "Automation", entityType: activityEntity, entityId, action: "automation", detail: `${automation.name}: ${results.join("; ")}`.slice(0, 500) });
  }
  return failed ? "failed" : "ok";
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

/**
 * App event happened (after commit). Fire-and-forget: returns immediately,
 * runs in the background, never throws.
 */
export function fireAutomations(companyId: string, event: EventName, entityId: string): void {
  void (async () => {
    try {
      const list = await activeAutomations(companyId, event);
      if (list.length === 0) return;
      const entityType = triggerEntity(event);
      const now = new Date();
      const loaded = await loadContext(companyId, entityType, entityId, now);
      if (!loaded) return;
      for (const { row, compiled } of list) await fireOne(row, compiled, event, entityType, entityId, loaded, now);
    } catch (err) {
      console.error(`[automations] ${event} dispatch failed`, err);
    }
  })();
}

// ── sweeps (time-based triggers) ─────────────────────────────────────────────

/** Entities a sweep trigger matches right now (or, for preview, over a window). */
async function sweepCandidates(companyId: string, event: SweepName, days: number, now: Date, take: number): Promise<string[]> {
  const cutoff = new Date(now.getTime() - days * DAY);
  switch (event) {
    case "quote.unanswered": {
      const rows = await prisma.quote.findMany({
        where: { companyId, status: "AWAITING_RESPONSE", sentAt: { not: null, lte: cutoff } },
        select: { id: true }, orderBy: { sentAt: "asc" }, take,
      });
      return rows.map((r) => r.id);
    }
    case "invoice.overdue": {
      const rows = await prisma.invoice.findMany({
        where: { companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] }, dueDate: { not: null, lte: cutoff } },
        select: { id: true }, orderBy: { dueDate: "asc" }, take,
      });
      return rows.map((r) => r.id);
    }
    case "lead.stale": {
      const rows = await prisma.contact.findMany({
        where: { companyId, status: "LEAD", pipelineStageId: { not: null }, stageChangedAt: { not: null, lte: cutoff }, pipelineStage: { isConverted: false } },
        select: { id: true }, orderBy: { stageChangedAt: "asc" }, take,
      });
      return rows.map((r) => r.id);
    }
  }
}

/** Hourly: every active sweep automation across every company. */
export async function runAutomationSweeps(now = new Date()): Promise<{ automations: number; fired: number; errors: number }> {
  const rows = await prisma.automation.findMany({
    where: { isActive: true, OR: SWEEP_NAMES.map((e) => ({ spec: { path: ["trigger", "event"], equals: e } })) },
    select: { id: true, companyId: true, name: true, createdById: true, spec: true },
  });
  let fired = 0;
  let errors = 0;
  for (const row of rows) {
    const c = compileAutomation(row.spec);
    if (!c.ok) continue;
    const event = c.compiled.spec.trigger.event;
    if (!isSweep(event)) continue;
    const days = c.compiled.spec.trigger.days ?? 7;
    try {
      const ids = await sweepCandidates(row.companyId, event, days, now, AUTOMATION_LIMITS.sweepBatch);
      if (ids.length === 0) continue;
      const done = await prisma.automationRun.findMany({ where: { automationId: row.id, event, entityId: { in: ids } }, select: { entityId: true } });
      const seen = new Set(done.map((d) => d.entityId));
      const entityType = triggerEntity(event);
      for (const id of ids) {
        if (seen.has(id)) continue;
        const loaded = await loadContext(row.companyId, entityType, id, now);
        if (!loaded) continue;
        const status = await fireOne(row, c.compiled, event, entityType, id, loaded, now);
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

// ── preview (dry run for the builder) ────────────────────────────────────────

/** Entities the trigger would have matched over the last `windowDays`. */
async function previewCandidates(companyId: string, spec: AutomationSpec, now: Date, windowDays: number, take: number): Promise<string[]> {
  const since = new Date(now.getTime() - windowDays * DAY);
  const event = spec.trigger.event;
  if (isSweep(event)) return sweepCandidates(companyId, event, spec.trigger.days ?? 7, now, take);
  switch (event) {
    case "request.created":
      return (await prisma.request.findMany({ where: { companyId, createdAt: { gte: since } }, select: { id: true }, take })).map((r) => r.id);
    case "appointment.scheduled":
      return (await prisma.appointment.findMany({ where: { companyId, createdAt: { gte: since } }, select: { id: true }, take })).map((r) => r.id);
    case "quote.sent":
      return (await prisma.quote.findMany({ where: { companyId, sentAt: { gte: since } }, select: { id: true }, take })).map((r) => r.id);
    case "quote.approved":
      return (await prisma.quote.findMany({ where: { companyId, approvedAt: { gte: since } }, select: { id: true }, take })).map((r) => r.id);
    case "job.completed":
      return (await prisma.job.findMany({ where: { companyId, completedAt: { gte: since } }, select: { id: true }, take })).map((r) => r.id);
    case "invoice.paid":
      return (await prisma.invoice.findMany({ where: { companyId, paidAt: { gte: since } }, select: { id: true }, take })).map((r) => r.id);
  }
}

export async function previewAutomation(
  companyId: string,
  compiled: CompiledAutomation,
  windowDays = 30
): Promise<{ candidates: number; matches: number; sample: string[]; errors: string[] }> {
  const now = new Date();
  const ids = await previewCandidates(companyId, compiled.spec, now, windowDays, 100);
  const entityType = triggerEntity(compiled.spec.trigger.event);
  let matches = 0;
  const sample: string[] = [];
  const errors = new Set<string>();
  for (const id of ids) {
    const loaded = await loadContext(companyId, entityType, id, now);
    if (!loaded) continue;
    const v = evaluateWhen(compiled, loaded.ctx);
    if (v.error) errors.add(v.error);
    if (!v.fire) continue;
    matches++;
    if (sample.length < 3) {
      const label = String(loaded.ctx.client_name || "") || id;
      try {
        const first = renderAction(compiled, 0, loaded.ctx);
        const headline = first.subject ?? first.title ?? first.body ?? "";
        sample.push(headline ? `${label} — ${headline.slice(0, 80)}` : label);
      } catch (e) {
        errors.add(`template: ${(e as Error).message}`);
        sample.push(label);
      }
    }
  }
  return { candidates: ids.length, matches, sample, errors: [...errors] };
}

/** API shape for a stored automation (routes + settings page). */
export function automationShape(r: { id: string; name: string; description: string | null; spec: unknown; isActive: boolean; runs: number; lastRunAt: Date | null; updatedAt: Date }) {
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
    summary: spec ? describeAutomation(spec) : null,
    broken: !spec,
  };
}

export const AUTOMATION_SELECT = {
  id: true, name: true, description: true, spec: true, isActive: true, createdById: true, runs: true, lastRunAt: true, createdAt: true, updatedAt: true,
} as const;
