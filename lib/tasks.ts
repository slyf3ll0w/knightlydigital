import { prisma } from "@/lib/db";
import { notifyUser } from "@/lib/push";
import { reportError } from "@/lib/report-error";
import { zonedMidnight, zonedParts } from "@/lib/timezone";
import type { Actor } from "@/lib/permissions";
import { isManager } from "@/lib/permissions";
import {
  REMINDER_CHOICES,
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
  type ReminderChoice,
  type TaskBucket,
  type TaskDTO,
  type TaskLink,
  type TaskView,
} from "@/lib/tasks-shared";

export * from "@/lib/tasks-shared";

/**
 * Tasks & reminders (docs/plans/tasks-schedule-send-sticky-notes-2026-10-03.md).
 *
 * A task belongs to one person. Dates are stored two ways:
 *   - date-only ("anytime that day"): dueAt = the company's local midnight,
 *     allDay = true. Buckets compare by calendar day in the company's zone.
 *   - timed: dueAt = the instant, allDay = false.
 * Every "today" / "tomorrow" / "overdue" decision goes through the company's
 * timezone — the server runs on UTC (lib/timezone.ts).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Date-only tasks remind (and count as "due") at 9 AM local that day. */
export const ALL_DAY_HOUR = 9;

/** Which group a task sits in, as of `now`, in the company's zone. */
export function taskBucket(dueAt: Date | null, allDay: boolean, now: Date, tz: string): TaskBucket {
  if (!dueAt) return "none";
  const p = zonedParts(tz, now);
  const todayStart = zonedMidnight(tz, p.y, p.m, p.d);
  const tomorrowStart = zonedMidnight(tz, p.y, p.m, p.d + 1);
  const dayAfterStart = zonedMidnight(tz, p.y, p.m, p.d + 2);
  const t = dueAt.getTime();
  if (allDay) {
    if (t < todayStart.getTime()) return "overdue";
  } else if (t < now.getTime()) {
    return "overdue";
  }
  if (t < tomorrowStart.getTime()) return "today";
  if (t < dayAfterStart.getTime()) return "tomorrow";
  return "later";
}

/** The instant a reminder offset counts back from: the due time, or 9 AM
 *  local on a date-only task. */
export function reminderBase(dueAt: Date, allDay: boolean, tz: string): Date {
  if (!allDay) return dueAt;
  const p = zonedParts(tz, dueAt);
  return new Date(zonedMidnight(tz, p.y, p.m, p.d).getTime() + ALL_DAY_HOUR * HOUR_MS);
}

/**
 * remindAt from a choice. `custom` takes an explicit instant; the offset
 * choices count back from the due time (9 AM local for date-only tasks). A
 * task with no date can only take a custom reminder.
 */
export function computeRemindAt(input: {
  dueAt: Date | null;
  allDay: boolean;
  choice: ReminderChoice;
  customAt?: Date | null;
  tz: string;
}): Date | null {
  const { dueAt, allDay, choice, customAt, tz } = input;
  if (choice === "none") return null;
  if (choice === "custom") return customAt && !isNaN(customAt.getTime()) ? customAt : null;
  if (!dueAt) return null;
  const minutes = REMINDER_CHOICES.find((c) => c.key === choice)?.minutes ?? 0;
  return new Date(reminderBase(dueAt, allDay, tz).getTime() - minutes * 60_000);
}

/** The inverse, for the editor: which choice a stored remindAt came from. */
export function reminderChoiceFor(
  dueAt: Date | null,
  allDay: boolean,
  remindAt: Date | null,
  tz: string
): ReminderChoice {
  if (!remindAt) return "none";
  if (!dueAt) return "custom";
  const diff = reminderBase(dueAt, allDay, tz).getTime() - remindAt.getTime();
  const hit = REMINDER_CHOICES.find((c) => c.minutes !== null && c.minutes * 60_000 === diff);
  return hit ? hit.key : "custom";
}

/**
 * Parse the editor's due fields in the company's zone. dueDate = "YYYY-MM-DD",
 * dueTime = "HH:mm" or empty for "anytime". Returns null when nothing was
 * given, or `{ error }` for garbage.
 */
