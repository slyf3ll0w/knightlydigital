import { prisma } from "./db";
import { invoiceBalance } from "./payments";
import { zonedMidnight, zonedParts } from "./timezone";
import { customFieldKey, WEEKDAYS, type AutomationCtx, type EntityType } from "./automations";

/**
 * The record behind an automation run, flattened into the field context the
 * spec language reads ({client_first_name}, {quote_total}, …) plus the bits
 * the actions need (the contact to email, the job to note, the invoice to
 * remind about). One loader per EntityType in lib/automations.ts; every
 * field in fieldDefsFor(trigger) is produced here, with "" / 0 / false for
 * anything the record doesn't have, so templates never render "undefined".
 *
 * An entityId may carry a ":qualifier" suffix — a sweep that fires once per
 * day per job dedupes on `${jobId}:${today}`, a schedule tick on
 * `${companyId}:${date}`. The loader strips it; cuids never contain ":".
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
}

export const CONTACT_SELECT = {
  id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true, status: true, leadSource: true,
  city: true, zip: true, pipelineStageId: true, assignedToId: true, stageChangedAt: true, customFields: true,
  smsOptOut: true, smsDisabled: true, hubToken: true, paymentTermsDays: true,
  pipelineStage: { select: { name: true } }, assignedTo: { select: { id: true, name: true } },
} as const;

export type ContactRow = {
  id: string; firstName: string; lastName: string; companyName: string | null; email: string | null; phone: string | null; status: string;
  leadSource: string | null; city: string | null; zip: string | null; pipelineStageId: string | null; assignedToId: string | null;
  stageChangedAt: Date | null; customFields: unknown; smsOptOut: boolean; smsDisabled: boolean; hubToken: string; paymentTermsDays: number;
  pipelineStage: { name: string } | null; assignedTo: { id: string; name: string } | null;
};

export const COMPANY_SELECT = {
  id: true, name: true, email: true, phone: true, website: true, logoUrl: true, timezone: true, reviewLink: true,
  brandColor: true, brandColorSecondary: true, documentColor: true, arrivalWindowMinutes: true,
  finixMerchantId: true, finixOnboardingState: true, assistantName: true,
} as const;

export type CompanyRow = {
  id: string; name: string; email: string | null; phone: string | null; website: string | null; logoUrl: string | null; timezone: string;
  reviewLink: string | null; brandColor: string | null; brandColorSecondary: string | null; documentColor: string | null;
  arrivalWindowMinutes: number | null; finixMerchantId: string | null; finixOnboardingState: string | null; assistantName: string | null;
};

const QUOTE_SELECT = {
  id: true, quoteNumber: true, title: true, total: true, status: true, publicToken: true, sentAt: true, jobId: true, contactId: true,
  depositType: true, depositValue: true, lineItems: { select: { name: true, description: true, isOptional: true, optedOut: true } },
} as const;
const INVOICE_SELECT = {
  id: true, invoiceNumber: true, total: true, status: true, kind: true, publicToken: true, dueDate: true, jobId: true, contactId: true, subject: true,
  payments: { select: { amount: true, surchargeAmount: true } }, lineItems: { select: { name: true, description: true } }, job: { select: { title: true } },
} as const;
const JOB_SELECT = {
  id: true, jobNumber: true, title: true, address: true, status: true, scheduledAt: true, scheduledAnytime: true, subscriptionId: true, contactId: true, propertyId: true,
  lineItems: { select: { name: true, description: true, quantity: true, unitCost: true, unitPrice: true, workItemId: true, recurringInterval: true, sortOrder: true } },
  assignments: { select: { userId: true, user: { select: { name: true } } } },
} as const;
const APPOINTMENT_SELECT = {
  id: true, appointmentNumber: true, title: true, type: true, status: true, scheduledAt: true, scheduledEnd: true, scheduledAnytime: true, address: true,
  arrivalWindowMinutes: true, tentative: true, assignedToId: true, contactId: true,
} as const;

export type QuoteRow = {
  id: string; quoteNumber: number; title: string | null; total: unknown; status: string; publicToken: string; sentAt: Date | null; jobId: string | null; contactId: string;
  depositType: string; depositValue: unknown; lineItems: { name: string | null; description: string | null; isOptional: boolean; optedOut: boolean }[];
};
export type InvoiceRow = {
  id: string; invoiceNumber: number; total: unknown; status: string; kind: string; publicToken: string; dueDate: Date | null; jobId: string | null; contactId: string | null; subject: string | null;
  payments: { amount: unknown; surchargeAmount: unknown }[]; lineItems: { name: string | null; description: string | null }[]; job: { title: string } | null;
};
export type JobRow = {
  id: string; jobNumber: number; title: string; address: string | null; status: string; scheduledAt: Date | null; scheduledAnytime: boolean; subscriptionId: string | null; contactId: string; propertyId: string | null;
  lineItems: { name: string; description: string | null; quantity: unknown; unitCost: unknown; unitPrice: unknown; workItemId: string | null; recurringInterval: string | null; sortOrder: number }[];
  assignments: { userId: string; user: { name: string } }[];
};
export type AppointmentRow = {
  id: string; appointmentNumber: number | null; title: string; type: string; status: string; scheduledAt: Date; scheduledEnd: Date | null; scheduledAnytime: boolean; address: string | null;
  arrivalWindowMinutes: number | null; tentative: boolean; assignedToId: string | null; contactId: string;
};

export type Loaded = {
  ctx: AutomationCtx;
  company: CompanyRow;
  contact: ContactRow | null;
  /** The record's own rows, for actions that need more than the flat fields. */
  quote: QuoteRow | null;
  invoice: InvoiceRow | null;
  job: JobRow | null;
  appointment: AppointmentRow | null;
  paymentId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  assignedUserId: string | null;
  /** In-app path for team notifications and the run log. */
  link: string;
  /** Plain label for previews and notifications ("Sarah Lane", "Invoice #12"). */
  label: string;
};

