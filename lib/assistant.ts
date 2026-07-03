import { prisma } from "./db";
import {
  type Actor,
  canSell,
  canSeeMoney,
  canSeePricing,
  isManager,
  contactScope,
  viaContactScope,
  jobScope,
  appointmentScope,
  roleLabel,
} from "./permissions";
import { wallTimeToUtc } from "./booking-slots";
import { aiChat, type AIContent, type AIFunctionDecl, type AIPart } from "./ai";

/**
 * Owner assistant (docs/plans/ai-assistant-plan.md).
 *
 * Reads happen through the tool registry below — every tool is gated by the
 * same capability checks the pages use and scoped by the same Prisma scopes,
 * so the assistant can only read what the signed-in user could see by
 * clicking around.
 *
 * Writes NEVER happen here. Action tools stage a Proposal that the drawer
 * renders as a confirmation card; clicking Confirm submits to the SAME
 * existing API route the equivalent button uses (which re-validates role and
 * ownership server-side). Declined cards simply never submit.
 *
 * Results are deliberately small (top-N, minimal fields) — they land in the
 * model's context, so a chatty tool is a token bill and a distraction.
 */

const MAX_TOOL_ROUNDS = 6;
// Reasoning quality matters more here than in one-shot drafting — default to
// full Flash. 2.5-flash: the newer 3.x flash tiers allow only ~5 free
// requests/min, too few for multi-tool turns; once the key moves to the paid
// tier, set AI_MODEL_ASSISTANT=gemini-3.5-flash in Railway (no deploy).
const ASSISTANT_MODEL_DEFAULT = "gemini-2.5-flash";

/** A staged write, rendered as a confirmation card in the drawer. Confirm
 *  POSTs `payload` to `endpoint` — an existing, self-validating API route. */
export type Proposal = {
  id: string;
  kind: string;
  title: string;
  lines: string[];
  endpoint: string;
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
};

type ToolCtx = { proposals: Proposal[] };

type Tool = {
  decl: AIFunctionDecl;
  allowed: (actor: Actor) => boolean;
  run: (
    actor: Actor,
    args: Record<string, unknown>,
    ctx: ToolCtx
  ) => Promise<Record<string, unknown>>;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v: unknown): string {
  return `$${Number(v ?? 0).toFixed(2)}`;
}

function clientName(c: { firstName: string; lastName: string; companyName?: string | null }): string {
  const person = `${c.firstName} ${c.lastName}`.trim();
  return c.companyName ? `${person} (${c.companyName})` : person;
}

