import { prisma } from "../db";
import {
  canSell,
  canSeeMoney,
  isManager,
  contactScope,
  viaContactScope,
  jobScope,
  appointmentScope,
} from "../permissions";
import { type Tool, str, num, day, money, clientName, companyTz, fmtWhen } from "./core";

/**
 * The two "power" read tools behind bulk work and complex lookups.
 *
 * query_records is one structured search across every entity — filters,
 * sort, and up to 200 compact rows per call with offset paging — so "every
 * unpaid invoice over $500 from last quarter" or "all of Ben's jobs next
 * week" is one call, not a chain of top-15 list tools. report aggregates
 * (revenue by client, jobs by tech, expenses by category, hours by week…)
 * without dragging every row into the model's context.
 *
 * Both honor the same capability checks and Prisma scopes the pages use:
 * an entity the actor can't see just isn't queryable.
 */

const ENTITIES = [
  "clients",
  "requests",
  "quotes",
  "jobs",
  "invoices",
  "payments",
  "appointments",
  "agreements",
  "subscriptions",
  "expenses",
  "time_entries",
] as const;
type Entity = (typeof ENTITIES)[number];

const MAX_LIMIT = 200;

const nameSel = { firstName: true, lastName: true, companyName: true } as const;
type NameRow = { firstName: string; lastName: string; companyName: string | null };

function range(args: Record<string, unknown>): { gte?: Date; lt?: Date } | undefined {
  const from = day(args.from);
  const to = day(args.to);
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from.getTime() - 12 * 3600_000) } : {}),
    ...(to ? { lt: new Date(to.getTime() + 12 * 3600_000) } : {}),
  };
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function statuses(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((s) => str(s, 30).toUpperCase()).filter(Boolean);
  const s = str(v, 120).toUpperCase();
  return s ? s.split(/[,\s]+/).filter(Boolean) : [];
}

function nameSearch(q: string) {
  const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: words.map((w) => ({
      OR: [
        { firstName: { contains: w, mode: "insensitive" as const } },
        { lastName: { contains: w, mode: "insensitive" as const } },
        { companyName: { contains: w, mode: "insensitive" as const } },
        { email: { contains: w, mode: "insensitive" as const } },
        { phone: { contains: w } },
      ],
    })),
  };
}

function canQuery(actor: Parameters<typeof canSeeMoney>[0], entity: Entity): boolean {
  switch (entity) {
    case "clients":
    case "requests":
    case "quotes":
    case "agreements":
      return canSell(actor.role);
    case "invoices":
    case "payments":
    case "subscriptions":
      return canSeeMoney(actor);
    case "expenses":
      return isManager(actor.role);
    case "jobs":
    case "appointments":
    case "time_entries":
      return true;
  }
}