export const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const dayStr = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const daysSince = (d: Date | null | undefined, now: Date) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY)) : 0);
const daysUntil = (d: Date | null | undefined, now: Date) => (d ? Math.round((d.getTime() - now.getTime()) / DAY) : 0);
const hoursUntil = (d: Date | null | undefined, now: Date) => (d ? Math.round(((d.getTime() - now.getTime()) / HOUR) * 10) / 10 : 0);

function whenLabel(tz: string, d: Date | null | undefined, anytime = false): string {
  if (!d) return "";
  return anytime
    ? d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })
    : d.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The company-wide fields every run carries (now_hour, today, company_name…). */
function companyCtx(company: CompanyRow, now: Date, days: number, hours: number): AutomationCtx {
  const parts = zonedParts(company.timezone, now);
  return {
    company_name: company.name,
    days,
    hours,
    now_hour: parts.hour,
    now_weekday: WEEKDAYS[parts.weekday],
    today: `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`,
  };
}

/** Client fields, plus custom_<slug> for every active custom field def. */
function clientCtx(contact: ContactRow | null, defs: { id: string; label: string }[]): AutomationCtx {
  const values = (contact?.customFields && typeof contact.customFields === "object" ? contact.customFields : {}) as Record<string, unknown>;
  const custom: AutomationCtx = {};
  for (const d of defs) custom[customFieldKey(d.label)] = typeof values[d.id] === "string" ? (values[d.id] as string) : "";
  return {
    client_name: contact ? `${contact.firstName} ${contact.lastName}`.trim() : "",
    client_first_name: contact?.firstName ?? "",
    client_last_name: contact?.lastName ?? "",
    client_email: contact?.email ?? "",
    client_phone: contact?.phone ?? "",
    client_company: contact?.companyName ?? "",
    client_status: contact?.status ?? "",
    client_can_text: Boolean(contact?.phone) && !contact?.smsOptOut && !contact?.smsDisabled,
    lead_source: contact?.leadSource ?? "",
    stage: contact?.pipelineStage?.name ?? "",
    city: contact?.city ?? "",
    zip: contact?.zip ?? "",
    assigned_to: contact?.assignedTo?.name ?? "",
    ...custom,
  };
}