/** Parse YYYY-MM-DD to a UTC-noon date; null for garbage. */
function day(v: unknown): Date | null {
  const s = str(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtWhen(tz: string, d: Date, anytime: boolean): string {
  const date = d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (anytime) return `${date} (anytime)`;
  return `${date} ${d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;
}

async function companyTz(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return c?.timezone ?? "America/Chicago";
}

/** Look up one visible contact; shared by activity + action tools. */
async function findContact(actor: Actor, clientId: string) {
  return prisma.contact.findFirst({
    where: { id: str(clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
    select: { id: true, firstName: true, lastName: true, companyName: true, address: true },
  });
}

function stage(ctx: ToolCtx, p: Omit<Proposal, "id">): Record<string, unknown> {
  const proposal: Proposal = { ...p, id: `p${ctx.proposals.length + 1}-${p.kind}` };
  ctx.proposals.push(proposal);
  return {
    staged: true,
    summary: `${p.title} — a confirmation card is now showing; the user must press Confirm for it to happen.`,
  };
}

// ── read tools ───────────────────────────────────────────────────────────────

const tools: Tool[] = [
  {
    decl: {
      name: "search_clients",
      description:
        "Search the client list by name, company, email, or phone. Word order doesn't matter. If nothing matches, the response includes the most recent clients so you can spot near-misses (spelling, nicknames) — check those before concluding someone doesn't exist.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name, email, or phone fragment" } },
        required: ["query"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const q = str(args.query, 80);
      if (!q) return { error: "query is required" };
      // every word must match SOME field — "Laura Chen" finds firstName=Laura lastName=Chen
      const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
      const select = {
        id: true, firstName: true, lastName: true, companyName: true,
        email: true, phone: true, status: true, city: true,
      } as const;
      const rows = await prisma.contact.findMany({
        where: {
          companyId: actor.companyId,
          ...contactScope(actor),
          AND: words.map((w) => ({
            OR: [
              { firstName: { contains: w, mode: "insensitive" as const } },
              { lastName: { contains: w, mode: "insensitive" as const } },
              { companyName: { contains: w, mode: "insensitive" as const } },
              { email: { contains: w, mode: "insensitive" as const } },
              { phone: { contains: w } },
            ],
          })),
        },
        take: 8,
        orderBy: { updatedAt: "desc" },
        select,
      });
      const shape = (c: (typeof rows)[number]) => ({
        id: c.id, name: clientName(c), status: c.status,
        email: c.email, phone: c.phone, city: c.city,
      });
      if (rows.length > 0) return { clients: rows.map(shape) };
      // no match → hand back the recent roster so the model can self-correct
      const recent = await prisma.contact.findMany({
        where: { companyId: actor.companyId, ...contactScope(actor) },
        take: 20, orderBy: { updatedAt: "desc" }, select,
      });
      return {
        noExactMatch: true,
        note: "Nothing matched that query. Here are the most recent clients — check for a close spelling or nickname before telling the user the client doesn't exist.",
        recentClients: recent.map(shape),
      };
    },
  },
  {
    decl: {
      name: "get_client_activity",
      description:
        "The full picture for one client (by id from search_clients): contact info, quotes, jobs, invoices, upcoming appointments, agreements/contracts and their signature status, subscriptions, and recent notes.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const id = str(args.clientId, 40);
      const c = await prisma.contact.findFirst({
        where: { id, companyId: actor.companyId, ...contactScope(actor) },
        select: {
          firstName: true, lastName: true, companyName: true, email: true, phone: true,
          address: true, status: true, leadSource: true,
          quotes: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { quoteNumber: true, status: true, total: true, title: true, sentAt: true },
          },
          jobs: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { jobNumber: true, title: true, status: true, scheduledAt: true },
          },
          invoices: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { invoiceNumber: true, status: true, total: true, dueDate: true },
          },
          appointments: {
            where: { status: "SCHEDULED" }, take: 3, orderBy: { scheduledAt: "asc" },
            select: { title: true, scheduledAt: true, type: true, tentative: true },
          },
          contracts: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { title: true, status: true, sentAt: true, signedAt: true },
          },
          subscriptions: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { name: true, status: true, interval: true, unitPrice: true, nextRunDate: true },
          },
          contactNotes: {
            take: 3, orderBy: { createdAt: "desc" },
            select: { body: true, createdAt: true, user: { select: { name: true } } },
          },
        },
      });
      if (!c) return { error: "No client with that id (or not visible to this user)." };
      const seeMoney = canSeeMoney(actor);
      const seePrices = canSeePricing(actor.role);
      return {
        name: clientName(c),
        status: c.status,
        email: c.email,
        phone: c.phone,
        address: c.address,
        leadSource: c.leadSource,
        quotes: c.quotes.map((q) => ({
          n: q.quoteNumber, title: q.title, status: q.status,
          sent: q.sentAt?.toISOString().slice(0, 10),
          ...(seePrices ? { total: money(q.total) } : {}),
        })),
        jobs: c.jobs.map((j) => ({
          n: j.jobNumber, title: j.title, status: j.status,
          scheduled: j.scheduledAt?.toISOString().slice(0, 10) ?? "unscheduled",
        })),
        ...(seeMoney
          ? {
              invoices: c.invoices.map((i) => ({
                n: i.invoiceNumber, status: i.status, total: money(i.total),
                due: i.dueDate?.toISOString().slice(0, 10),
              })),
              subscriptions: c.subscriptions.map((s) => ({
                name: s.name, status: s.status, interval: s.interval,
                price: money(s.unitPrice), nextBill: s.nextRunDate.toISOString().slice(0, 10),
              })),
            }
          : {}),
        agreements: c.contracts.map((k) => ({
          title: k.title,
          status: k.status,
          sent: k.sentAt?.toISOString().slice(0, 10),
          signed: k.signedAt?.toISOString().slice(0, 10) ?? null,
        })),
        upcomingAppointments: c.appointments.map((a) => ({
          title: a.title, type: a.type, at: a.scheduledAt.toISOString(),
          ...(a.tentative ? { tentative: true } : {}),
        })),
        recentNotes: c.contactNotes.map((n) => ({
          by: n.user.name, on: n.createdAt.toISOString().slice(0, 10), note: n.body.slice(0, 200),
        })),
      };
    },
  },
  {
    decl: {
      name: "list_agreements",
      description:
        "Contracts/service agreements across all clients with signature status. filter: 'outstanding' (sent or drafted, not yet signed), 'signed', or 'all'.",
      parameters: {
        type: "object",
        properties: { filter: { type: "string", enum: ["outstanding", "signed", "all"] } },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const filter = str(args.filter, 12) || "outstanding";
      const status =
        filter === "signed"
          ? { status: "SIGNED" as const }
          : filter === "outstanding"
            ? { status: { in: ["DRAFT" as const, "SENT" as const] } }
            : { status: { not: "VOID" as const } };
      const rows = await prisma.contract.findMany({
        where: { companyId: actor.companyId, ...viaContactScope(actor), ...status },
        take: 15, orderBy: { updatedAt: "desc" },
        select: {
          title: true, status: true, sentAt: true, signedAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          quote: { select: { quoteNumber: true } },
        },
      });
      return {
        agreements: rows.map((k) => ({
          title: k.title, client: clientName(k.contact), status: k.status,
          sent: k.sentAt?.toISOString().slice(0, 10),
          signed: k.signedAt?.toISOString().slice(0, 10) ?? null,
          ...(k.quote ? { quoteN: k.quote.quoteNumber } : {}),
        })),
      };
    },
  },
  {
    decl: {
      name: "list_subscriptions",
      description: "Recurring billing subscriptions: plan, client, price, interval, status, next bill date.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED"] } },
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      const valid = ["ACTIVE", "PAUSED", "CANCELLED"];
      const status = valid.includes(str(args.status, 12)) ? (str(args.status, 12) as never) : undefined;
      const rows = await prisma.subscription.findMany({
        where: { companyId: actor.companyId, ...viaContactScope(actor), status },
        take: 15, orderBy: { nextRunDate: "asc" },
        select: {
          name: true, status: true, interval: true, unitPrice: true, quantity: true, nextRunDate: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      return {
        subscriptions: rows.map((s) => ({
          name: s.name, client: clientName(s.contact), status: s.status,
          price: money(Number(s.unitPrice) * Number(s.quantity)), interval: s.interval,
          nextBill: s.nextRunDate.toISOString().slice(0, 10),
        })),
      };
    },
  },
  {
    decl: {
      name: "whats_needing_attention",
      description:
        "One-call overview of everything waiting on the business right now: bookings to approve, new requests, past-due and draft invoices, quotes to send/convert, stale quotes awaiting a client reply, jobs to schedule or invoice, unsigned agreements. Use this for 'what should I do', 'how are we doing', or as a starting point for advice.",
      parameters: { type: "object", properties: {} },
    },
    allowed: () => true,
    run: async (actor) => {
      const companyId = actor.companyId;
      const sell = canSell(actor.role);
      const seeMoney = canSeeMoney(actor);
      const lead = viaContactScope(actor);
      const jScope = jobScope(actor);
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const [
        needsApproval, newRequests, pastDue, draftInvoices, draftQuotes,
        approvedQuotes, staleQuotes, unscheduledJobs, toInvoice, unsignedAgreements,
      ] = await Promise.all([
        sell ? prisma.request.count({ where: { companyId, ...lead, status: "NEEDS_APPROVAL" } }) : 0,
        sell ? prisma.request.count({ where: { companyId, ...lead, status: "NEW" } }) : 0,
        seeMoney ? prisma.invoice.count({ where: { companyId, ...lead, status: "PAST_DUE" } }) : 0,
        seeMoney ? prisma.invoice.count({ where: { companyId, ...lead, status: "DRAFT" } }) : 0,
        sell ? prisma.quote.count({ where: { companyId, ...lead, status: "DRAFT" } }) : 0,
        sell ? prisma.quote.count({ where: { companyId, ...lead, status: "APPROVED" } }) : 0,
        sell
          ? prisma.quote.count({
              where: { companyId, ...lead, status: "AWAITING_RESPONSE", sentAt: { lt: weekAgo } },
            })
          : 0,
        prisma.job.count({ where: { companyId, ...jScope, status: "ACTIVE", scheduledAt: null } }),
        prisma.job.count({ where: { companyId, ...jScope, status: "REQUIRES_INVOICING" } }),
        sell ? prisma.contract.count({ where: { companyId, ...lead, status: "SENT" } }) : 0,
      ]);
      return {
        ...(sell
          ? {
              bookingsToApprove: needsApproval,
              newRequests,
              draftQuotesToFinish: draftQuotes,
              approvedQuotesToConvert: approvedQuotes,
              quotesAwaitingReplyOverAWeek: staleQuotes,
              agreementsSentNotSigned: unsignedAgreements,
            }
          : {}),
        ...(seeMoney ? { pastDueInvoices: pastDue, draftInvoices } : {}),
        unscheduledJobs,
        jobsReadyToInvoice: toInvoice,
      };
    },
  },
  {
    decl: {
      name: "get_schedule",
      description:
        "Jobs and appointments on the calendar between two dates (inclusive, max 31 days). Use for anything about the schedule: today, this week, a specific day.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["from", "to"],
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const from = day(args.from);
      const to = day(args.to);
      if (!from || !to) return { error: "from/to must be YYYY-MM-DD" };
      const start = new Date(`${str(args.from, 10)}T00:00:00-12:00`); // generous TZ pad
      const end = new Date(`${str(args.to, 10)}T23:59:59+14:00`);
      if (end.getTime() - start.getTime() > 33 * 86400000) return { error: "Range too wide — max 31 days." };
      const tz = await companyTz(actor.companyId);
      const [jobs, appts] = await Promise.all([
        prisma.job.findMany({
          where: {
            companyId: actor.companyId, ...jobScope(actor),
            scheduledAt: { gte: start, lte: end }, status: { not: "ARCHIVED" },
          },
          take: 40, orderBy: { scheduledAt: "asc" },
          select: {
            jobNumber: true, title: true, scheduledAt: true, scheduledAnytime: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
            assignments: { select: { user: { select: { name: true } } } },
          },
        }),
        prisma.appointment.findMany({
          where: {
            companyId: actor.companyId, ...appointmentScope(actor),
            scheduledAt: { gte: start, lte: end }, status: "SCHEDULED",
          },
          take: 40, orderBy: { scheduledAt: "asc" },
          select: {
            title: true, type: true, scheduledAt: true, scheduledAnytime: true, tentative: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
            assignedTo: { select: { name: true } },
          },
        }),
      ]);
      return {
        jobs: jobs.map((j) => ({
          n: j.jobNumber, title: j.title, client: clientName(j.contact),
          when: j.scheduledAt ? fmtWhen(tz, j.scheduledAt, j.scheduledAnytime) : "unscheduled",
          crew: j.assignments.map((x) => x.user.name),
        })),
        appointments: appts.map((a) => ({
          title: a.title, type: a.type, client: clientName(a.contact),
          when: fmtWhen(tz, a.scheduledAt, a.scheduledAnytime),
          with: a.assignedTo?.name, ...(a.tentative ? { tentative: true } : {}),
        })),
      };
    },
  },
  {
    decl: {
      name: "list_money",
      description:
        "Recent invoices or payments. Filter invoices by status: DRAFT, AWAITING_PAYMENT, PAID, PAST_DUE. Invoice results include the invoice number needed for record_payment.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["invoices", "payments"] },
          status: { type: "string", description: "invoice status filter (optional)" },
        },
        required: ["kind"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      if (args.kind === "payments") {
        const rows = await prisma.payment.findMany({
          where: { companyId: actor.companyId, ...viaContactScope(actor) },
          take: 15, orderBy: { paidAt: "desc" },
          select: {
            amount: true, method: true, paidAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          payments: rows.map((p) => ({
            amount: money(p.amount), method: p.method,
            client: p.contact ? clientName(p.contact) : null,
            on: p.paidAt.toISOString().slice(0, 10),
          })),
        };
      }
      const valid = ["DRAFT", "AWAITING_PAYMENT", "PAID", "PAST_DUE"];
      const status = valid.includes(str(args.status, 20)) ? (str(args.status, 20) as never) : undefined;
      const rows = await prisma.invoice.findMany({
        where: { companyId: actor.companyId, ...viaContactScope(actor), status },
        take: 15, orderBy: { updatedAt: "desc" },
        select: {
          invoiceNumber: true, status: true, total: true, dueDate: true, subject: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          payments: { select: { amount: true } },
        },
      });
      return {
        invoices: rows.map((i) => {
          const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
          return {
            n: i.invoiceNumber, subject: i.subject, status: i.status,
            total: money(i.total), paid: money(paid),
            due: i.dueDate?.toISOString().slice(0, 10),
            client: i.contact ? clientName(i.contact) : null,
          };
        }),
      };
    },
  },
  {
    decl: {
      name: "list_pipeline",
      description:
        "Recent requests, quotes, or jobs. Optional status filter — requests: NEW, NEEDS_APPROVAL, CONVERTED, ARCHIVED; quotes: DRAFT, AWAITING_RESPONSE, APPROVED, CHANGES_REQUESTED, CONVERTED; jobs: ACTIVE, REQUIRES_INVOICING, ARCHIVED (or 'unscheduled').",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["requests", "quotes", "jobs"] },
          status: { type: "string" },
        },
        required: ["kind"],
      },
    },
    allowed: () => true, // techs get jobs only; requests/quotes re-check inside
    run: async (actor, args) => {
      const status = str(args.status, 24);
      if (args.kind === "jobs") {
        const unscheduled = status.toLowerCase() === "unscheduled";
        const valid = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
        const rows = await prisma.job.findMany({
          where: {
            companyId: actor.companyId, ...jobScope(actor),
            status: valid.includes(status) ? (status as never) : unscheduled ? "ACTIVE" : { not: "ARCHIVED" },
            ...(unscheduled ? { scheduledAt: null } : {}),
          },
          take: 15, orderBy: { updatedAt: "desc" },
          select: {
            jobNumber: true, title: true, status: true, scheduledAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          jobs: rows.map((j) => ({
            n: j.jobNumber, title: j.title, status: j.status, client: clientName(j.contact),
            scheduled: j.scheduledAt?.toISOString().slice(0, 10) ?? "unscheduled",
          })),
        };
      }
      if (!canSell(actor.role)) return { error: "This user's role can't view requests/quotes." };
      if (args.kind === "requests") {
        const valid = ["NEW", "NEEDS_APPROVAL", "CONVERTED", "ARCHIVED"];
        const rows = await prisma.request.findMany({
          where: {
            companyId: actor.companyId, ...viaContactScope(actor),
            status: valid.includes(status) ? (status as never) : undefined,
          },
          take: 15, orderBy: { createdAt: "desc" },
          select: {
            requestNumber: true, title: true, status: true, createdAt: true, source: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          requests: rows.map((r) => ({
            n: r.requestNumber, title: r.title, status: r.status, source: r.source,
            client: clientName(r.contact), on: r.createdAt.toISOString().slice(0, 10),
          })),
        };
      }
      const valid = ["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "CONVERTED", "ARCHIVED"];
      const rows = await prisma.quote.findMany({
        where: {
          companyId: actor.companyId, ...viaContactScope(actor),
          status: valid.includes(status) ? (status as never) : undefined,
        },
        take: 15, orderBy: { updatedAt: "desc" },
        select: {
          quoteNumber: true, title: true, status: true, total: true, sentAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      const seePrices = canSeePricing(actor.role);
      return {
        quotes: rows.map((q) => ({
          n: q.quoteNumber, title: q.title, status: q.status, client: clientName(q.contact),
          ...(seePrices ? { total: money(q.total) } : {}),
          sent: q.sentAt?.toISOString().slice(0, 10),
        })),
      };
    },
  },
  {
    decl: {
      name: "business_summary",
      description:
        "Money and activity totals for a date range (max 1 year): payments collected, amount invoiced, expenses, new clients, jobs completed. Call twice with different ranges to compare periods.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["from", "to"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      const from = day(args.from);
      const to = day(args.to);
      if (!from || !to) return { error: "from/to must be YYYY-MM-DD" };
      const end = new Date(to.getTime() + 86400000);
      if (end.getTime() - from.getTime() > 370 * 86400000) return { error: "Range too wide — max 1 year." };
      const companyId = actor.companyId;
      const [payments, invoiced, expenses, newClients, jobsDone] = await Promise.all([
        prisma.payment.aggregate({
          where: { companyId, paidAt: { gte: from, lt: end } },
          _sum: { amount: true }, _count: true,
        }),
        prisma.invoice.aggregate({
          where: { companyId, issuedAt: { gte: from, lt: end } },
          _sum: { total: true }, _count: true,
        }),
        isManager(actor.role)
          ? prisma.expense.aggregate({
              where: { companyId, incurredAt: { gte: from, lt: end } },
              _sum: { amount: true },
            })
          : Promise.resolve(null),
        prisma.contact.count({ where: { companyId, createdAt: { gte: from, lt: end } } }),
        prisma.job.count({ where: { companyId, completedAt: { gte: from, lt: end } } }),
      ]);
      return {
        paymentsCollected: money(payments._sum.amount),
        paymentCount: payments._count,
        invoiced: money(invoiced._sum.total),
        invoiceCount: invoiced._count,
        ...(expenses ? { expenses: money(expenses._sum.amount) } : {}),
        newClients,
        jobsCompleted: jobsDone,
      };
    },
  },
  {
    decl: {
      name: "get_price_book",
      description: "The company's services and products with prices, time-on-site durations, and recurring billing settings. Use before drafting quotes so line items match real offerings.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSeePricing(a.role),
    run: async (actor) => {
      const rows = await prisma.workItem.findMany({
        where: { companyId: actor.companyId, isActive: true },
        take: 60, orderBy: { name: "asc" },
        select: {
          name: true, type: true, unitPrice: true, durationMinutes: true,
          recurringInterval: true,
        },
      });
      return {
        items: rows.map((w) => ({
          name: w.name, type: w.type, price: money(w.unitPrice),
          minutesOnSite: w.durationMinutes,
          ...(w.recurringInterval ? { billing: w.recurringInterval } : {}),
        })),
      };
    },
  },
  {
    decl: {
      name: "get_company_settings",
      description:
        "How the company is configured: business hours, service-area ZIPs, arrival window, online-booking status and which services are bookable, bookable team members, timezone, review link.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor) => {
      const [company, bookable, forms] = await Promise.all([
        prisma.company.findUnique({
          where: { id: actor.companyId },
          select: {
            timezone: true, businessHours: true, serviceZips: true,
            arrivalWindowMinutes: true, reviewLink: true, industry: true,
          },
        }),
        prisma.user.findMany({
          where: { companyId: actor.companyId, isActive: true, bookable: true },
          select: { name: true },
        }),
        prisma.webForm.findMany({
          where: { companyId: actor.companyId, isActive: true },
          select: { name: true, type: true, config: true },
        }),
      ]);
      if (!company) return { error: "Company not found" };
      type FormCfg = { selfSchedule?: { enabled?: boolean }; services?: { name?: string }[] };
      const selfScheduleOn = forms.some((f) => {
        const c = f.config as FormCfg;
        return f.type === "BOOKING" && c?.selfSchedule?.enabled === true;
      });
      // only services placed on a self-scheduling form are actually bookable online
      const bookableServices = forms
        .filter((f) => f.type === "BOOKING" && (f.config as FormCfg)?.selfSchedule?.enabled)
        .flatMap((f) => ((f.config as FormCfg).services ?? []).map((s) => s?.name).filter(Boolean));
      return {
        servicesBookableOnline: selfScheduleOn ? bookableServices : [],
        industry: company.industry,
        timezone: company.timezone,
        businessHours: company.businessHours,
        serviceZipCount: company.serviceZips.length,
        arrivalWindowMinutes: company.arrivalWindowMinutes,
        onlineBookingEnabled: selfScheduleOn,
        bookableTeamMembers: bookable.map((u) => u.name),
        reviewLinkConfigured: Boolean(company.reviewLink),
        forms: forms.map((f) => ({ name: f.name, type: f.type })),
      };
    },
  },

  // ── action tools (stage a confirmation card; never write directly) ─────────

  {
    decl: {
      name: "create_client",
      description:
        "Stage adding a new client. The user sees a confirmation card and must press Confirm. First and last name required.",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string" }, lastName: { type: "string" },
          companyName: { type: "string" }, email: { type: "string" },
          phone: { type: "string" }, address: { type: "string" }, notes: { type: "string" },
        },
        required: ["firstName", "lastName"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (_actor, args, ctx) => {
      const firstName = str(args.firstName, 60);
      const lastName = str(args.lastName, 60);
      if (!firstName || !lastName) return { error: "firstName and lastName are required" };
      const payload = {
        firstName, lastName,
        companyName: str(args.companyName, 100) || undefined,
        email: str(args.email, 200) || undefined,
        phone: str(args.phone, 40) || undefined,
        address: str(args.address, 200) || undefined,
        notes: str(args.notes, 500) || undefined,
      };
      return stage(ctx, {
        kind: "create_client",
        title: `Add client ${firstName} ${lastName}`,
        lines: [
          payload.companyName && `Company: ${payload.companyName}`,
          payload.email && `Email: ${payload.email}`,
          payload.phone && `Phone: ${payload.phone}`,
          payload.address && `Address: ${payload.address}`,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/contacts",
        method: "POST",
        payload,
      });
    },
  },
  {
    decl: {
      name: "update_client",
      description:
        "Stage updating a client's contact details (email, phone, address, notes). Only include fields that should change. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          email: { type: "string" }, phone: { type: "string" },
          address: { type: "string" }, notes: { type: "string" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      for (const key of ["email", "phone", "address", "notes"] as const) {
        const v = str(args[key], key === "notes" ? 500 : 200);
        if (v) {
          payload[key] = v;
          lines.push(`${key[0].toUpperCase()}${key.slice(1)}: ${v}`);
        }
      }
      if (lines.length === 0) return { error: "Nothing to change — provide at least one field." };
      return stage(ctx, {
        kind: "update_client",
        title: `Update ${clientName(contact)}`,
        lines,
        endpoint: `/api/app/contacts/${contact.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "create_quote",
      description:
        "Stage a draft quote for a client. Check get_price_book first so line items use real service names and prices. The quote is created as a DRAFT for the user to review and send. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string" },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number" },
              },
              required: ["description", "quantity", "unitPrice"],
            },
          },
        },
        required: ["clientId", "lineItems"],
      },
    },
    allowed: (a) => canSell(a.role) && canSeePricing(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const rawItems = Array.isArray(args.lineItems) ? args.lineItems.slice(0, 10) : [];
      const lineItems = rawItems
        .map((li) => {
          const r = (li ?? {}) as Record<string, unknown>;
          const quantity = num(r.quantity);
          const unitPrice = num(r.unitPrice);
          return {
            description: str(r.description, 200),
            quantity: quantity && quantity > 0 && quantity <= 999 ? quantity : 1,
            unitPrice: unitPrice !== null && unitPrice >= 0 && unitPrice <= 100000 ? unitPrice : 0,
          };
        })
        .filter((li) => li.description);
      if (lineItems.length === 0) return { error: "At least one line item with a description is required." };
      const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      return stage(ctx, {
        kind: "create_quote",
        title: `Draft quote for ${clientName(contact)} — ${money(total)}`,
        lines: lineItems.map(
          (li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`
        ),
        endpoint: "/api/app/quotes",
        method: "POST",
        payload: {
          contactId: contact.id,
          title: str(args.title, 120) || undefined,
          lineItems,
        },
      });
    },
  },
  {
    decl: {
      name: "schedule_appointment",
      description:
        "Stage an appointment (estimate visit, sales call) with a client. type: PHONE_CALL, VIDEO_CALL, or IN_PERSON (in-person needs an address — the client's address is used if none given). Omit time for an 'anytime that day' appointment. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string", description: "e.g. Estimate visit" },
          type: { type: "string", enum: ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"] },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h, company-local (optional)" },
          durationMinutes: { type: "number", description: "default 60" },
          address: { type: "string" },
        },
        required: ["clientId", "title", "type", "date"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const type = ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"].includes(str(args.type, 20))
        ? str(args.type, 20)
        : "IN_PERSON";
      const d = day(args.date);
      if (!d) return { error: "date must be YYYY-MM-DD" };
      const address = str(args.address, 200) || contact.address || "";
      if (type === "IN_PERSON" && !address) {
        return { error: "In-person needs an address and the client has none on file — ask the user for one." };
      }
      const tz = await companyTz(actor.companyId);
      const [y, m, dd] = str(args.date, 10).split("-").map(Number);
      const time = str(args.time, 5);
      const anytime = !/^\d{2}:\d{2}$/.test(time);
      const minutes = anytime ? 12 * 60 : Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      const start = wallTimeToUtc(tz, y, m, dd, minutes);
      const dur = num(args.durationMinutes);
      const durationMin = dur && dur >= 15 && dur <= 480 ? dur : 60;
      const whenLabel = fmtWhen(tz, start, anytime);
      return stage(ctx, {
        kind: "schedule_appointment",
        title: `Appointment: ${str(args.title, 80)} — ${whenLabel}`,
        lines: [
          `Client: ${clientName(contact)}`,
          `Type: ${type.replace("_", " ").toLowerCase()}`,
          type === "IN_PERSON" ? `Address: ${address}` : null,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/appointments",
        method: "POST",
        payload: {
          contactId: contact.id,
          title: str(args.title, 80),
          type,
          scheduledAt: start.toISOString(),
          ...(anytime
            ? { scheduledAnytime: true }
            : { scheduledEnd: new Date(start.getTime() + durationMin * 60000).toISOString() }),
          ...(type === "IN_PERSON" ? { address } : {}),
        },
      });
    },
  },
  {
    decl: {
      name: "record_payment",
      description:
        "Stage recording a payment against an invoice (find the invoice number via list_money or get_client_activity first). method: CASH, CHECK, CASH_APP, PAYPAL, VENMO, ZELLE, CARD, ACH, OTHER. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: { type: "number" },
          amount: { type: "number" },
          method: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD (optional, defaults today)" },
        },
        required: ["invoiceNumber", "amount", "method"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args, ctx) => {
      const n = num(args.invoiceNumber);
      const amount = num(args.amount);
      const method = str(args.method, 12).toUpperCase();
      const validMethods = ["CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER"];
      if (!n) return { error: "invoiceNumber is required" };
      if (!amount || amount <= 0 || amount > 1_000_000) return { error: "amount must be a positive number" };
      if (!validMethods.includes(method)) return { error: `method must be one of ${validMethods.join(", ")}` };
      const invoice = await prisma.invoice.findFirst({
        where: { companyId: actor.companyId, invoiceNumber: n, ...viaContactScope(actor) },
        select: {
          id: true, total: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          payments: { select: { amount: true } },
        },
      });
      if (!invoice) return { error: `No invoice #${n} (or not visible to this user).` };
      const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
      const dateStr = day(args.date) ? str(args.date, 10) : undefined;
      return stage(ctx, {
        kind: "record_payment",
        title: `Record ${money(amount)} ${method.replace("_", " ")} payment on invoice #${n}`,
        lines: [
          invoice.contact ? `Client: ${clientName(invoice.contact)}` : null,
          `Invoice total ${money(invoice.total)}, ${money(paid)} already paid`,
          dateStr ? `Payment date: ${dateStr}` : null,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/payments",
        method: "POST",
        payload: { invoiceId: invoice.id, amount, method, ...(dateStr ? { paidAt: dateStr } : {}) },
      });
    },
  },
];

export function toolsForActor(actor: Actor): Tool[] {
  return tools.filter((t) => t.allowed(actor));
}

// ── system prompt ────────────────────────────────────────────────────────────

const APP_CHEATSHEET = `Where things live in the app (always give these as paths, e.g. /app/contacts — the chat renders them as links):
- Clients: /app/contacts (CSV import lives there too — Jobber/Housecall Pro exports auto-map)
- Requests (incoming leads + online bookings to approve): /app/requests
- Quotes: /app/quotes — approved quotes convert to jobs; deposits collected from the quote page
- Jobs: /app/jobs — completing a job marks it ready to invoice
- Invoices & payments: /app/invoices
- Subscriptions (recurring billing): /app/subscriptions
- Schedule (calendar, drag to schedule): /app/schedule
- Insights (charts): /app/insights
- Price book: /app/settings/products
- Booking forms + embed code + online scheduling settings: /app/settings/booking
- Contract templates (e-sign agreements): /app/settings/contracts
- Team, roles, who's bookable online: /app/settings/team
- Business info, timezone, branding, deposits: /app/settings
- AI setup assistant (re-runnable): /app/setup`;

function systemPrompt(actor: Actor, companyName: string, tz: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  return `You are the built-in assistant for ${companyName}'s Streamflaire Hub account — field-service business software (clients, quotes, jobs, invoices, scheduling, agreements, online booking). Your job is to make running this business easier: answer from real data, do the busywork, and surface what matters.

Today is ${weekday}, ${today} (${tz}). The user is ${actor.name}, role: ${roleLabel[actor.role]}.

Data rules:
- For ANY question about their business, call tools — never guess or invent numbers.
- BE PERSISTENT. If a search comes up empty, try variations before giving up: last name only, first name only, part of the company name. Check the recentClients list in empty search results for close spellings. Only say something doesn't exist after genuinely exhausting the options, and then show the closest matches you found.
- Answer the question that was MEANT: "did Sarah sign?" means check her agreements (get_client_activity or list_agreements), "how are we doing" means whats_needing_attention plus business_summary.
- Be proactive: when results show something actionable (past-due invoices, week-old unanswered quotes, unsigned agreements, unscheduled jobs), mention it briefly even if not asked.

Actions:
- You CAN do things, with the user's confirmation: add or update a client, draft a quote, schedule an appointment, record a payment. When asked, gather what you need (use tools — e.g. price book before quoting, invoice number before payments), then call the action tool ONCE. It shows the user a confirmation card; tell them to review and press Confirm. Never claim something was done — the card does it only after they confirm.
- For anything you can't stage (sending things, converting quotes, editing jobs), point them to the right page path from the list below.

Style:
- Concise and concrete. Plain text only — no markdown symbols like ** or #. Use "-" for lists.
- Refer to app pages by path (e.g. /app/invoices) — the chat renders paths as clickable links.
- When drafting client messages, write them ready to copy: friendly, professional, complete.
- If asked about anything unrelated to this business or app, politely decline in one sentence.

${APP_CHEATSHEET}`;
}

// ── the loop ─────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantResult = { reply: string; proposals: Proposal[] };

/**
 * Run one assistant turn: history in, final text + any staged proposals out.
 * Tool calls happen server-side, bounded to MAX_TOOL_ROUNDS. Returns null
 * when AI is unconfigured or the model errors.
 */
export async function runAssistant(
  actor: Actor,
  messages: ChatMessage[]
): Promise<AssistantResult | null> {
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { name: true, timezone: true },
  });
  if (!company) return null;

  const active = toolsForActor(actor);
  const model = process.env.AI_MODEL_ASSISTANT || ASSISTANT_MODEL_DEFAULT;
  const ctx: ToolCtx = { proposals: [] };

  const contents: AIContent[] = messages.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.slice(0, 4000) }],
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const parts = await aiChat({
      system: systemPrompt(actor, company.name, company.timezone),
      contents,
      tools: active.map((t) => t.decl),
      model,
      maxOutputTokens: 1200,
      // last round: no tools, force it to answer with what it has
      ...(round === MAX_TOOL_ROUNDS ? { tools: [] } : {}),
    });
    if (!parts) return null;

    const calls = parts.filter(
      (p): p is Extract<AIPart, { functionCall: unknown }> => "functionCall" in p
    );
    if (calls.length === 0) {
      const text = parts
        .map((p) => ("text" in p ? p.text : ""))
        .join("")
        .trim();
      if (text) return { reply: text, proposals: ctx.proposals };
      // model went silent (rare) — if it staged something, still surface it
      return ctx.proposals.length > 0
        ? { reply: "I've set that up — review the card below and confirm.", proposals: ctx.proposals }
        : null;
    }

    // execute this round's calls, then feed the results back
    contents.push({ role: "model", parts: calls });
    const responses: AIPart[] = [];
    for (const call of calls.slice(0, 4)) {
      const tool = active.find((t) => t.decl.name === call.functionCall.name);
      let response: Record<string, unknown>;
      if (!tool) {
        response = { error: `Unknown tool ${call.functionCall.name}` };
      } else {
        try {
          response = await tool.run(actor, call.functionCall.args ?? {}, ctx);
        } catch (err) {
          console.error(`assistant tool ${call.functionCall.name} failed`, err);
          response = { error: "The lookup failed — suggest the user check the page directly." };
        }
      }
      responses.push({ functionResponse: { name: call.functionCall.name, response } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return null;
}
