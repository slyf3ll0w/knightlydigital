import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager, contactScope, jobScope, viaContactScope, type Actor } from "@/lib/permissions";
import { featureAllowedFor } from "@/lib/plan-gate";
import { companyTz, listTasks, parseTaskView } from "@/lib/tasks";
import type { TaskLink, TaskPrefill } from "@/lib/tasks-shared";
import TasksClient from "./TasksClient";

export const metadata: Metadata = { title: "Tasks" };

type Params = {
  view?: string;
  new?: string;
  task?: string;
  title?: string;
  contactId?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  callId?: string;
};

/**
 * Links a "New task" door can arrive with (a contact page's Add task, a call
 * card's "call them back"), resolved to labels here so the editor can show
 * what it's attached to. Anything the actor may not see (same scopes as the
 * POST route's link check) is dropped silently.
 */
async function resolvePrefill(sp: Params, actor: Actor): Promise<TaskPrefill | null> {
  if (sp.new !== "1") return null;
  const companyId = actor.companyId;
  const links: TaskLink[] = [];
  const [contact, job, quote, invoice, call] = await Promise.all([
    sp.contactId
      ? prisma.contact.findFirst({
          where: { id: sp.contactId, companyId, ...contactScope(actor) },
          select: { id: true, firstName: true, lastName: true },
        })
      : null,
    sp.jobId ? prisma.job.findFirst({ where: { id: sp.jobId, companyId, ...jobScope(actor) }, select: { id: true, title: true } }) : null,
    sp.quoteId
      ? prisma.quote.findFirst({ where: { id: sp.quoteId, companyId, ...viaContactScope(actor) }, select: { id: true, quoteNumber: true } })
      : null,
    sp.invoiceId
      ? prisma.invoice.findFirst({ where: { id: sp.invoiceId, companyId, ...viaContactScope(actor) }, select: { id: true, invoiceNumber: true } })
      : null,
    sp.callId
      ? prisma.call.findFirst({ where: { id: sp.callId, companyId }, select: { id: true, customerNumber: true, direction: true } })
      : null,
  ]);
  if (contact) {
    links.push({ kind: "contact", id: contact.id, label: `${contact.firstName} ${contact.lastName}`.trim() || "Client", href: `/app/contacts/${contact.id}` });
  }
  if (job) links.push({ kind: "job", id: job.id, label: job.title || "Job", href: `/app/jobs/${job.id}` });
  if (quote) links.push({ kind: "quote", id: quote.id, label: `Quote #${quote.quoteNumber}`, href: `/app/quotes/${quote.id}` });
  if (invoice) links.push({ kind: "invoice", id: invoice.id, label: `Invoice #${invoice.invoiceNumber}`, href: `/app/invoices/${invoice.id}` });
  if (call) {
    links.push({
      kind: "call",
      id: call.id,
      label: `${call.direction === "INBOUND" ? "Call from" : "Call to"} ${call.customerNumber}`,
      href: `/app/calls/${call.id}`,
    });
  }
  return {
    title: typeof sp.title === "string" ? sp.title.slice(0, 160) : undefined,
    contactId: contact?.id ?? null,
    jobId: job?.id ?? null,
    quoteId: quote?.id ?? null,
    invoiceId: invoice?.id ?? null,
    callId: call?.id ?? null,
    links,
  };
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await requirePageActor();
  const sp = await searchParams;
  // Team view + handing tasks out are one Pro feature (task_assign); the gate
  // is dark until PLAN_GATING=1. `manager` alone drives nothing below.
  const manager = isManager(actor.role) && (await featureAllowedFor(actor.companyId, "task_assign"));
  const view = parseTaskView(sp.view, manager);
  const tz = await companyTz(actor.companyId);

  const [tasks, team, prefill, openCount] = await Promise.all([
    listTasks(actor, view, tz),
    manager
      ? prisma.user.findMany({
          where: { companyId: actor.companyId, isActive: true, role: { not: "SUPERADMIN" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    resolvePrefill(sp, actor),
    // Tab counts: my open tasks + (managers) everyone's open tasks
    Promise.all([
      prisma.task.count({ where: { companyId: actor.companyId, assigneeId: actor.id, doneAt: null } }),
      manager ? prisma.task.count({ where: { companyId: actor.companyId, doneAt: null } }) : Promise.resolve(0),
    ]),
  ]);

  return (
    <TasksClient
      key={view}
      view={view}
      initial={tasks}
      counts={{ mine: openCount[0], team: openCount[1] }}
      team={team}
      meId={actor.id}
      canAssign={manager}
      openTaskId={typeof sp.task === "string" ? sp.task : null}
      prefill={prefill}
    />
  );
}