function quoteCtx(q: QuoteRow): AutomationCtx {
  const total = money(q.total);
  const dv = q.depositValue == null ? 0 : Number(q.depositValue);
  const deposit = q.depositType === "PERCENT" ? Math.round(total * dv) / 100 : q.depositType === "FIXED" ? dv : 0;
  return { quote_number: q.quoteNumber, quote_title: q.title ?? "", quote_total: total, total, quote_status: q.status, quote_link: `${baseUrl()}/quote/${q.publicToken}`, deposit_amount: money(deposit) };
}
function invoiceCtx(i: InvoiceRow, now: Date): AutomationCtx {
  const total = money(i.total);
  return {
    invoice_number: i.invoiceNumber, invoice_total: total, total, invoice_balance: money(invoiceBalance({ total: Number(i.total), payments: i.payments.map((p) => ({ amount: Number(p.amount), surchargeAmount: p.surchargeAmount == null ? null : Number(p.surchargeAmount) })) })),
    invoice_status: i.status, invoice_kind: i.kind, due_date: dayStr(i.dueDate), due_in_days: daysUntil(i.dueDate, now), pay_link: `${baseUrl()}/pay/${i.publicToken}`,
  };
}
function jobCtx(j: JobRow, tz: string, now: Date): AutomationCtx {
  const total = money(j.lineItems.reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0));
  return {
    job_number: j.jobNumber, job_title: j.title, job_address: j.address ?? "", job_total: total, total, job_status: j.status,
    job_scheduled: whenLabel(tz, j.scheduledAt, j.scheduledAnytime), days_until_job: daysUntil(j.scheduledAt, now),
    crew: j.assignments.map((a) => a.user.name).join(", "), job_recurring: Boolean(j.subscriptionId),
  };
}
function appointmentCtx(a: AppointmentRow, tz: string, now: Date): AutomationCtx {
  return {
    appointment_number: a.appointmentNumber ?? 0, appointment_title: a.title, appointment_type: a.type, appointment_status: a.status,
    appointment_when: whenLabel(tz, a.scheduledAt, a.scheduledAnytime), hours_until: hoursUntil(a.scheduledAt, now),
  };
}

type Opts = { payload?: Record<string, unknown> | null; days?: number; hours?: number };