export const recordsTools: Tool[] = [
  {
    decl: {
      name: "query_records",
      description:
        "Structured search across ANY entity with filters, sort, and paging (up to 200 rows per call, use offset for more). Use this for bulk work and complex questions instead of chaining small list tools: e.g. every unpaid invoice over $500 from last quarter, all of a tech's jobs next week, leads created this month with no quote, clients in ZIP 75002. Entities: clients, requests, quotes, jobs, invoices, payments, appointments, agreements, subscriptions, expenses, time_entries. Each row is compact (id/number, client, status, amount, date, title); call get_document / get_client_activity for full detail. Dates filter the entity's natural date (clients/requests/quotes/agreements: created; jobs/appointments: scheduled; invoices: issued, or due when overdue=true; payments: paid; subscriptions: next bill; expenses: incurred; time_entries: start) unless dateField overrides it.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: [...ENTITIES] },
          status: {
            type: "string",
            description:
              "One status or a comma list. clients: LEAD, ACTIVE, ARCHIVED. requests: NEW, NEEDS_APPROVAL, CONVERTED, ARCHIVED. quotes: DRAFT, AWAITING_RESPONSE, APPROVED, CHANGES_REQUESTED, CONVERTED, ARCHIVED. jobs: ACTIVE, REQUIRES_INVOICING, ARCHIVED. invoices: DRAFT, AWAITING_PAYMENT, PAID, PAST_DUE, ARCHIVED. appointments: SCHEDULED, COMPLETED, CANCELLED, NO_SHOW. agreements: DRAFT, SENT, SIGNED, VOID. subscriptions: ACTIVE, PAUSED, CANCELLED. Omit for the entity's default (archived hidden).",
          },
          q: { type: "string", description: "Text match on title/subject/number and client name" },
          clientId: { type: "string", description: "Only this client's records" },
          assigneeId: { type: "string", description: "Team member id (jobs crew, appointment owner, time entries, assigned leads)" },
          from: { type: "string", description: "YYYY-MM-DD (inclusive)" },
          to: { type: "string", description: "YYYY-MM-DD (inclusive)" },
          dateField: { type: "string", enum: ["created", "scheduled", "due", "completed", "updated"] },
          minAmount: { type: "number" },
          maxAmount: { type: "number" },
          unscheduled: { type: "boolean", description: "jobs: only jobs with no date" },
          overdue: { type: "boolean", description: "invoices: unpaid and past their due date" },
          unpaid: { type: "boolean", description: "invoices: anything still owing (AWAITING_PAYMENT + PAST_DUE)" },
          unsigned: { type: "boolean", description: "agreements: sent but not signed" },
          city: { type: "string", description: "clients: city match" },
          zip: { type: "string", description: "clients: ZIP match" },
          leadSource: { type: "string", description: "clients/jobs: lead source match" },
          sort: {
            type: "string",
            enum: ["newest", "oldest", "date_asc", "date_desc", "amount_desc", "amount_asc", "name"],
          },
          limit: { type: "integer", description: "1–200, default 50" },
          offset: { type: "integer", description: "Skip this many rows (paging)" },
        },
        required: ["entity"],
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const entity = str(args.entity, 20) as Entity;
      if (!ENTITIES.includes(entity)) return { error: `entity must be one of ${ENTITIES.join(", ")}` };
      if (!canQuery(actor, entity)) return { error: `You don't have access to ${entity}.` };
      const companyId = actor.companyId;
      const tz = await companyTz(companyId);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(num(args.limit) ?? 50)));
      const offset = Math.max(0, Math.round(num(args.offset) ?? 0));
      const q = str(args.q, 80);
      const n = /^\d+$/.test(q) ? Number(q) : null;
      const st = statuses(args.status);
      const clientId = str(args.clientId, 40) || undefined;
      const assigneeId = str(args.assigneeId, 40) || undefined;
      const dates = range(args);
      const dateField = str(args.dateField, 12);
      const sort = str(args.sort, 12) || "newest";
      const minA = num(args.minAmount);
      const maxA = num(args.maxAmount);
      const amount =
        minA !== null || maxA !== null
          ? { ...(minA !== null ? { gte: minA } : {}), ...(maxA !== null ? { lte: maxA } : {}) }
          : undefined;
      const dir = sort === "oldest" || sort === "date_asc" || sort === "amount_asc" || sort === "name" ? "asc" : "desc";
      const page = { take: limit, skip: offset } as const;
      const clientWhere = clientId ? { contactId: clientId } : {};
      const clientQ = q && n === null ? { contact: nameSearch(q) } : {};

      switch (entity) {
        case "clients": {
          const where = {
            companyId,
            ...contactScope(actor),
            ...(st.length ? { status: { in: st as never[] } } : { status: { in: ["LEAD", "ACTIVE"] as never[] } }),
            ...(q ? nameSearch(q) : {}),
            ...(assigneeId ? { assignedToId: assigneeId } : {}),
            ...(str(args.city, 60) ? { city: { contains: str(args.city, 60), mode: "insensitive" as const } } : {}),
            ...(str(args.zip, 12) ? { zip: { startsWith: str(args.zip, 12) } } : {}),
            ...(str(args.leadSource, 60) ? { leadSource: { contains: str(args.leadSource, 60), mode: "insensitive" as const } } : {}),
            ...(dates ? { [dateField === "updated" ? "updatedAt" : "createdAt"]: dates } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.contact.count({ where }),
            prisma.contact.findMany({
              where,
              ...page,
              orderBy: sort === "name" ? [{ lastName: "asc" }, { firstName: "asc" }] : { createdAt: dir },
              select: {
                id: true, ...nameSel, email: true, phone: true, city: true, zip: true, status: true,
                leadSource: true, createdAt: true, assignedTo: { select: { name: true } },
                _count: { select: { jobs: true, quotes: true, invoices: true } },
              },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((c) => ({
              id: c.id, name: clientName(c), email: c.email, phone: c.phone, city: c.city, zip: c.zip,
              status: c.status, source: c.leadSource, rep: c.assignedTo?.name ?? null,
              created: iso(c.createdAt), jobs: c._count.jobs, quotes: c._count.quotes, invoices: c._count.invoices,
            })),
          };
        }
        case "requests": {
          const where = {
            companyId, ...viaContactScope(actor), ...clientWhere,
            ...(st.length ? { status: { in: st as never[] } } : { status: { not: "ARCHIVED" as never } }),
            ...(n !== null ? { requestNumber: n } : q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
            ...(dates ? { createdAt: dates } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.request.count({ where }),
            prisma.request.findMany({
              where, ...page, orderBy: { createdAt: dir },
              select: { requestNumber: true, title: true, status: true, source: true, createdAt: true, preferredDate: true, contact: { select: nameSel } },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((r) => ({ n: r.requestNumber, title: r.title, status: r.status, source: r.source, client: clientName(r.contact), created: iso(r.createdAt), preferred: iso(r.preferredDate) })),
          };
        }
        case "quotes": {
          const where = {
            companyId, ...viaContactScope(actor), ...clientWhere,
            ...(st.length ? { status: { in: st as never[] } } : { status: { not: "ARCHIVED" as never } }),
            ...(n !== null ? { quoteNumber: n } : q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
            ...(amount ? { total: amount } : {}),
            ...(dates ? { [dateField === "updated" ? "updatedAt" : "createdAt"]: dates } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.quote.count({ where }),
            prisma.quote.findMany({
              where, ...page,
              orderBy: sort.startsWith("amount") ? { total: dir } : { createdAt: dir },
              select: { quoteNumber: true, title: true, status: true, total: true, sentAt: true, approvedAt: true, validUntil: true, createdAt: true, contact: { select: nameSel } },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((x) => ({ n: x.quoteNumber, title: x.title, status: x.status, total: money(x.total), client: clientName(x.contact), created: iso(x.createdAt), sent: iso(x.sentAt), approved: iso(x.approvedAt), validUntil: iso(x.validUntil) })),
          };
        }
        case "jobs": {
          const unscheduled = args.unscheduled === true;
          const dateKey = dateField === "created" ? "createdAt" : dateField === "completed" ? "completedAt" : dateField === "updated" ? "updatedAt" : "scheduledAt";
          const where = {
            companyId, ...jobScope(actor), ...clientWhere,
            ...(st.length ? { status: { in: st as never[] } } : { status: { not: "ARCHIVED" as never } }),
            ...(n !== null ? { jobNumber: n } : q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
            ...(assigneeId ? { assignments: { some: { userId: assigneeId } } } : {}),
            ...(unscheduled ? { scheduledAt: null } : dates ? { [dateKey]: dates } : {}),
            ...(str(args.leadSource, 60) ? { leadSource: { contains: str(args.leadSource, 60), mode: "insensitive" as const } } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.job.count({ where }),
            prisma.job.findMany({
              where, ...page,
              orderBy: unscheduled || dateKey === "createdAt" ? { createdAt: dir } : { [dateKey]: dir },
              select: {
                id: true, jobNumber: true, title: true, status: true, scheduledAt: true, scheduledAnytime: true, completedAt: true,
                address: true, contact: { select: nameSel },
                assignments: { select: { user: { select: { name: true } } } },
                ...(canSeeMoney(actor) ? { lineItems: { select: { total: true } } } : {}),
              },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((j) => ({
              id: j.id, n: j.jobNumber, title: j.title, status: j.status, client: clientName(j.contact),
              when: j.scheduledAt ? fmtWhen(tz, j.scheduledAt, j.scheduledAnytime) : "unscheduled",
              completed: iso(j.completedAt), crew: j.assignments.map((a) => a.user.name), address: j.address,
              ...("lineItems" in j && Array.isArray(j.lineItems)
                ? { value: money((j.lineItems as { total: unknown }[]).reduce((s, li) => s + Number(li.total ?? 0), 0)) }
                : {}),
            })),
          };
        }
        case "invoices": {
          const now = new Date();
          const overdue = args.overdue === true;
          const unpaid = args.unpaid === true || overdue;
          const dateKey = dateField === "due" || overdue ? "dueDate" : dateField === "created" ? "createdAt" : dateField === "updated" ? "updatedAt" : "issuedAt";
          const where = {
            companyId, ...viaContactScope(actor), ...clientWhere,
            ...(unpaid
              ? { status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] as never[] } }
              : st.length ? { status: { in: st as never[] } } : { status: { not: "ARCHIVED" as never } }),
            ...(overdue
              ? { dueDate: { lt: dates?.lt && dates.lt < now ? dates.lt : now, ...(dates?.gte ? { gte: dates.gte } : {}) } }
              : dates ? { [dateKey]: dates } : {}),
            ...(n !== null ? { invoiceNumber: n } : q ? { OR: [{ subject: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
            ...(amount ? { total: amount } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.invoice.count({ where }),
            prisma.invoice.findMany({
              where, ...page,
              orderBy: sort.startsWith("amount") ? { total: dir } : dateKey === "dueDate" ? { dueDate: dir } : { createdAt: dir },
              select: { invoiceNumber: true, subject: true, status: true, total: true, dueDate: true, issuedAt: true, paidAt: true, contact: { select: nameSel }, payments: { select: { amount: true } } },
            }),
          ]);
          let owing = 0;
          const out = rows.map((i) => {
            const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
            const balance = Math.max(0, Number(i.total) - paid);
            if (i.status === "AWAITING_PAYMENT" || i.status === "PAST_DUE") owing += balance;
            return { n: i.invoiceNumber, subject: i.subject, status: i.status, total: money(i.total), balance: money(balance), client: i.contact ? clientName(i.contact) : null, issued: iso(i.issuedAt), due: iso(i.dueDate), paid: iso(i.paidAt) };
          });
          return { total, showing: rows.length, offset, hasMore: offset + rows.length < total, owingOnThisPage: money(owing), rows: out };
        }
        case "payments": {
          const where = {
            companyId, ...viaContactScope(actor), ...clientWhere,
            ...(dates ? { paidAt: dates } : {}),
            ...(amount ? { amount } : {}),
            ...(q && n === null ? clientQ : n !== null ? { invoice: { invoiceNumber: n } } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.payment.count({ where }),
            prisma.payment.findMany({
              where, ...page, orderBy: sort.startsWith("amount") ? { amount: dir } : { paidAt: dir },
              select: { id: true, amount: true, method: true, paidAt: true, processorRef: true, invoice: { select: { invoiceNumber: true } }, contact: { select: nameSel }, refunds: { select: { amount: true } } },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            collectedOnThisPage: money(rows.reduce((s, p) => s + Number(p.amount), 0)),
            rows: rows.map((p) => ({ id: p.id, amount: money(p.amount), method: p.method, online: Boolean(p.processorRef?.startsWith("TR")), on: iso(p.paidAt), invoiceN: p.invoice.invoiceNumber, client: p.contact ? clientName(p.contact) : null, refunded: p.refunds.length ? money(p.refunds.reduce((s, r) => s + Number(r.amount), 0)) : undefined })),
          };
        }
        case "appointments": {
          const where = {
            companyId, ...appointmentScope(actor), ...clientWhere,
            ...(st.length ? { status: { in: st as never[] } } : {}),
            ...(assigneeId ? { assignedToId: assigneeId } : {}),
            ...(dates ? { scheduledAt: dates } : {}),
            ...(n !== null ? { appointmentNumber: n } : q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.appointment.count({ where }),
            prisma.appointment.findMany({
              where, ...page, orderBy: { scheduledAt: dir },
              select: { id: true, appointmentNumber: true, title: true, type: true, status: true, scheduledAt: true, scheduledAnytime: true, tentative: true, address: true, contact: { select: nameSel }, assignedTo: { select: { name: true } } },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((a) => ({ id: a.id, n: a.appointmentNumber, title: a.title, type: a.type, status: a.status, tentative: a.tentative, when: fmtWhen(tz, a.scheduledAt, a.scheduledAnytime), client: clientName(a.contact), with: a.assignedTo?.name ?? null, address: a.address })),
          };
        }
        case "agreements": {
          const unsigned = args.unsigned === true;
          const where = {
            companyId, ...viaContactScope(actor), ...clientWhere,
            ...(unsigned ? { status: "SENT" as never } : st.length ? { status: { in: st as never[] } } : {}),
            ...(dates ? { createdAt: dates } : {}),
            ...(n !== null ? { contractNumber: n } : q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.contract.count({ where }),
            prisma.contract.findMany({
              where, ...page, orderBy: { createdAt: dir },
              select: { id: true, contractNumber: true, title: true, status: true, sentAt: true, signedAt: true, lastViewedAt: true, contact: { select: nameSel } },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((c) => ({ id: c.id, n: c.contractNumber, title: c.title, status: c.status, client: clientName(c.contact), sent: iso(c.sentAt), signed: iso(c.signedAt), lastViewed: iso(c.lastViewedAt) })),
          };
        }
        case "subscriptions": {
          const where = {
            companyId, ...viaContactScope(actor), ...clientWhere,
            ...(st.length ? { status: { in: st as never[] } } : { status: { not: "CANCELLED" as never } }),
            ...(dates ? { nextRunDate: dates } : {}),
            ...(q && n === null ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, clientQ] } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.subscription.count({ where }),
            prisma.subscription.findMany({
              where, ...page, orderBy: { nextRunDate: dir === "desc" ? "desc" : "asc" },
              select: { id: true, name: true, status: true, unitPrice: true, quantity: true, interval: true, billPerVisit: true, nextRunDate: true, nextVisitDate: true, contact: { select: nameSel } },
            }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            rows: rows.map((s) => ({ id: s.id, plan: s.name, status: s.status, client: clientName(s.contact), price: money(Number(s.unitPrice) * Number(s.quantity)), interval: s.interval, perVisit: s.billPerVisit, nextBill: iso(s.nextRunDate), nextVisit: iso(s.nextVisitDate) })),
          };
        }
        case "expenses": {
          const where = {
            companyId,
            ...(dates ? { incurredAt: dates } : {}),
            ...(amount ? { amount } : {}),
            ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" as const } }, { category: { contains: q, mode: "insensitive" as const } }] } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.expense.count({ where }),
            prisma.expense.findMany({ where, ...page, orderBy: sort.startsWith("amount") ? { amount: dir } : { incurredAt: dir }, select: { id: true, description: true, category: true, amount: true, incurredAt: true } }),
          ]);
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            sumOnThisPage: money(rows.reduce((s, e) => s + Number(e.amount), 0)),
            rows: rows.map((e) => ({ id: e.id, description: e.description, category: e.category, amount: money(e.amount), on: iso(e.incurredAt) })),
          };
        }
        case "time_entries": {
          const where = {
            companyId,
            ...(isManager(actor.role) ? (assigneeId ? { userId: assigneeId } : {}) : { userId: actor.id }),
            ...(dates ? { startedAt: dates } : {}),
            ...(n !== null ? { job: { jobNumber: n } } : {}),
          };
          const [total, rows] = await Promise.all([
            prisma.timeEntry.count({ where }),
            prisma.timeEntry.findMany({
              where, ...page, orderBy: { startedAt: dir },
              select: { id: true, startedAt: true, endedAt: true, source: true, note: true, user: { select: { name: true } }, job: { select: { jobNumber: true, title: true } } },
            }),
          ]);
          const hours = (s: Date, e: Date | null) => Math.round(((e ?? new Date()).getTime() - s.getTime()) / 36000) / 100;
          return {
            total, showing: rows.length, offset, hasMore: offset + rows.length < total,
            hoursOnThisPage: Math.round(rows.reduce((s, t) => s + hours(t.startedAt, t.endedAt), 0) * 100) / 100,
            rows: rows.map((t) => ({ id: t.id, who: t.user.name, start: fmtWhen(tz, t.startedAt, false), end: t.endedAt ? fmtWhen(tz, t.endedAt, false) : "still clocked in", hours: hours(t.startedAt, t.endedAt), source: t.source, job: t.job ? `#${t.job.jobNumber} ${t.job.title}` : null, note: t.note })),
          };
        }
      }
    },
  },
  {
    decl: {
      name: "report",
      description:
        "Aggregate numbers for a date range without listing rows: revenue (payments collected), invoiced, outstanding (unpaid balance), quotes_value, quotes_count, quote_win_rate, jobs_count, jobs_completed, appointments_count, new_clients, expenses, hours_worked, labor_cost, refunds. groupBy splits the total by month, week, client, tech (crew / who worked), status, category (expenses), lead_source, or method (payments). Use for 'top clients by revenue', 'jobs per tech this month', 'expenses by category', 'hours by tech last week', 'how does this quarter compare' (call twice).",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["revenue", "invoiced", "outstanding", "quotes_value", "quotes_count", "quote_win_rate", "jobs_count", "jobs_completed", "appointments_count", "new_clients", "expenses", "hours_worked", "labor_cost", "refunds"],
          },
          groupBy: { type: "string", enum: ["none", "month", "week", "client", "tech", "status", "category", "lead_source", "method"] },
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
          top: { type: "integer", description: "Keep the top N groups (default 15)" },
        },
        required: ["metric", "from", "to"],
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const metric = str(args.metric, 24);
      const groupBy = str(args.groupBy, 12) || "none";
      const from = day(args.from);
      const to = day(args.to);
      if (!from || !to) return { error: "from/to must be YYYY-MM-DD" };
      const gte = new Date(from.getTime() - 12 * 3600_000);
      const lt = new Date(to.getTime() + 12 * 3600_000);
      if (lt.getTime() - gte.getTime() > 400 * 86400000) return { error: "Range too wide — max ~13 months." };
      const top = Math.min(50, Math.max(1, Math.round(num(args.top) ?? 15)));
      const companyId = actor.companyId;
      const tz = await companyTz(companyId);
      const moneyMetric = ["revenue", "invoiced", "outstanding", "quotes_value", "expenses", "labor_cost", "refunds"].includes(metric);
      if (["revenue", "invoiced", "outstanding", "refunds"].includes(metric) && !canSeeMoney(actor)) return { error: "No access to money figures." };
      if (["expenses", "labor_cost"].includes(metric) && !isManager(actor.role)) return { error: "Managers only." };
      if (["quotes_value", "quotes_count", "quote_win_rate", "new_clients"].includes(metric) && !canSell(actor.role)) return { error: "No access to sales figures." };

      const keyOf = (d: Date) => {
        if (groupBy === "month") return d.toLocaleDateString("en-CA", { timeZone: tz }).slice(0, 7);
        if (groupBy === "week") {
          const local = new Date(d.toLocaleDateString("en-CA", { timeZone: tz }) + "T12:00:00Z");
          const monday = new Date(local.getTime() - ((local.getUTCDay() + 6) % 7) * 86400000);
          return `week of ${monday.toISOString().slice(0, 10)}`;
        }
        return "all";
      };
      // one accumulator: label → { value, count }
      const acc = new Map<string, { value: number; count: number }>();
      const add = (key: string, value: number) => {
        const cur = acc.get(key) ?? { value: 0, count: 0 };
        cur.value += value;
        cur.count += 1;
        acc.set(key, cur);
      };
      const label = (row: { contact?: NameRow | null }, d: Date, extra?: string | null, alt?: string | null) => {
        if (groupBy === "client") return row.contact ? clientName(row.contact) : "(no client)";
        if (groupBy === "month" || groupBy === "week") return keyOf(d);
        if (groupBy === "status" || groupBy === "category" || groupBy === "lead_source" || groupBy === "method" || groupBy === "tech") return extra ?? alt ?? "(none)";
        return "all";
      };

      switch (metric) {
        case "revenue":
        case "refunds": {
          if (metric === "refunds") {
            const rows = await prisma.refund.findMany({ where: { companyId, createdAt: { gte, lt } }, select: { amount: true, createdAt: true, payment: { select: { method: true, contact: { select: nameSel } } } } });
            rows.forEach((r) => add(label({ contact: r.payment.contact }, r.createdAt, r.payment.method), Number(r.amount)));
            break;
          }
          const rows = await prisma.payment.findMany({ where: { companyId, ...viaContactScope(actor), paidAt: { gte, lt } }, select: { amount: true, method: true, paidAt: true, contact: { select: nameSel } } });
          rows.forEach((p) => add(label(p, p.paidAt, p.method), Number(p.amount)));
          break;
        }
        case "invoiced": {
          const rows = await prisma.invoice.findMany({ where: { companyId, ...viaContactScope(actor), status: { not: "ARCHIVED" }, issuedAt: { gte, lt } }, select: { total: true, status: true, issuedAt: true, contact: { select: nameSel } } });
          rows.forEach((i) => add(label(i, i.issuedAt!, i.status), Number(i.total)));
          break;
        }
        case "outstanding": {
          const rows = await prisma.invoice.findMany({ where: { companyId, ...viaContactScope(actor), status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] }, OR: [{ dueDate: { gte, lt } }, { issuedAt: { gte, lt } }] }, select: { total: true, status: true, dueDate: true, issuedAt: true, contact: { select: nameSel }, payments: { select: { amount: true } } } });
          rows.forEach((i) => add(label(i, i.dueDate ?? i.issuedAt ?? new Date(), i.status), Math.max(0, Number(i.total) - i.payments.reduce((s, p) => s + Number(p.amount), 0))));
          break;
        }
        case "quotes_value":
        case "quotes_count":
        case "quote_win_rate": {
          const rows = await prisma.quote.findMany({ where: { companyId, ...viaContactScope(actor), createdAt: { gte, lt } }, select: { total: true, status: true, createdAt: true, contact: { select: nameSel } } });
          if (metric === "quote_win_rate") {
            const won = rows.filter((q) => q.status === "APPROVED" || q.status === "CONVERTED").length;
            const decided = rows.filter((q) => q.status !== "DRAFT").length;
            return { metric, from: args.from, to: args.to, quotes: rows.length, sent: decided, won, winRate: decided ? `${Math.round((won / decided) * 100)}%` : "n/a", wonValue: money(rows.filter((q) => q.status === "APPROVED" || q.status === "CONVERTED").reduce((s, q) => s + Number(q.total), 0)) };
          }
          rows.forEach((q) => add(label(q, q.createdAt, q.status), metric === "quotes_value" ? Number(q.total) : 1));
          break;
        }
        case "jobs_count":
        case "jobs_completed": {
          const completed = metric === "jobs_completed";
          const rows = await prisma.job.findMany({
            where: { companyId, ...jobScope(actor), ...(completed ? { completedAt: { gte, lt } } : { status: { not: "ARCHIVED" }, OR: [{ scheduledAt: { gte, lt } }, { scheduledAt: null, createdAt: { gte, lt } }] }) },
            select: { status: true, leadSource: true, scheduledAt: true, createdAt: true, completedAt: true, contact: { select: nameSel }, assignments: { select: { user: { select: { name: true } } } } },
          });
          rows.forEach((j) => {
            const d = completed ? j.completedAt! : j.scheduledAt ?? j.createdAt;
            if (groupBy === "tech") {
              const crew = j.assignments.map((a) => a.user.name);
              (crew.length ? crew : ["(unassigned)"]).forEach((name) => add(name, 1));
            } else add(label(j, d, groupBy === "lead_source" ? j.leadSource : j.status), 1);
          });
          break;
        }
        case "appointments_count": {
          const rows = await prisma.appointment.findMany({ where: { companyId, ...appointmentScope(actor), scheduledAt: { gte, lt } }, select: { status: true, scheduledAt: true, contact: { select: nameSel }, assignedTo: { select: { name: true } } } });
          rows.forEach((a) => add(label(a, a.scheduledAt, groupBy === "tech" ? a.assignedTo?.name ?? "(unassigned)" : a.status), 1));
          break;
        }
        case "new_clients": {
          const rows = await prisma.contact.findMany({ where: { companyId, ...contactScope(actor), createdAt: { gte, lt } }, select: { status: true, leadSource: true, createdAt: true, firstName: true, lastName: true, companyName: true, assignedTo: { select: { name: true } } } });
          rows.forEach((c) => add(label({ contact: c }, c.createdAt, groupBy === "lead_source" ? c.leadSource : groupBy === "tech" ? c.assignedTo?.name ?? "(unassigned)" : c.status), 1));
          break;
        }
        case "expenses": {
          const rows = await prisma.expense.findMany({ where: { companyId, incurredAt: { gte, lt } }, select: { amount: true, category: true, incurredAt: true } });
          rows.forEach((e) => add(label({}, e.incurredAt, e.category ?? "(uncategorized)"), Number(e.amount)));
          break;
        }
        case "hours_worked":
        case "labor_cost": {
          const rows = await prisma.timeEntry.findMany({
            where: { companyId, ...(isManager(actor.role) ? {} : { userId: actor.id }), startedAt: { gte, lt } },
            select: { startedAt: true, endedAt: true, user: { select: { name: true, hourlyCost: true } }, job: { select: { contact: { select: nameSel } } } },
          });
          rows.forEach((t) => {
            const hrs = ((t.endedAt ?? new Date()).getTime() - t.startedAt.getTime()) / 3_600_000;
            const value = metric === "labor_cost" ? hrs * Number(t.user.hourlyCost ?? 0) : hrs;
            add(label({ contact: t.job?.contact ?? null }, t.startedAt, groupBy === "tech" ? t.user.name : null), value);
          });
          break;
        }
        default:
          return { error: "Unknown metric." };
      }

      const entries = [...acc.entries()].map(([group, v]) => ({ group, value: v.value, count: v.count }));
      const total = entries.reduce((s, e) => s + e.value, 0);
      const fmt = (v: number) => (moneyMetric ? money(v) : metric === "hours_worked" ? `${Math.round(v * 100) / 100} h` : Math.round(v));
      if (groupBy === "none" || groupBy === "all") return { metric, from: args.from, to: args.to, total: fmt(total), records: entries.reduce((s, e) => s + e.count, 0) };
      const sorted = groupBy === "month" || groupBy === "week" ? entries.sort((a, b) => a.group.localeCompare(b.group)) : entries.sort((a, b) => b.value - a.value);
      return {
        metric, groupBy, from: args.from, to: args.to, total: fmt(total), groups: sorted.length,
        rows: sorted.slice(0, top).map((e) => ({ [groupBy]: e.group, value: fmt(e.value), records: e.count })),
        ...(sorted.length > top ? { note: `${sorted.length - top} smaller groups not shown` } : {}),
      };
    },
  },
];