export function parseDue(
  dueDate: unknown,
  dueTime: unknown,
  tz: string
): { dueAt: Date; allDay: boolean } | null | { error: string } {
  if (dueDate === null || dueDate === undefined || dueDate === "") return null;
  if (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "That date doesn't look right." };
  }
  const [y, m, d] = dueDate.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return { error: "That date doesn't look right." };
  const midnight = zonedMidnight(tz, y, m, d);
  if (dueTime === null || dueTime === undefined || dueTime === "") {
    return { dueAt: midnight, allDay: true };
  }
  if (typeof dueTime !== "string" || !/^\d{2}:\d{2}$/.test(dueTime)) {
    return { error: "That time doesn't look right." };
  }
  const [hh, mm] = dueTime.split(":").map(Number);
  if (hh > 23 || mm > 59) return { error: "That time doesn't look right." };
  return { dueAt: new Date(midnight.getTime() + (hh * 60 + mm) * 60_000), allDay: false };
}

/** Editor fields back out of a stored due: the calendar day + wall time in tz. */
export function dueFields(dueAt: Date | null, allDay: boolean, tz: string): { dueDate: string; dueTime: string } {
  if (!dueAt) return { dueDate: "", dueTime: "" };
  const p = zonedParts(tz, dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dueDate: `${p.y}-${pad(p.m)}-${pad(p.d)}`,
    dueTime: allDay ? "" : `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

function fmtDay(d: Date, tz: string, now: Date): string {
  const sameYear = zonedParts(tz, d).y === zonedParts(tz, now).y;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

/**
 * The short line under a task: "Today · 3:00 PM", "Tomorrow", "Fri, Oct 10",
 * "Overdue · Mon, Sep 28 · 9:00 AM". `withDay` keeps the day on today /
 * tomorrow rows that already sit under a Today heading.
 */
export function dueLabel(
  dueAt: Date | null,
  allDay: boolean,
  tz: string,
  now: Date,
  opts: { inGroup?: boolean } = {}
): string | null {
  if (!dueAt) return null;
  const bucket = taskBucket(dueAt, allDay, now, tz);
  const time = allDay ? null : fmtTime(dueAt, tz);
  const p = zonedParts(tz, now);
  const dueP = zonedParts(tz, dueAt);
  const isToday = dueP.y === p.y && dueP.m === p.m && dueP.d === p.d;
  const tomorrow = zonedParts(tz, zonedMidnight(tz, p.y, p.m, p.d + 1));
  const isTomorrow = dueP.y === tomorrow.y && dueP.m === tomorrow.m && dueP.d === tomorrow.d;
  const day = isToday ? "Today" : isTomorrow ? "Tomorrow" : fmtDay(dueAt, tz, now);
  const parts: string[] = [];
  if (bucket === "overdue") parts.push("Overdue");
  if (!opts.inGroup || bucket === "overdue" || bucket === "later") parts.push(day);
  if (time) parts.push(time);
  return parts.length ? parts.join(" · ") : null;
}

export function remindLabel(remindAt: Date | null, tz: string, now: Date): string | null {
  if (!remindAt) return null;
  return `Reminder ${fmtDay(remindAt, tz, now)} · ${fmtTime(remindAt, tz)}`;
}

// ── Rows in / out ───────────────────────────────────────────────────────────

export const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
  job: { select: { id: true, title: true } },
  quote: { select: { id: true, quoteNumber: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  call: { select: { id: true, customerNumber: true, direction: true } },
} as const;

type TaskRow = NonNullable<Awaited<ReturnType<typeof loadTaskRow>>>;

async function loadTaskRow(id: string) {
  return prisma.task.findUnique({ where: { id }, include: taskInclude });
}

export function taskLinks(row: TaskRow): TaskLink[] {
  const links: TaskLink[] = [];
  if (row.contact) {
    const name = `${row.contact.firstName} ${row.contact.lastName}`.trim();
    links.push({ kind: "contact", id: row.contact.id, label: name || "Client", href: `/app/contacts/${row.contact.id}` });
  }
  if (row.job) links.push({ kind: "job", id: row.job.id, label: row.job.title || "Job", href: `/app/jobs/${row.job.id}` });
  if (row.quote) links.push({ kind: "quote", id: row.quote.id, label: `Quote #${row.quote.quoteNumber}`, href: `/app/quotes/${row.quote.id}` });
  if (row.invoice) {
    links.push({ kind: "invoice", id: row.invoice.id, label: `Invoice #${row.invoice.invoiceNumber}`, href: `/app/invoices/${row.invoice.id}` });
  }
  if (row.call) {
    links.push({
      kind: "call",
      id: row.call.id,
      label: `${row.call.direction === "INBOUND" ? "Call from" : "Call to"} ${row.call.customerNumber}`,
      href: `/app/calls/${row.call.id}`,
    });
  }
  return links;
}

export function serializeTask(row: TaskRow, tz: string, now: Date = new Date()): TaskDTO {
  const fields = dueFields(row.dueAt, row.allDay, tz);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt?.toISOString() ?? null,
    allDay: row.allDay,
    dueDate: fields.dueDate,
    dueTime: fields.dueTime,
    remindAt: row.remindAt?.toISOString() ?? null,
    reminder: reminderChoiceFor(row.dueAt, row.allDay, row.remindAt, tz),
    remindDate: dueFields(row.remindAt, false, tz).dueDate,
    remindTime: dueFields(row.remindAt, false, tz).dueTime,
    priority: row.priority,
    doneAt: row.doneAt?.toISOString() ?? null,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee.name,
    createdById: row.createdById,
    createdByName: row.createdBy.name,
    contactId: row.contactId,
    contactPhone: row.contact?.phone ?? null,
    jobId: row.jobId,
    quoteId: row.quoteId,
    invoiceId: row.invoiceId,
    callId: row.callId,
    links: taskLinks(row),
    bucket: taskBucket(row.dueAt, row.allDay, now, tz),
    dueLabel: dueLabel(row.dueAt, row.allDay, tz, now),
    remindLabel: remindLabel(row.remindAt, tz, now),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Sort inside a group: timed before all-day, earlier first, high priority first among equals, then newest. */
export function compareTasks(a: { dueAt: Date | null; allDay: boolean; priority: string; createdAt: Date }, b: typeof a): number {
  const at = a.dueAt ? a.dueAt.getTime() + (a.allDay ? DAY_MS - 1 : 0) : Infinity;
  const bt = b.dueAt ? b.dueAt.getTime() + (b.allDay ? DAY_MS - 1 : 0) : Infinity;
  if (at !== bt) return at - bt;
  if (a.priority !== b.priority) return a.priority === "HIGH" ? -1 : 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

// ── Scope ───────────────────────────────────────────────────────────────────

/**
 * Tasks the actor may see or touch. Managers: the whole company. Everyone
 * else: their own (they can only create for themselves, so creator = assignee).
 */
export function taskScope(actor: Actor): Record<string, unknown> {
  if (isManager(actor.role)) return {};
  return { assigneeId: actor.id };
}

/** Company timezone, read once per request. */
export async function companyTz(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return c?.timezone ?? "America/Chicago";
}

// ── Notifications ───────────────────────────────────────────────────────────

/** "Dave gave you a task" — only when someone else assigned it. */
export async function notifyTaskAssigned(task: { id: string; title: string; assigneeId: string; dueAt: Date | null; allDay: boolean }, actor: Actor, tz: string): Promise<void> {
  if (task.assigneeId === actor.id) return;
  const first = actor.name.split(" ")[0] || actor.name;
  const due = dueLabel(task.dueAt, task.allDay, tz, new Date());
  await notifyUser(task.assigneeId, {
    title: `${first} gave you a task`,
    body: due ? `${task.title} · ${due}` : task.title,
    url: `/app/tasks?task=${task.id}`,
    tag: `task-${task.id}`,
  });
}

export interface TaskReminderSummary {
  checked: number;
  sent: number;
  errors: number;
}

/**
 * Reminder sweep: every open task whose remindAt has passed and hasn't been
 * sent. Runs from the 5-minute ticker (instrumentation.ts) and the hourly
 * cron; each row is claimed with compare-and-set so the two never double up.
 * Push + bell card (notifyUsers records the AutomationNotice row); email only
 * when the person has no push device (lib/notify.ts handles that inside the
 * push layer's callers — tasks keep to push + bell, per the plan).
 */
export async function runTaskReminders(now: Date = new Date()): Promise<TaskReminderSummary> {
  const due = await prisma.task.findMany({
    where: {
      remindAt: { lte: now },
      remindSentAt: null,
      doneAt: null,
      company: { is: { suspendedAt: null } },
      assignee: { is: { isActive: true } },
    },
    include: { company: { select: { timezone: true } } },
    orderBy: { remindAt: "asc" },
    take: 500,
  });
  const summary: TaskReminderSummary = { checked: due.length, sent: 0, errors: 0 };
  for (const task of due) {
    try {
      const claimed = await prisma.task.updateMany({
        where: { id: task.id, remindSentAt: null },
        data: { remindSentAt: now },
      });
      if (claimed.count === 0) continue;
      const tz = task.company.timezone;
      const when = dueLabel(task.dueAt, task.allDay, tz, now);
      await notifyUser(task.assigneeId, {
        title: task.priority === "HIGH" ? `Reminder (high priority): ${task.title}` : `Reminder: ${task.title}`,
        body: when ? `Due ${when.replace(/^Overdue · /, "")}` : undefined,
        url: `/app/tasks?task=${task.id}`,
        tag: `task-${task.id}`,
      });
      summary.sent++;
    } catch (err) {
      summary.errors++;
      reportError("[tasks] reminder failed", task.id, err);
    }
  }
  return summary;
}

// ── Lists ───────────────────────────────────────────────────────────────────

/**
 * `teamView` = the viewer may see everyone's open tasks: an owner/admin on a
 * plan with the task_assign feature (callers resolve `featureAllowedFor`
 * first — the Team tab and the assignee picker hide on the same flag).
 */
export function parseTaskView(raw: unknown, teamView: boolean): TaskView {
  if (raw === "team" && teamView) return "team";
  if (raw === "done") return "done";
  return "mine";
}

/** The page's and the GET route's one query. Done = the last 90 days, newest first. */
export async function listTasks(actor: Actor, view: TaskView, tz: string, now: Date = new Date()): Promise<TaskDTO[]> {
  const where =
    view === "team"
      ? { companyId: actor.companyId, doneAt: null }
      : view === "done"
        ? { companyId: actor.companyId, ...taskScope(actor), doneAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } }
        : { companyId: actor.companyId, assigneeId: actor.id, doneAt: null };
  const rows = await prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: view === "done" ? { doneAt: "desc" } : { createdAt: "desc" },
    take: 500,
  });
  const sorted = view === "done" ? rows : rows.sort(compareTasks);
  return sorted.map((r) => serializeTask(r, tz, now));
}