/** Load the entity + its client into the flat field context the spec language reads. */
export async function loadContext(companyId: string, entityType: EntityType, rawEntityId: string, now = new Date(), opts: Opts = {}): Promise<Loaded | null> {
  const entityId = rawEntityId.split(":")[0];
  const [company, defs] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: COMPANY_SELECT }),
    prisma.contactFieldDef.findMany({ where: { companyId, isActive: true }, select: { id: true, label: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!company) return null;
  const tz = company.timezone ?? "America/Chicago";
  const days = opts.days ?? 0;
  const hours = opts.hours ?? 0;
  const base = (contact: ContactRow | null, d = days, h = hours): AutomationCtx => ({ ...clientCtx(contact, defs), ...companyCtx(company, now, d, h) });
  const empty: Omit<Loaded, "ctx" | "link" | "label"> = { company, contact: null, quote: null, invoice: null, job: null, appointment: null, paymentId: null, jobId: null, jobTitle: null, assignedUserId: null };
  const name = (c: ContactRow | null) => (c ? `${c.firstName} ${c.lastName}`.trim() : "");

  switch (entityType) {
    case "request": {
      const r = await prisma.request.findFirst({ where: { id: entityId, companyId }, include: { contact: { select: CONTACT_SELECT } } });
      if (!r) return null;
      return {
        ...empty,
        ctx: { ...base(r.contact), request_number: r.requestNumber, request_title: r.title, request_details: r.details ?? "", request_source: r.source },
        contact: r.contact, assignedUserId: r.contact.assignedToId, link: `/app/requests/${r.id}`, label: `${name(r.contact)} — request #${r.requestNumber}`,
      };
    }
    case "appointment": {
      const a = await prisma.appointment.findFirst({ where: { id: entityId, companyId }, select: { ...APPOINTMENT_SELECT, contact: { select: CONTACT_SELECT } } });
      if (!a) return null;
      const h = opts.hours ?? Math.abs(hoursUntil(a.scheduledAt, now));
      return {
        ...empty,
        ctx: { ...base(a.contact, days, Math.round(h)), ...appointmentCtx(a, tz, now) },
        contact: a.contact, appointment: a, assignedUserId: a.assignedToId ?? a.contact.assignedToId, link: `/app/appointments/${a.id}`, label: `${name(a.contact)} — ${a.title}`,
      };
    }
    case "quote": {
      const q = await prisma.quote.findFirst({ where: { id: entityId, companyId }, select: { ...QUOTE_SELECT, contact: { select: CONTACT_SELECT } } });
      if (!q) return null;
      return {
        ...empty,
        ctx: { ...base(q.contact, opts.days ?? daysSince(q.sentAt, now)), ...quoteCtx(q) },
        contact: q.contact, quote: q, jobId: q.jobId, jobTitle: q.title, assignedUserId: q.contact.assignedToId, link: `/app/quotes/${q.id}`, label: `${name(q.contact)} — quote #${q.quoteNumber}`,
      };
    }
    case "job": {
      const j = await prisma.job.findFirst({ where: { id: entityId, companyId }, select: { ...JOB_SELECT, completedAt: true, createdAt: true, contact: { select: CONTACT_SELECT } } });
      if (!j) return null;
      const d = opts.days ?? (j.completedAt ? daysSince(j.completedAt, now) : daysSince(j.createdAt, now));
      return {
        ...empty,
        ctx: { ...base(j.contact, d), ...jobCtx(j, tz, now) },
        contact: j.contact, job: j, jobId: j.id, jobTitle: j.title, assignedUserId: j.assignments[0]?.userId ?? j.contact.assignedToId, link: `/app/jobs/${j.id}`, label: `${name(j.contact)} — job #${j.jobNumber}`,
      };
    }
    case "invoice": {
      const i = await prisma.invoice.findFirst({ where: { id: entityId, companyId }, select: { ...INVOICE_SELECT, contact: { select: CONTACT_SELECT } } });
      if (!i) return null;
      return {
        ...empty,
        ctx: { ...base(i.contact, opts.days ?? daysSince(i.dueDate, now)), ...invoiceCtx(i, now) },
        contact: i.contact, invoice: i, jobId: i.jobId, jobTitle: i.job?.title ?? i.subject ?? null, assignedUserId: i.contact?.assignedToId ?? null, link: `/app/invoices/${i.id}`, label: `${name(i.contact) || "Invoice"} — invoice #${i.invoiceNumber}`,
      };
    }
    case "contact": {
      const c = await prisma.contact.findFirst({ where: { id: entityId, companyId }, select: CONTACT_SELECT });
      if (!c) return null;
      return { ...empty, ctx: base(c, opts.days ?? daysSince(c.stageChangedAt, now)), contact: c, assignedUserId: c.assignedToId, link: `/app/contacts/${c.id}`, label: name(c) };
    }
    case "payment": {
      const p = await prisma.payment.findFirst({
        where: { id: entityId, companyId },
        select: { id: true, amount: true, method: true, refunds: { select: { amount: true } }, invoice: { select: { ...INVOICE_SELECT, contact: { select: CONTACT_SELECT } } } },
      });
      if (!p) return null;
      const i = p.invoice;
      const refunded = money(p.refunds.reduce((s, r) => s + Number(r.amount), 0));
      const amount = money(p.amount);
      return {
        ...empty,
        ctx: { ...base(i.contact), ...invoiceCtx(i, now), payment_amount: amount, total: amount, payment_method: p.method, refund_amount: refunded },
        contact: i.contact, invoice: i, paymentId: p.id, jobId: i.jobId, jobTitle: i.job?.title ?? null, assignedUserId: i.contact?.assignedToId ?? null, link: `/app/invoices/${i.id}`, label: `${name(i.contact) || "Payment"} — ${amount.toFixed(2)} on invoice #${i.invoiceNumber}`,
      };
    }
    case "call": {
      const row = await prisma.call.findFirst({
        where: { id: entityId, companyId },
        select: { id: true, direction: true, status: true, customerNumber: true, agentNumber: true, durationSec: true, atlasNotes: true, contact: { select: CONTACT_SELECT } },
      });
      if (!row) return null;
      const inbound = row.direction === "INBOUND";
      return {
        ...empty,
        ctx: {
          ...base(row.contact), call_direction: row.direction, call_status: row.status,
          call_from: inbound ? row.customerNumber : row.agentNumber ?? "", call_to: inbound ? row.agentNumber ?? "" : row.customerNumber,
          call_duration: row.durationSec ?? 0, call_notes: row.atlasNotes ?? "",
        },
        contact: row.contact, assignedUserId: row.contact?.assignedToId ?? null, link: `/app/calls/${row.id}`, label: `${name(row.contact) || row.customerNumber} — ${row.direction.toLowerCase()} call`,
      };
    }
    case "message": {
      const pm = await prisma.portalMessage.findFirst({ where: { id: entityId, companyId }, select: { id: true, body: true, via: true, contact: { select: CONTACT_SELECT } } });
      if (pm) {
        return {
          ...empty,
          ctx: { ...base(pm.contact), message_body: pm.body, message_via: pm.via === "sms" ? "sms" : "portal", message_subject: "" },
          contact: pm.contact, assignedUserId: pm.contact.assignedToId, link: `/app/messages/thread/${pm.contact.id}`, label: `${name(pm.contact)} — message`,
        };
      }
      const cm = await prisma.clientMessage.findFirst({ where: { id: entityId, companyId }, select: { id: true, subject: true, body: true, contact: { select: CONTACT_SELECT } } });
      if (!cm) return null;
      return {
        ...empty,
        ctx: { ...base(cm.contact), message_body: cm.body, message_via: "email", message_subject: cm.subject },
        contact: cm.contact, assignedUserId: cm.contact.assignedToId, link: `/app/contacts/${cm.contact.id}`, label: `${name(cm.contact)} — email “${cm.subject}”`,
      };
    }
    case "contract": {
      const k = await prisma.contract.findFirst({ where: { id: entityId, companyId }, select: { id: true, title: true, status: true, publicToken: true, contact: { select: CONTACT_SELECT } } });
      if (!k) return null;
      return {
        ...empty,
        ctx: { ...base(k.contact), contract_title: k.title, contract_status: k.status, contract_link: `${baseUrl()}/contract/${k.publicToken}` },
        contact: k.contact, assignedUserId: k.contact.assignedToId, link: `/app/contracts/${k.id}`, label: `${name(k.contact)} — ${k.title}`,
      };
    }
    case "time_entry": {
      const t = await prisma.timeEntry.findFirst({
        where: { id: entityId, companyId },
        select: { id: true, startedAt: true, endedAt: true, userId: true, user: { select: { name: true } }, job: { select: { ...JOB_SELECT, contact: { select: CONTACT_SELECT } } } },
      });
      if (!t) return null;
      const end = t.endedAt ?? now;
      const shift = Math.round(((end.getTime() - t.startedAt.getTime()) / HOUR) * 100) / 100;
      const j = t.job;
      return {
        ...empty,
        ctx: {
          ...companyCtx(company, now, days, opts.hours ?? Math.floor(shift)), team_member: t.user.name, job_number: j?.jobNumber ?? 0, job_title: j?.title ?? "",
          shift_hours: shift, started_at: whenLabel(tz, t.startedAt),
        },
        contact: j?.contact ?? null, job: j ?? null, jobId: j?.id ?? null, jobTitle: j?.title ?? null, assignedUserId: t.userId,
        link: j ? `/app/jobs/${j.id}` : "/app/timesheets", label: `${t.user.name}${j ? ` — job #${j.jobNumber}` : ""}`,
      };
    }
    case "team_member": {
      const u = await prisma.user.findFirst({ where: { id: entityId, companyId }, select: { id: true, name: true, email: true, role: true } });
      if (!u) return null;
      return {
        ...empty,
        ctx: { ...companyCtx(company, now, days, hours), team_member: u.name, team_member_email: u.email, team_member_role: u.role },
        assignedUserId: u.id, link: "/app/settings/team", label: u.name,
      };
    }
    case "subscription": {
      const s = await prisma.subscription.findFirst({
        where: { id: entityId, companyId },
        select: { id: true, name: true, status: true, unitPrice: true, quantity: true, interval: true, visitFrequency: true, billPerVisit: true, contact: { select: CONTACT_SELECT } },
      });
      if (!s) return null;
      const amount = money(Number(s.unitPrice) * Number(s.quantity));
      const frequency = s.interval ? String(s.interval).toLowerCase() : s.billPerVisit ? "per visit" : s.visitFrequency ? `${String(s.visitFrequency).toLowerCase()} visits` : "";
      return {
        ...empty,
        ctx: { ...base(s.contact), subscription_name: s.name, subscription_status: s.status, subscription_amount: amount, total: amount, frequency },
        contact: s.contact, assignedUserId: s.contact.assignedToId, link: `/app/subscriptions/${s.id}`, label: `${name(s.contact)} — ${s.name}`,
      };
    }
    case "expense": {
      const e = await prisma.expense.findFirst({ where: { id: entityId, companyId }, select: { id: true, description: true, category: true, amount: true, createdById: true } });
      if (!e) return null;
      const by = e.createdById ? await prisma.user.findFirst({ where: { id: e.createdById }, select: { name: true } }) : null;
      const amount = money(e.amount);
      return {
        ...empty,
        ctx: { ...companyCtx(company, now, days, hours), expense_amount: amount, total: amount, expense_category: e.category ?? "", expense_note: e.description, expense_by: by?.name ?? "" },
        link: "/app/expenses", label: `Expense — ${e.description}`,
      };
    }
    case "company": {
      const parts = zonedParts(tz, now);
      const dayStart = zonedMidnight(tz, parts.y, parts.m, parts.d);
      const dayEnd = new Date(dayStart.getTime() + DAY);
      const [openQuotes, overdue, jobsToday, unscheduled, newLeads, openRequests] = await Promise.all([
        prisma.quote.count({ where: { companyId, status: "AWAITING_RESPONSE" } }),
        prisma.invoice.findMany({ where: { companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] }, dueDate: { lt: now } }, select: { total: true, payments: { select: { amount: true, surchargeAmount: true } } } }),
        prisma.job.count({ where: { companyId, status: "ACTIVE", scheduledAt: { gte: dayStart, lt: dayEnd } } }),
        prisma.job.count({ where: { companyId, status: "ACTIVE", scheduledAt: null } }),
        prisma.contact.count({ where: { companyId, status: "LEAD", createdAt: { gte: dayStart } } }),
        prisma.request.count({ where: { companyId, status: { in: ["NEW", "NEEDS_APPROVAL"] } } }),
      ]);
      const overdueBalance = money(overdue.reduce((s, i) => s + invoiceBalance({ total: Number(i.total), payments: i.payments.map((p) => ({ amount: Number(p.amount), surchargeAmount: p.surchargeAmount == null ? null : Number(p.surchargeAmount) })) }), 0));
      return {
        ...empty,
        ctx: {
          ...companyCtx(company, now, days, hours), open_quotes: openQuotes, overdue_invoices: overdue.length, overdue_balance: overdueBalance,
          jobs_today: jobsToday, unscheduled_jobs: unscheduled, new_leads_today: newLeads, open_requests: openRequests,
        },
        link: "/app/dashboard", label: company.name,
      };
    }
    case "webhook": {
      const data: AutomationCtx = {};
      const payload = opts.payload && typeof opts.payload === "object" ? opts.payload : {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
          const key = customFieldKey(k).replace(/^custom_/, "data_");
          data[key] = v as string | number | boolean | null;
        }
      }
      return { ...empty, ctx: { ...companyCtx(company, now, days, hours), ...data }, link: "/app/automations", label: "Webhook" };
    }
  }
}