// ── Dashboard helpers ───────────────────────────────────────────────────────

/** Open tasks for the dashboard: the actor's own, split into overdue / due today. */
export async function dashboardTasks(actor: Actor, tz: string, now: Date) {
  const rows = await prisma.task.findMany({
    where: { companyId: actor.companyId, assigneeId: actor.id, doneAt: null, dueAt: { not: null } },
    include: taskInclude,
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  const overdue: TaskDTO[] = [];
  const today: TaskDTO[] = [];
  for (const row of rows.sort(compareTasks)) {
    const b = taskBucket(row.dueAt, row.allDay, now, tz);
    if (b === "overdue") overdue.push(serializeTask(row, tz, now));
    else if (b === "today") today.push(serializeTask(row, tz, now));
  }
  return { overdue, today };
}

// ── Input validation (shared by POST and PATCH) ─────────────────────────────

export type TaskInput = {
  title?: string;
  notes?: string | null;
  dueAt?: Date | null;
  allDay?: boolean;
  remindAt?: Date | null;
  priority?: "NORMAL" | "HIGH";
  contactId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  callId?: string | null;
};

type PendingReminder = { choice: ReminderChoice; customAt: Date | null };

/**
 * Turn a request body into column values. Only keys present in the body are
 * returned, so PATCH can send a partial. Links are checked against the
 * company; an unknown id answers with an error rather than a silent null.
 * A reminder choice sent without due fields is returned as `pending` and
 * resolved by finishReminder against the stored due.
 */
export async function validateTaskInput(
  body: Record<string, unknown>,
  companyId: string,
  tz: string,
  opts: { requireTitle: boolean }
): Promise<{ data: TaskInput; pending: PendingReminder | null } | { error: string }> {
  const data: TaskInput = {};
  let pending: PendingReminder | null = null;

  if (body.title !== undefined || opts.requireTitle) {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TASK_TITLE_MAX) : "";
    if (!title) return { error: "Give the task a title." };
    data.title = title;
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, TASK_NOTES_MAX) : null;
  }
  if (body.priority !== undefined) {
    if (body.priority !== "NORMAL" && body.priority !== "HIGH") return { error: "Priority must be normal or high." };
    data.priority = body.priority;
  }

  // Due: the editor sends dueDate + dueTime (company-zone wall clock). A
  // missing / empty dueDate clears the date.
  const dueTouched = body.dueDate !== undefined || body.dueTime !== undefined;
  if (dueTouched) {
    const parsed = parseDue(body.dueDate ?? null, body.dueTime ?? null, tz);
    if (parsed && "error" in parsed) return { error: parsed.error };
    data.dueAt = parsed ? parsed.dueAt : null;
    data.allDay = parsed ? parsed.allDay : true;
  }

  // Reminder: a choice relative to the due time, or a custom instant.
  if (body.reminder !== undefined || dueTouched) {
    const choice = (body.reminder ?? "none") as ReminderChoice;
    if (!REMINDER_CHOICES.some((c) => c.key === choice)) return { error: "That reminder option does not exist." };
    // Custom = a wall-clock date + time in the company's zone, parsed like the due time
    let customAt: Date | null = null;
    if (choice === "custom") {
      const parsed = parseDue(body.remindDate ?? null, body.remindTime ?? null, tz);
      if (!parsed || "error" in parsed || parsed.allDay) return { error: "Pick a date and time for the reminder." };
      customAt = parsed.dueAt;
    }
    if (dueTouched) {
      data.remindAt = computeRemindAt({ dueAt: data.dueAt ?? null, allDay: data.allDay ?? true, choice, customAt, tz });
    } else {
      pending = { choice, customAt };
    }
  }

  // Links
  const linkKeys = ["contactId", "jobId", "quoteId", "invoiceId", "callId"] as const;
  for (const key of linkKeys) {
    if (body[key] === undefined) continue;
    const v = body[key];
    if (v === null || v === "") {
      data[key] = null;
      continue;
    }
    if (typeof v !== "string" || v.length > 64) return { error: "That link is not valid." };
    data[key] = v;
  }
  const checks: Promise<boolean>[] = [];
  if (data.contactId) checks.push(prisma.contact.findFirst({ where: { id: data.contactId, companyId }, select: { id: true } }).then(Boolean));
  if (data.jobId) checks.push(prisma.job.findFirst({ where: { id: data.jobId, companyId }, select: { id: true } }).then(Boolean));
  if (data.quoteId) checks.push(prisma.quote.findFirst({ where: { id: data.quoteId, companyId }, select: { id: true } }).then(Boolean));
  if (data.invoiceId) checks.push(prisma.invoice.findFirst({ where: { id: data.invoiceId, companyId }, select: { id: true } }).then(Boolean));
  if (data.callId) checks.push(prisma.call.findFirst({ where: { id: data.callId, companyId }, select: { id: true } }).then(Boolean));
  if (checks.length && !(await Promise.all(checks)).every(Boolean)) {
    return { error: "One of the linked records is not in this account." };
  }
  return { data, pending };
}

/** Resolve a pending reminder choice (a PATCH that changed only the reminder) against the stored due. */
export function finishReminder(
  data: TaskInput,
  pending: PendingReminder | null,
  stored: { dueAt: Date | null; allDay: boolean },
  tz: string
): TaskInput {
  if (!pending) return data;
  return {
    ...data,
    remindAt: computeRemindAt({
      dueAt: data.dueAt !== undefined ? data.dueAt : stored.dueAt,
      allDay: data.allDay !== undefined ? data.allDay : stored.allDay,
      choice: pending.choice,
      customAt: pending.customAt,
      tz,
    }),
  };
}
