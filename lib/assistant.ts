import { randomBytes } from "crypto";
import { prisma } from "./db";
import {
  type Actor,
  type Role,
  canSell,
  canSeeMoney,
  canSeePricing,
  canManageRole,
  isManager,
  contactScope,
  viaContactScope,
  jobScope,
  appointmentScope,
  roleLabel,
} from "./permissions";
import {
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  sanitizeBusinessHours,
  timeToMinutes,
} from "./business-hours";
import { wallTimeToUtc } from "./booking-slots";
import {
  aiChat,
  AI_THOUGHT_SIGNATURE_SENTINEL,
  type AIContent,
  type AIFunctionDecl,
  type AIPart,
} from "./ai";

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

const MAX_TOOL_ROUNDS = 8;
// Tool calls executed per round. Bulk staging (one update card per record)
// leans on this. Overflow calls are NOT silently dropped — they get an
// error response telling the model to re-issue them next round.
const MAX_CALLS_PER_ROUND = 16;
/** Default display name for the assistant; companies can rename it in Settings. */
export const DEFAULT_ASSISTANT_NAME = "Atlas";
// Reasoning quality matters more here than in one-shot drafting — default to
// full Flash. 2.5-flash: the newer 3.x flash tiers allow only ~5 free
// requests/min, too few for multi-tool turns; once the key moves to the paid
// tier, set AI_MODEL_ASSISTANT=gemini-3.5-flash in Railway (no deploy).
const ASSISTANT_MODEL_DEFAULT = "gemini-2.5-flash";
// Per-model free-tier quotas are separate buckets — when the primary 429s,
// finishing the turn on lite beats erroring at the user.
const ASSISTANT_MODEL_FALLBACK = "gemini-flash-lite-latest";

/** One request of a batch proposal. */
export type BatchItem = {
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
};

/** A staged write, rendered as a confirmation card in the drawer. Confirm
 *  POSTs `payload` to `endpoint` — an existing, self-validating API route. */
export type Proposal = {
  id: string;
  kind: string;
  title: string;
  lines: string[];
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
  /** Destructive action — card renders red. */
  danger?: boolean;
  /** Extra authentication for destructive cards: the user must type this
   *  exact text before Confirm arms (matches the force-delete page UX). */
  confirmText?: string;
  /** Bulk work: one card, one Confirm, many requests run in order.
   *  When present, endpoint/method/payload above are ignored. */
  batch?: BatchItem[];
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

/** date (+optional time/duration) → schedule payload fields + display label,
 *  wall-time-correct in the company's timezone. */
async function schedulePayload(
  companyId: string,
  dateArg: unknown,
  timeArg: unknown,
  durationArg: unknown
): Promise<{ error: string } | { fields: Record<string, unknown>; label: string }> {
  const d = day(dateArg);
  if (!d) return { error: "date must be YYYY-MM-DD" };
  const tz = await companyTz(companyId);
  const [y, m, dd] = str(dateArg, 10).split("-").map(Number);
  const time = str(timeArg, 5);
  const anytime = !/^\d{2}:\d{2}$/.test(time);
  const minutes = anytime ? 12 * 60 : Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const start = wallTimeToUtc(tz, y, m, dd, minutes);
  const dur = num(durationArg);
  const durationMin = dur && dur >= 15 && dur <= 600 ? dur : 60;
  return {
    label: fmtWhen(tz, start, anytime),
    fields: {
      scheduledAt: start.toISOString(),
      ...(anytime
        ? { scheduledAnytime: true, scheduledEnd: null }
        : {
            scheduledAnytime: false,
            scheduledEnd: new Date(start.getTime() + durationMin * 60000).toISOString(),
          }),
    },
  };
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
            select: { id: true, title: true, scheduledAt: true, type: true, tentative: true },
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
          id: a.id, title: a.title, type: a.type, at: a.scheduledAt.toISOString(),
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
      // Generous TZ pad — widen OUTWARD: earliest local midnight on Earth is
      // UTC+14, latest local end-of-day is UTC-12. (Inverting these produces an
      // empty window and "nothing scheduled" answers for single-day queries.)
      const start = new Date(`${str(args.from, 10)}T00:00:00+14:00`);
      const end = new Date(`${str(args.to, 10)}T23:59:59-12:00`);
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
            id: true, title: true, type: true, scheduledAt: true, scheduledAnytime: true, tentative: true,
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
          id: a.id, title: a.title, type: a.type, client: clientName(a.contact),
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
            id: true, amount: true, method: true, paidAt: true,
            invoice: { select: { invoiceNumber: true } },
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          payments: rows.map((p) => ({
            id: p.id, amount: money(p.amount), method: p.method,
            invoiceN: p.invoice.invoiceNumber,
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
            assistantName: true, phone: true, email: true, website: true,
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
        assistantName: company.assistantName ?? "Atlas (default)",
        businessPhone: company.phone,
        businessEmail: company.email,
        website: company.website,
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
  {
    decl: {
      name: "add_client_note",
      description: "Stage adding a note to a client's record. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" }, note: { type: "string" } },
        required: ["clientId", "note"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const note = str(args.note, 2000);
      if (!note) return { error: "note is required" };
      return stage(ctx, {
        kind: "add_client_note",
        title: `Add note to ${clientName(contact)}`,
        lines: [note.slice(0, 200)],
        endpoint: `/api/app/contacts/${contact.id}/notes`,
        method: "POST",
        payload: { body: note },
      });
    },
  },
  {
    decl: {
      name: "create_request",
      description:
        "Stage a new work request (lead) for a client — the top of the pipeline, before a quote exists. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string", description: "What they want, e.g. 'Gutter cleaning'" },
          details: { type: "string" },
        },
        required: ["clientId", "title"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const title = str(args.title, 120);
      if (!title) return { error: "title is required" };
      const details = str(args.details, 2000);
      return stage(ctx, {
        kind: "create_request",
        title: `New request: ${title}`,
        lines: [`Client: ${clientName(contact)}`, details && `Details: ${details.slice(0, 150)}`].filter(
          Boolean
        ) as string[],
        endpoint: "/api/app/requests",
        method: "POST",
        payload: { contactId: contact.id, title, details: details || undefined },
      });
    },
  },
  {
    decl: {
      name: "create_job",
      description:
        "Stage a new job for a client, optionally scheduled (omit date to leave it unscheduled, omit time for 'anytime that day'). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD (optional)" },
          time: { type: "string", description: "HH:MM 24h company-local (optional)" },
          durationMinutes: { type: "number" },
          address: { type: "string", description: "defaults to the client's address" },
        },
        required: ["clientId", "title"],
      },
    },
    allowed: (a) => isManager(a.role) || a.role === "USER", // matches the jobs POST route
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const title = str(args.title, 120);
      if (!title) return { error: "title is required" };
      let scheduleFields: Record<string, unknown> = {};
      let whenLabel = "unscheduled";
      if (str(args.date, 10)) {
        const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
        if ("error" in sched) return sched;
        scheduleFields = sched.fields;
        whenLabel = sched.label;
      }
      const address = str(args.address, 200) || contact.address || undefined;
      return stage(ctx, {
        kind: "create_job",
        title: `New job: ${title} — ${whenLabel}`,
        lines: [
          `Client: ${clientName(contact)}`,
          address && `Address: ${address}`,
          str(args.description, 300) && `Notes: ${str(args.description, 150)}`,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/jobs",
        method: "POST",
        payload: {
          contactId: contact.id,
          title,
          description: str(args.description, 2000) || undefined,
          address,
          ...scheduleFields,
        },
      });
    },
  },
  {
    decl: {
      name: "reschedule_job",
      description:
        "Stage moving a job (by job number) to a new date/time, or omit time for 'anytime that day'. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          jobNumber: { type: "number" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h company-local (optional)" },
          durationMinutes: { type: "number" },
        },
        required: ["jobNumber", "date"],
      },
    },
    allowed: (a) => a.role !== "SALES",
    run: async (actor, args, ctx) => {
      const n = num(args.jobNumber);
      const job = await prisma.job.findFirst({
        where: { companyId: actor.companyId, jobNumber: n ?? -1, ...jobScope(actor) },
        select: {
          id: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!job) return { error: `No job #${n} (or not visible to this user).` };
      const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
      if ("error" in sched) return sched;
      return stage(ctx, {
        kind: "reschedule_job",
        title: `Move job #${n} (${job.title}) to ${sched.label}`,
        lines: [`Client: ${clientName(job.contact)}`],
        endpoint: `/api/app/jobs/${job.id}`,
        method: "PATCH",
        payload: sched.fields,
      });
    },
  },
  {
    decl: {
      name: "update_job_status",
      description:
        "Stage a job status change (by job number). REQUIRES_INVOICING = work finished, ready to bill. ARCHIVED = closed. ACTIVE = reopen. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          jobNumber: { type: "number" },
          status: { type: "string", enum: ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"] },
        },
        required: ["jobNumber", "status"],
      },
    },
    allowed: (a) => a.role !== "SALES", // matches the status route
    run: async (actor, args, ctx) => {
      const n = num(args.jobNumber);
      const status = str(args.status, 24);
      if (!["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"].includes(status)) {
        return { error: "status must be ACTIVE, REQUIRES_INVOICING, or ARCHIVED" };
      }
      const job = await prisma.job.findFirst({
        where: { companyId: actor.companyId, jobNumber: n ?? -1, ...jobScope(actor) },
        select: {
          id: true, title: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!job) return { error: `No job #${n} (or not visible to this user).` };
      const labels: Record<string, string> = {
        ACTIVE: "Reopen",
        REQUIRES_INVOICING: "Mark complete (ready to invoice)",
        ARCHIVED: "Close",
      };
      return stage(ctx, {
        kind: "update_job_status",
        title: `${labels[status]}: job #${n} (${job.title})`,
        lines: [`Client: ${clientName(job.contact)}`, `Currently: ${job.status}`],
        endpoint: `/api/app/jobs/${job.id}/status`,
        method: "PATCH",
        payload: { status },
      });
    },
  },
  {
    decl: {
      name: "reschedule_appointment",
      description:
        "Stage moving an appointment (by the id from get_schedule or get_client_activity) to a new date/time. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h company-local (optional)" },
          durationMinutes: { type: "number" },
        },
        required: ["appointmentId", "date"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: str(args.appointmentId, 40), companyId: actor.companyId,
          ...appointmentScope(actor), status: "SCHEDULED",
        },
        select: {
          id: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!appt) return { error: "No scheduled appointment with that id (or not visible to this user)." };
      const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
      if ("error" in sched) return sched;
      return stage(ctx, {
        kind: "reschedule_appointment",
        title: `Move "${appt.title}" to ${sched.label}`,
        lines: [`Client: ${clientName(appt.contact)}`],
        endpoint: `/api/app/appointments/${appt.id}`,
        method: "PATCH",
        payload: sched.fields,
      });
    },
  },
  {
    decl: {
      name: "cancel_appointment",
      description:
        "Stage cancelling an appointment (by the id from get_schedule or get_client_activity). Confirmation card required.",
      parameters: {
        type: "object",
        properties: { appointmentId: { type: "string" } },
        required: ["appointmentId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: str(args.appointmentId, 40), companyId: actor.companyId,
          ...appointmentScope(actor), status: "SCHEDULED",
        },
        select: {
          id: true, title: true, scheduledAt: true, scheduledAnytime: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!appt) return { error: "No scheduled appointment with that id (or not visible to this user)." };
      const tz = await companyTz(actor.companyId);
      return stage(ctx, {
        kind: "cancel_appointment",
        title: `Cancel "${appt.title}" — ${fmtWhen(tz, appt.scheduledAt, appt.scheduledAnytime)}`,
        lines: [`Client: ${clientName(appt.contact)}`],
        endpoint: `/api/app/appointments/${appt.id}`,
        method: "PATCH",
        payload: { status: "CANCELLED" },
      });
    },
  },
  {
    decl: {
      name: "create_invoice",
      description:
        "Stage a draft invoice for a client (not tied to a job). The user reviews and sends it from /app/invoices. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          subject: { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD (optional)" },
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
    allowed: (a) => canSeeMoney(a) && canSell(a.role),
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
      const dueDate = day(args.dueDate) ? str(args.dueDate, 10) : undefined;
      return stage(ctx, {
        kind: "create_invoice",
        title: `Draft invoice for ${clientName(contact)} — ${money(total)}`,
        lines: [
          ...lineItems.map((li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`),
          dueDate ? `Due: ${dueDate}` : null,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/invoices",
        method: "POST",
        payload: {
          contactId: contact.id,
          subject: str(args.subject, 120) || undefined,
          lineItems,
          ...(dueDate ? { dueDate } : {}),
        },
      });
    },
  },
  {
    decl: {
      name: "set_client_status",
      description:
        "Stage changing a client's status: LEAD, ACTIVE, or ARCHIVED. Archiving hides a client without destroying anything — ALWAYS suggest this instead of deletion for clients with real history. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          status: { type: "string", enum: ["LEAD", "ACTIVE", "ARCHIVED"] },
        },
        required: ["clientId", "status"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const status = str(args.status, 12);
      if (!["LEAD", "ACTIVE", "ARCHIVED"].includes(status)) {
        return { error: "status must be LEAD, ACTIVE, or ARCHIVED" };
      }
      const verbs: Record<string, string> = { ARCHIVED: "Archive", ACTIVE: "Mark active", LEAD: "Mark as lead" };
      return stage(ctx, {
        kind: "set_client_status",
        title: `${verbs[status]}: ${clientName(contact)}`,
        lines: status === "ARCHIVED" ? ["Hidden from pickers and lists — reversible anytime."] : [],
        endpoint: `/api/app/contacts/${contact.id}`,
        method: "PATCH",
        payload: { status },
      });
    },
  },
  {
    decl: {
      name: "delete_client",
      description:
        "Stage PERMANENTLY deleting a client (managers only). If they have any quotes/jobs/invoices/payments, this destroys ALL of it — suggest set_client_status ARCHIVED for real clients first; deletion is for spam and test records. The card makes the user type the client's name to confirm when history would be destroyed.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const contact = await prisma.contact.findFirst({
        where: { id: str(args.clientId, 40), companyId: actor.companyId },
        select: {
          id: true, firstName: true, lastName: true, companyName: true,
          _count: {
            select: {
              quotes: true, jobs: true, invoices: true, payments: true,
              appointments: true, subscriptions: true, contracts: true, requests: true,
            },
          },
        },
      });
      if (!contact) return { error: "No client with that id." };
      const c = contact._count;
      const hasWork =
        c.quotes + c.jobs + c.invoices + c.payments + c.appointments + c.subscriptions + c.contracts > 0;
      const name = `${contact.firstName} ${contact.lastName}`.trim();
      const destroyed = [
        c.quotes && `${c.quotes} quote(s)`,
        c.jobs && `${c.jobs} job(s)`,
        c.invoices && `${c.invoices} invoice(s)`,
        c.payments && `${c.payments} payment record(s)`,
        c.appointments && `${c.appointments} appointment(s)`,
        c.subscriptions && `${c.subscriptions} subscription(s)`,
        c.contracts && `${c.contracts} agreement(s)`,
        c.requests && `${c.requests} request(s)`,
      ].filter(Boolean) as string[];
      return stage(ctx, {
        kind: "delete_client",
        title: `Permanently delete ${clientName(contact)}`,
        lines: hasWork
          ? [`This DESTROYS: ${destroyed.join(", ")}.`, "This cannot be undone."]
          : ["No work history — just the contact record is removed.", "This cannot be undone."],
        endpoint: `/api/app/contacts/${contact.id}${hasWork ? "?force=1" : ""}`,
        method: "DELETE",
        payload: {},
        danger: true,
        ...(hasWork ? { confirmText: name } : {}),
      });
    },
  },
  {
    decl: {
      name: "send_portal_invite",
      description:
        "Stage emailing a client their private portal link (magic sign-in to see their quotes, invoices, visits). Client must have an email on file. Confirmation card required — this SENDS a real email once confirmed.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await prisma.contact.findFirst({
        where: { id: str(args.clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
        select: { id: true, firstName: true, lastName: true, companyName: true, email: true },
      });
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      if (!contact.email) return { error: "This client has no email on file — add one first (update_client)." };
      return stage(ctx, {
        kind: "send_portal_invite",
        title: `Email portal link to ${clientName(contact)}`,
        lines: [`Sends to: ${contact.email}`],
        endpoint: `/api/app/contacts/${contact.id}/portal-invite`,
        method: "POST",
        payload: {},
      });
    },
  },
  {
    decl: {
      name: "log_expense",
      description:
        "Stage recording a business expense (managers): description, amount, optional category and date. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string", description: "e.g. Fuel, Materials, Equipment" },
          date: { type: "string", description: "YYYY-MM-DD (optional, defaults today)" },
        },
        required: ["description", "amount"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const description = str(args.description, 200);
      const amount = num(args.amount);
      if (!description) return { error: "description is required" };
      if (!amount || amount <= 0 || amount > 1_000_000) return { error: "amount must be a positive number" };
      const tz = await companyTz(actor.companyId);
      const dateStr = day(args.date)
        ? str(args.date, 10)
        : new Date().toLocaleDateString("en-CA", { timeZone: tz });
      const category = str(args.category, 60);
      return stage(ctx, {
        kind: "log_expense",
        title: `Log expense: ${description} — ${money(amount)}`,
        lines: [category && `Category: ${category}`, `Date: ${dateStr}`].filter(Boolean) as string[],
        endpoint: "/api/app/expenses",
        method: "POST",
        payload: { description, amount, category: category || undefined, incurredAt: dateStr },
      });
    },
  },
  {
    decl: {
      name: "update_service_price",
      description:
        "Stage updating a price-book service/product (managers): new price, cost, and/or time-on-site duration. Identify the item by (partial) name.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          price: { type: "number" },
          cost: { type: "number" },
          durationMinutes: { type: "number" },
        },
        required: ["serviceName"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const q = str(args.serviceName, 100);
      if (!q) return { error: "serviceName is required" };
      const matches = await prisma.workItem.findMany({
        where: { companyId: actor.companyId, isActive: true, name: { contains: q, mode: "insensitive" } },
        take: 5,
        select: { id: true, name: true, unitPrice: true, durationMinutes: true },
      });
      if (matches.length === 0) return { error: `No price-book item matching "${q}" — check get_price_book.` };
      if (matches.length > 1) {
        return {
          error: "Multiple items match — ask the user which one, then call again with the exact name.",
          matches: matches.map((m) => m.name),
        };
      }
      const item = matches[0];
      const price = num(args.price);
      const cost = num(args.cost);
      const dur = num(args.durationMinutes);
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      if (price !== null && price >= 0 && price <= 100000) {
        payload.unitPrice = price;
        lines.push(`Price: ${money(item.unitPrice)} → ${money(price)}`);
      }
      if (cost !== null && cost >= 0 && cost <= 100000) {
        payload.unitCost = cost;
        lines.push(`Cost: ${money(cost)}`);
      }
      if (dur !== null) {
        payload.durationMinutes = dur;
        lines.push(`Time on site: ${dur} min`);
      }
      if (lines.length === 0) return { error: "Provide at least one of price, cost, durationMinutes." };
      return stage(ctx, {
        kind: "update_service_price",
        title: `Update ${item.name}`,
        lines,
        endpoint: `/api/app/work-items/${item.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "convert_quote",
      description:
        "Stage converting an APPROVED quote (by quote number) into a job. Only approved quotes convert. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { quoteNumber: { type: "number" } },
        required: ["quoteNumber"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.quoteNumber);
      const quote = await prisma.quote.findFirst({
        where: { companyId: actor.companyId, quoteNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!quote) return { error: `No quote #${n} (or not visible to this user).` };
      if (quote.status !== "APPROVED") {
        return { error: `Quote #${n} is ${quote.status} — only APPROVED quotes convert to jobs.` };
      }
      return stage(ctx, {
        kind: "convert_quote",
        title: `Convert quote #${n} to a job — ${money(quote.total)}`,
        lines: [`Client: ${clientName(quote.contact)}`, quote.title && `"${quote.title}"`].filter(
          Boolean
        ) as string[],
        endpoint: `/api/app/quotes/${quote.id}/convert`,
        method: "POST",
        payload: {},
      });
    },
  },
  {
    decl: {
      name: "list_clients",
      description:
        "The client roster (up to 60, most recently updated first) with id, name, phone, email, status. Use this for bulk work ('update every client's ...') or any question about clients in general. For finding one specific person, prefer search_clients.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["LEAD", "ACTIVE", "ARCHIVED"] } },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const valid = ["LEAD", "ACTIVE", "ARCHIVED"];
      const status = valid.includes(str(args.status, 12)) ? (str(args.status, 12) as never) : undefined;
      const where = { companyId: actor.companyId, ...contactScope(actor), status };
      const [rows, total] = await Promise.all([
        prisma.contact.findMany({
          where, take: 60, orderBy: { updatedAt: "desc" },
          select: {
            id: true, firstName: true, lastName: true, companyName: true,
            email: true, phone: true, status: true,
          },
        }),
        prisma.contact.count({ where }),
      ]);
      return {
        total,
        showing: rows.length,
        ...(total > rows.length
          ? { note: "More clients exist than shown — tell the user you handled the first 60 and to ask again to continue." }
          : {}),
        clients: rows.map((c) => ({
          id: c.id, name: clientName(c), phone: c.phone, email: c.email, status: c.status,
        })),
      };
    },
  },
  {
    decl: {
      name: "list_expenses",
      description:
        "Business expenses (managers) with the id needed for update_expense/delete_expense: description, category, amount, date. Optional from/to YYYY-MM-DD; default is the last 90 days.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args) => {
      const from = day(args.from) ?? new Date(Date.now() - 90 * 86400000);
      const to = day(args.to);
      const end = to ? new Date(to.getTime() + 86400000) : new Date(Date.now() + 86400000);
      const rows = await prisma.expense.findMany({
        where: { companyId: actor.companyId, incurredAt: { gte: from, lt: end } },
        take: 20, orderBy: { incurredAt: "desc" },
        select: { id: true, description: true, category: true, amount: true, incurredAt: true },
      });
      return {
        expenses: rows.map((e) => ({
          id: e.id, description: e.description, category: e.category,
          amount: money(e.amount), on: e.incurredAt.toISOString().slice(0, 10),
        })),
      };
    },
  },
  {
    decl: {
      name: "update_expense",
      description:
        "Stage correcting an expense (managers): description, amount, category, or date. Get the id from list_expenses. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          expenseId: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["expenseId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const expense = await prisma.expense.findFirst({
        where: { id: str(args.expenseId, 40), companyId: actor.companyId },
        select: { id: true, description: true, amount: true },
      });
      if (!expense) return { error: "No expense with that id — check list_expenses." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const description = str(args.description, 300);
      if (description) {
        payload.description = description;
        lines.push(`Description: ${description}`);
      }
      const amount = num(args.amount);
      if (amount !== null && amount > 0 && amount <= 1_000_000) {
        payload.amount = amount;
        lines.push(`Amount: ${money(expense.amount)} → ${money(amount)}`);
      }
      const category = str(args.category, 100);
      if (category) {
        payload.category = category;
        lines.push(`Category: ${category}`);
      }
      if (day(args.date)) {
        payload.incurredAt = str(args.date, 10);
        lines.push(`Date: ${str(args.date, 10)}`);
      }
      if (lines.length === 0) return { error: "Provide at least one of description, amount, category, date." };
      return stage(ctx, {
        kind: "update_expense",
        title: `Correct expense: ${expense.description}`,
        lines,
        endpoint: `/api/app/expenses/${expense.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "delete_expense",
      description:
        "Stage deleting an expense record (managers). Get the id from list_expenses. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { expenseId: { type: "string" } },
        required: ["expenseId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const expense = await prisma.expense.findFirst({
        where: { id: str(args.expenseId, 40), companyId: actor.companyId },
        select: { id: true, description: true, amount: true, incurredAt: true },
      });
      if (!expense) return { error: "No expense with that id — check list_expenses." };
      return stage(ctx, {
        kind: "delete_expense",
        title: `Delete expense: ${expense.description} — ${money(expense.amount)}`,
        lines: [`Recorded: ${expense.incurredAt.toISOString().slice(0, 10)}`, "This cannot be undone."],
        endpoint: `/api/app/expenses/${expense.id}`,
        method: "DELETE",
        payload: {},
        danger: true,
      });
    },
  },
  {
    decl: {
      name: "update_quote_status",
      description:
        "Stage a quote status change (by quote number). AWAITING_RESPONSE = mark sent (starts the sent clock and auto-issues any agreements attached 'with quote' — remind the user to share the quote's link from its page, no email goes out). APPROVED = client said yes. CHANGES_REQUESTED = client wants changes. ARCHIVED = close it. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          quoteNumber: { type: "number" },
          status: {
            type: "string",
            enum: ["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "ARCHIVED"],
          },
        },
        required: ["quoteNumber", "status"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.quoteNumber);
      const status = str(args.status, 24);
      if (!["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "ARCHIVED"].includes(status)) {
        return { error: "Invalid status." };
      }
      const quote = await prisma.quote.findFirst({
        where: { companyId: actor.companyId, quoteNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!quote) return { error: `No quote #${n} (or not visible to this user).` };
      // mirror the route's transition guards so the card can't fail on confirm
      if (quote.status === "CONVERTED") {
        return { error: `Quote #${n} was converted to a job — its status is locked.` };
      }
      if (quote.status === "APPROVED" && status !== "ARCHIVED") {
        return { error: `Quote #${n} is client-approved — it can only be archived (or converted to a job).` };
      }
      const labels: Record<string, string> = {
        DRAFT: "Move back to draft",
        AWAITING_RESPONSE: "Mark as sent",
        APPROVED: "Mark approved",
        CHANGES_REQUESTED: "Mark changes requested",
        ARCHIVED: "Archive",
      };
      return stage(ctx, {
        kind: "update_quote_status",
        title: `${labels[status]}: quote #${n} — ${money(quote.total)}`,
        lines: [`Client: ${clientName(quote.contact)}`, `Currently: ${quote.status}`],
        endpoint: `/api/app/quotes/${quote.id}`,
        method: "PATCH",
        payload: { status },
      });
    },
  },
  {
    decl: {
      name: "update_invoice_status",
      description:
        "Stage an invoice status change (by invoice number). AWAITING_PAYMENT = issue/mark sent (remind the user to share the invoice from its page — no email goes out). PAST_DUE = flag overdue. DRAFT = back to draft. To mark PAID, prefer record_payment so the money is on the books. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: { type: "number" },
          status: { type: "string", enum: ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID"] },
        },
        required: ["invoiceNumber", "status"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args, ctx) => {
      const n = num(args.invoiceNumber);
      const status = str(args.status, 24);
      if (!["DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID"].includes(status)) {
        return { error: "Invalid status." };
      }
      const invoice = await prisma.invoice.findFirst({
        where: { companyId: actor.companyId, invoiceNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!invoice) return { error: `No invoice #${n} (or not visible to this user).` };
      const labels: Record<string, string> = {
        DRAFT: "Move back to draft",
        AWAITING_PAYMENT: "Mark as sent (awaiting payment)",
        PAST_DUE: "Flag past due",
        PAID: "Mark paid (no payment record)",
      };
      return stage(ctx, {
        kind: "update_invoice_status",
        title: `${labels[status]}: invoice #${n} — ${money(invoice.total)}`,
        lines: [
          invoice.contact ? `Client: ${clientName(invoice.contact)}` : null,
          `Currently: ${invoice.status}`,
        ].filter(Boolean) as string[],
        endpoint: `/api/app/invoices/${invoice.id}/status`,
        method: "PATCH",
        payload: { status },
      });
    },
  },
  {
    decl: {
      name: "edit_payment",
      description:
        "Stage correcting a recorded payment — amount (e.g. a partial refund), method, or date. Get the payment id from list_money (kind: payments). Owners/admins only. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          paymentId: { type: "string" },
          amount: { type: "number", description: "corrected amount" },
          method: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["paymentId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payment = await prisma.payment.findFirst({
        where: { id: str(args.paymentId, 40), companyId: actor.companyId },
        select: {
          id: true, amount: true, method: true,
          invoice: { select: { invoiceNumber: true } },
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!payment) return { error: "No payment with that id — check list_money (kind: payments)." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const amount = num(args.amount);
      if (amount !== null && amount > 0 && amount <= 1_000_000) {
        payload.amount = amount;
        lines.push(`Amount: ${money(payment.amount)} → ${money(amount)}`);
      }
      const method = str(args.method, 12).toUpperCase();
      if (["CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER"].includes(method)) {
        payload.method = method;
        lines.push(`Method: ${payment.method} → ${method}`);
      }
      if (day(args.date)) {
        payload.paidAt = str(args.date, 10);
        lines.push(`Date: ${str(args.date, 10)}`);
      }
      if (lines.length === 0) return { error: "Provide at least one of amount, method, date." };
      return stage(ctx, {
        kind: "edit_payment",
        title: `Correct payment on invoice #${payment.invoice.invoiceNumber}`,
        lines: [
          payment.contact ? `Client: ${clientName(payment.contact)}` : null,
          ...lines,
          "The invoice's paid/unpaid status recalculates automatically.",
        ].filter(Boolean) as string[],
        endpoint: `/api/app/payments/${payment.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "delete_payment",
      description:
        "Stage removing a payment record entirely — use when a client was refunded in full (the money went back outside the app) or a payment was logged by mistake. Get the payment id from list_money (kind: payments). Owners/admins only. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { paymentId: { type: "string" } },
        required: ["paymentId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payment = await prisma.payment.findFirst({
        where: { id: str(args.paymentId, 40), companyId: actor.companyId },
        select: {
          id: true, amount: true, method: true, paidAt: true,
          invoice: { select: { invoiceNumber: true } },
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!payment) return { error: "No payment with that id — check list_money (kind: payments)." };
      return stage(ctx, {
        kind: "delete_payment",
        title: `Remove ${money(payment.amount)} ${payment.method.replace("_", " ")} payment from invoice #${payment.invoice.invoiceNumber}`,
        lines: [
          payment.contact ? `Client: ${clientName(payment.contact)}` : null,
          `Recorded: ${payment.paidAt.toISOString().slice(0, 10)}`,
          "The invoice goes back to unpaid/awaiting for this amount. This changes revenue history.",
        ].filter(Boolean) as string[],
        endpoint: `/api/app/payments/${payment.id}`,
        method: "DELETE",
        payload: {},
        danger: true,
      });
    },
  },
  {
    decl: {
      name: "list_team",
      description:
        "Team members with their id, role, active status, and whether they're bookable for online scheduling. Use before staging any team change.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor) => {
      const rows = await prisma.user.findMany({
        where: { companyId: actor.companyId },
        take: 50,
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true, email: true, role: true, isActive: true, bookable: true },
      });
      return {
        team: rows.map((u) => ({
          id: u.id, name: u.name, email: u.email,
          role: u.role, roleLabel: roleLabel[u.role] ?? u.role,
          active: u.isActive, bookableOnline: u.bookable,
        })),
      };
    },
  },
  {
    decl: {
      name: "add_team_member",
      description:
        "Stage adding a team member. Roles: OWNER, ADMIN, USER ('Sales + Tech'), SALES, TECH. Admins can only add USER/SALES/TECH. A starting password is generated and shown on the card for the user to pass along. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "USER", "SALES", "TECH"] },
          phone: { type: "string" },
        },
        required: ["name", "email", "role"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const name = str(args.name, 100);
      const email = str(args.email, 254).toLowerCase();
      const role = str(args.role, 12) as Role;
      if (!name) return { error: "name is required" };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "A valid email is required." };
      if (!["OWNER", "ADMIN", "USER", "SALES", "TECH"].includes(role)) return { error: "Invalid role." };
      if (!canManageRole(actor.role, role)) {
        return { error: "Admins can only add Sales + Tech, Sales, or Tech members — an owner must add owners/admins." };
      }
      const password = `Hub-${randomBytes(4).toString("hex")}`;
      return stage(ctx, {
        kind: "add_team_member",
        title: `Add team member ${name} (${roleLabel[role]})`,
        lines: [
          `Email: ${email}`,
          str(args.phone, 30) && `Phone: ${str(args.phone, 30)}`,
          `Starting password: ${password} — share it with them; they can change it after signing in.`,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/team",
        method: "POST",
        payload: { name, email, role, password, phone: str(args.phone, 30) || undefined },
      });
    },
  },
  {
    decl: {
      name: "update_team_member",
      description:
        "Stage changing a team member (by id from list_team): role, deactivate/reactivate (active), bookable for online scheduling, name, or phone. Owners manage everyone; admins only USER/SALES/TECH. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "USER", "SALES", "TECH"] },
          active: { type: "boolean" },
          bookable: { type: "boolean" },
          name: { type: "string" },
          phone: { type: "string" },
        },
        required: ["memberId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const target = await prisma.user.findFirst({
        where: { id: str(args.memberId, 40), companyId: actor.companyId },
        select: { id: true, name: true, role: true, isActive: true, bookable: true },
      });
      if (!target) return { error: "No team member with that id — check list_team." };
      if (!canManageRole(actor.role, target.role as Role) && target.id !== actor.id) {
        return { error: "Admins can't change owners or other admins — an owner must do that." };
      }
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const role = str(args.role, 12);
      if (role && role !== target.role) {
        if (!["OWNER", "ADMIN", "USER", "SALES", "TECH"].includes(role)) return { error: "Invalid role." };
        if (!canManageRole(actor.role, role as Role)) {
          return { error: "Admins can only assign Sales + Tech, Sales, or Tech roles." };
        }
        payload.role = role;
        lines.push(`Role: ${roleLabel[target.role]} → ${roleLabel[role]}`);
      }
      if (typeof args.active === "boolean" && args.active !== target.isActive) {
        if (target.id === actor.id && !args.active) return { error: "You can't deactivate your own account." };
        payload.isActive = args.active;
        lines.push(args.active ? "Reactivate their sign-in" : "Deactivate — they can no longer sign in (reversible)");
      }
      if (typeof args.bookable === "boolean" && args.bookable !== target.bookable) {
        payload.bookable = args.bookable;
        lines.push(args.bookable ? "Bookable for online scheduling" : "Removed from online scheduling");
      }
      if (str(args.name, 100) && str(args.name, 100) !== target.name) {
        payload.name = str(args.name, 100);
        lines.push(`Name: ${target.name} → ${payload.name}`);
      }
      if (str(args.phone, 30)) {
        payload.phone = str(args.phone, 30);
        lines.push(`Phone: ${payload.phone}`);
      }
      if (lines.length === 0) return { error: "Nothing to change — provide role, active, bookable, name, or phone." };
      return stage(ctx, {
        kind: "update_team_member",
        title: `Update team member ${target.name}`,
        lines,
        endpoint: `/api/app/team/${target.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "update_team_policy",
      description:
        "Stage company team policies: whether Sales members can see invoices & payments (salesSeePayments), and who receives new website/booking leads (defaultLeadMemberId from list_team, or 'owner' to reset to the company owner). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          salesSeePayments: { type: "boolean" },
          defaultLeadMemberId: { type: "string" },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      if (typeof args.salesSeePayments === "boolean") {
        payload.salesSeePayments = args.salesSeePayments;
        lines.push(
          args.salesSeePayments
            ? "Sales members CAN see invoices & payments for their leads"
            : "Sales members can NO LONGER see invoices or payments"
        );
      }
      const leadId = str(args.defaultLeadMemberId, 40);
      if (leadId) {
        if (leadId === "owner") {
          payload.defaultLeadUserId = null;
          lines.push("New website leads go to: the company owner (default)");
        } else {
          const user = await prisma.user.findFirst({
            where: { id: leadId, companyId: actor.companyId, isActive: true },
            select: { id: true, name: true },
          });
          if (!user) return { error: "No active team member with that id — check list_team." };
          payload.defaultLeadUserId = user.id;
          lines.push(`New website leads go to: ${user.name}`);
        }
      }
      if (lines.length === 0) return { error: "Provide salesSeePayments and/or defaultLeadMemberId." };
      return stage(ctx, {
        kind: "update_team_policy",
        title: "Update team policies",
        lines,
        endpoint: "/api/app/team/settings",
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "update_company_settings",
      description:
        "Stage changes to company settings: business name, phone, email, address/city/state/zip, website, review link, timezone (IANA, e.g. America/Chicago), arrival window minutes, the assistant's display name (assistantName), and the online-booking service area (addServiceZips / removeServiceZips — 5-digit ZIPs). Only include what should change. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          zip: { type: "string" },
          website: { type: "string" },
          reviewLink: { type: "string" },
          timezone: { type: "string" },
          arrivalWindowMinutes: { type: "number" },
          assistantName: { type: "string" },
          addServiceZips: { type: "array", items: { type: "string" } },
          removeServiceZips: { type: "array", items: { type: "string" } },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const simple: [key: string, arg: unknown, label: string, max: number][] = [
        ["name", args.companyName, "Business name", 100],
        ["phone", args.phone, "Phone", 30],
        ["email", args.email, "Email", 200],
        ["address", args.address, "Address", 200],
        ["city", args.city, "City", 100],
        ["state", args.state, "State", 40],
        ["zip", args.zip, "ZIP", 10],
        ["website", args.website, "Website", 200],
        ["reviewLink", args.reviewLink, "Review link", 300],
        ["assistantName", args.assistantName, "Assistant name", 40],
      ];
      for (const [key, arg, label, max] of simple) {
        const v = str(arg, max);
        if (v) {
          payload[key] = v;
          lines.push(`${label}: ${v}`);
        }
      }
      const tz = str(args.timezone, 60);
      if (tz) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          payload.timezone = tz;
          lines.push(`Timezone: ${tz}`);
        } catch {
          return { error: `"${tz}" isn't a valid timezone — use an IANA name like America/Chicago.` };
        }
      }
      const win = num(args.arrivalWindowMinutes);
      if (win !== null) {
        if (win < 30 || win > 480) return { error: "arrivalWindowMinutes must be 30–480." };
        payload.arrivalWindowMinutes = win;
        lines.push(`Arrival window: ${win} minutes`);
      }
      const addZips = (Array.isArray(args.addServiceZips) ? args.addServiceZips : [])
        .map((z) => str(z, 5)).filter((z) => /^\d{5}$/.test(z));
      const removeZips = (Array.isArray(args.removeServiceZips) ? args.removeServiceZips : [])
        .map((z) => str(z, 5)).filter((z) => /^\d{5}$/.test(z));
      if (addZips.length > 0 || removeZips.length > 0) {
        const company = await prisma.company.findUnique({
          where: { id: actor.companyId },
          select: { serviceZips: true },
        });
        const zips = new Set(company?.serviceZips ?? []);
        addZips.forEach((z) => zips.add(z));
        removeZips.forEach((z) => zips.delete(z));
        payload.serviceZips = [...zips];
        if (addZips.length) lines.push(`Add ZIPs: ${addZips.join(", ")}`);
        if (removeZips.length) lines.push(`Remove ZIPs: ${removeZips.join(", ")}`);
        lines.push(`Service area after change: ${zips.size} ZIP(s)`);
      }
      if (lines.length === 0) return { error: "Nothing to change — provide at least one setting." };
      return stage(ctx, {
        kind: "update_company_settings",
        title: "Update company settings",
        lines,
        endpoint: "/api/app/settings",
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "set_business_hours",
      description:
        "Stage new business hours for one or more days (used by online booking). days: e.g. ['sat'] or ['mon','tue','wed','thu','fri']. Give open+close (24h HH:MM, company-local) or closed: true. Other days keep their current hours. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: { type: "string", enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] },
          },
          open: { type: "string", description: "HH:MM 24h" },
          close: { type: "string", description: "HH:MM 24h" },
          closed: { type: "boolean", description: "true = closed that day" },
        },
        required: ["days"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const days = (Array.isArray(args.days) ? args.days : [])
        .map((d) => str(d, 3).toLowerCase())
        .filter((d): d is DayKey => (DAY_KEYS as readonly string[]).includes(d));
      if (days.length === 0) return { error: "days must contain at least one of sun..sat." };
      const closed = args.closed === true;
      const open = str(args.open, 5);
      const close = str(args.close, 5);
      if (!closed) {
        const s = timeToMinutes(open);
        const e = timeToMinutes(close);
        if (s === null || e === null || s >= e) {
          return { error: "Provide open and close as HH:MM with open before close, or closed: true." };
        }
      }
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { businessHours: true },
      });
      const hours = sanitizeBusinessHours(company?.businessHours ?? null);
      for (const d of days) hours[d] = closed ? [] : [{ start: open, end: close }];
      return stage(ctx, {
        kind: "set_business_hours",
        title: closed
          ? `Close on ${days.map((d) => DAY_LABELS[d]).join(", ")}`
          : `Set hours ${open}–${close} on ${days.map((d) => DAY_LABELS[d]).join(", ")}`,
        lines: DAY_KEYS.map((d) =>
          `${DAY_LABELS[d]}: ${hours[d].length === 0 ? "closed" : hours[d].map((r) => `${r.start}–${r.end}`).join(", ")}`
        ),
        endpoint: "/api/app/settings",
        method: "PATCH",
        payload: { businessHours: hours },
      });
    },
  },
  {
    decl: {
      name: "assign_client",
      description:
        "Stage assigning a client to a team member (their lead owner — Sales/Tech roles only see clients assigned to them). Get the member's id from list_team first. Pass an empty memberId to unassign. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          memberId: { type: "string", description: "User id from list_team; empty string unassigns" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const memberId = str(args.memberId, 40);
      if (!memberId) {
        return stage(ctx, {
          kind: "assign_client",
          title: `Unassign ${clientName(contact)}`,
          lines: ["Removes the assigned team member — managers still see the client."],
          endpoint: `/api/app/contacts/${contact.id}`,
          method: "PATCH",
          payload: { assignedToId: null },
        });
      }
      const member = await prisma.user.findFirst({
        where: { id: memberId, companyId: actor.companyId, isActive: true },
        select: { id: true, name: true, role: true },
      });
      if (!member) return { error: "No active team member with that id — check list_team." };
      return stage(ctx, {
        kind: "assign_client",
        title: `Assign ${clientName(contact)} to ${member.name}`,
        lines: [`${member.name} (${roleLabel[member.role] ?? member.role}) becomes this client's lead.`],
        endpoint: `/api/app/contacts/${contact.id}`,
        method: "PATCH",
        payload: { assignedToId: member.id },
      });
    },
  },
  {
    decl: {
      name: "list_agreement_templates",
      description:
        "The company's reusable agreement/contract templates (id, name, size). These are the templates send_agreement can send; create_agreement_template adds new ones.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor) => {
      const rows = await prisma.contractTemplate.findMany({
        where: { companyId: actor.companyId, isActive: true },
        take: 25,
        orderBy: { name: "asc" },
        select: { id: true, name: true, body: true },
      });
      return {
        templates: rows.map((t) => ({
          id: t.id,
          name: t.name,
          preview: t.body.replace(/\s+/g, " ").slice(0, 120),
          characters: t.body.length,
        })),
      };
    },
  },
  {
    decl: {
      name: "create_agreement_template",
      description:
        "Stage saving a reusable agreement/contract template. YOU write the full agreement text: complete, professional, plain text with numbered sections (services, payment, ownership/IP if relevant, term & cancellation, liability). Use the placeholders {{client_name}}, {{company_name}} and {{date}} — they fill in automatically when the agreement is sent. Don't ask permission to draft — write a solid draft; the user reviews it on the card and can edit later at /app/settings/contracts. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name, e.g. 'Custom Web Design Agreement'" },
          body: { type: "string", description: "The complete agreement text" },
        },
        required: ["name", "body"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (_actor, args, ctx) => {
      const name = str(args.name, 100);
      const body = str(args.body, 50000);
      if (!name || body.length < 100) {
        return { error: "name and a complete agreement body (write the full text) are required" };
      }
      const preview = body
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((l) => l.slice(0, 110));
      return stage(ctx, {
        kind: "create_agreement_template",
        title: `Create agreement template "${name}"`,
        lines: [...preview, `…${body.length.toLocaleString()} characters — editable at /app/settings/contracts`],
        endpoint: "/api/app/contract-templates",
        method: "POST",
        payload: { name, body },
      });
    },
  },
  {
    decl: {
      name: "update_agreement_template",
      description:
        "Stage renaming, rewriting, or archiving an agreement template. Get the id from list_agreement_templates. Only include fields that should change; archive:true retires it. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string" },
          name: { type: "string" },
          body: { type: "string", description: "Full replacement text (not a diff)" },
          archive: { type: "boolean" },
        },
        required: ["templateId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const template = await prisma.contractTemplate.findFirst({
        where: { id: str(args.templateId, 40), companyId: actor.companyId },
        select: { id: true, name: true },
      });
      if (!template) return { error: "No template with that id — check list_agreement_templates." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const name = str(args.name, 100);
      if (name && name !== template.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      const body = str(args.body, 50000);
      if (body) {
        payload.body = body;
        lines.push(`New text: ${body.replace(/\s+/g, " ").slice(0, 90)}… (${body.length.toLocaleString()} characters)`);
      }
      if (args.archive === true) {
        payload.isActive = false;
        lines.push("Archive — it disappears from the template list");
      }
      if (lines.length === 0) return { error: "Nothing to change — provide name, body, or archive." };
      return stage(ctx, {
        kind: "update_agreement_template",
        title: `Update template "${template.name}"`,
        lines,
        endpoint: `/api/app/contract-templates/${template.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "send_agreement",
      description:
        "Stage sending an agreement to a client for e-signature. UNLIKE quote/invoice sending, confirming this card really EMAILS the client a signing link (if they have an email on file). Use a saved template (id from list_agreement_templates) or provide a custom title + body. Optional quoteId ties the signature to that quote's convert-to-job gate. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          templateId: { type: "string", description: "Saved template to send" },
          title: { type: "string", description: "Custom agreement title (when not using a template)" },
          body: { type: "string", description: "Custom agreement text (when not using a template)" },
          quoteId: { type: "string" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await prisma.contact.findFirst({
        where: { id: str(args.clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
        select: { id: true, firstName: true, lastName: true, companyName: true, email: true },
      });
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const templateId = str(args.templateId, 40);
      const title = str(args.title, 120);
      const body = str(args.body, 50000);
      let displayTitle = title;
      if (templateId) {
        const template = await prisma.contractTemplate.findFirst({
          where: { id: templateId, companyId: actor.companyId, isActive: true },
          select: { name: true },
        });
        if (!template) return { error: "No active template with that id — check list_agreement_templates." };
        displayTitle = title || template.name;
      } else if (!title || body.length < 100) {
        return { error: "Provide a templateId, or a title plus the full agreement body." };
      }
      return stage(ctx, {
        kind: "send_agreement",
        title: `Send "${displayTitle}" to ${clientName(contact)}`,
        lines: [
          contact.email
            ? `Emails a signing link to ${contact.email} immediately on confirm.`
            : "No email on file — the signing link will be on the agreement page to share manually.",
        ],
        endpoint: "/api/app/contracts",
        method: "POST",
        payload: {
          contactId: contact.id,
          ...(templateId ? { templateId } : {}),
          ...(title ? { title } : {}),
          ...(body ? { body } : {}),
          ...(str(args.quoteId, 40) ? { quoteId: str(args.quoteId, 40) } : {}),
        },
      });
    },
  },
  {
    decl: {
      name: "create_service",
      description:
        "Stage adding a new service or product to the price book. Check get_price_book first to avoid duplicates. priceDisplay: FIXED, STARTING_AT, HOURLY, or QUOTE. durationMinutes makes it schedulable/bookable. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["SERVICE", "PRODUCT"] },
          price: { type: "number" },
          cost: { type: "number", description: "Internal cost (optional)" },
          durationMinutes: { type: "number" },
          priceDisplay: { type: "string", enum: ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"] },
        },
        required: ["name", "price"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (_actor, args, ctx) => {
      const name = str(args.name, 100);
      const price = num(args.price);
      if (!name || price === null || price < 0 || price > 100000) {
        return { error: "name and a price between 0 and 100000 are required" };
      }
      const cost = num(args.cost);
      const duration = num(args.durationMinutes);
      const priceDisplay = ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"].includes(str(args.priceDisplay, 20))
        ? str(args.priceDisplay, 20)
        : "FIXED";
      const type = str(args.type, 10) === "PRODUCT" ? "PRODUCT" : "SERVICE";
      return stage(ctx, {
        kind: "create_service",
        title: `Add ${type === "PRODUCT" ? "product" : "service"} "${name}" — ${money(price)}`,
        lines: [
          str(args.description, 300) && `Description: ${str(args.description, 300)}`,
          `Pricing: ${priceDisplay === "FIXED" ? "fixed price" : priceDisplay === "STARTING_AT" ? "starting at" : priceDisplay.toLowerCase()} ${money(price)}${cost !== null ? ` (cost ${money(cost)})` : ""}`,
          duration ? `Duration: ${duration} min (schedulable)` : "No duration — quote-only for now",
        ].filter(Boolean) as string[],
        endpoint: "/api/app/work-items",
        method: "POST",
        payload: {
          name,
          description: str(args.description, 300) || null,
          type,
          unitPrice: price,
          unitCost: cost,
          durationMinutes: duration && duration >= 5 && duration <= 600 ? duration : null,
          priceDisplay,
        },
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

function systemPrompt(actor: Actor, companyName: string, tz: string, assistantName: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  return `You are ${assistantName}, the built-in AI assistant for ${companyName}'s Streamflaire Hub account — field-service business software (clients, quotes, jobs, invoices, scheduling, agreements, online booking). Your job is to make running this business easier: answer from real data, do the busywork, and surface what matters. If asked, your name is ${assistantName}; owners can rename you in /app/settings (or just ask you to do it — update_company_settings assistantName).

Today is ${weekday}, ${today} (${tz}). The user is ${actor.name}, role: ${roleLabel[actor.role]}.

Data rules:
- For ANY question about their business, call tools — never guess or invent numbers.
- BE PERSISTENT. If a search comes up empty, try variations before giving up: last name only, first name only, part of the company name. Check the recentClients list in empty search results for close spellings. Only say something doesn't exist after genuinely exhausting the options, and then show the closest matches you found.
- Answer the question that was MEANT: "did Sarah sign?" means check her agreements (get_client_activity or list_agreements), "how are we doing" means whats_needing_attention plus business_summary.
- Be proactive: when results show something actionable (past-due invoices, week-old unanswered quotes, unsigned agreements, unscheduled jobs), mention it briefly even if not asked.

Actions:
- You CAN do things, with the user's confirmation: add/update/archive clients, assign clients to team members, add client notes, create requests, draft quotes and invoices, mark quotes sent/approved and invoices sent, convert approved quotes to jobs, create/reschedule/complete/close jobs, schedule/reschedule/cancel appointments, record/correct/remove payments, log/correct/delete expenses, add price-book services/products and update prices/durations, write and save agreement templates, send agreements for e-signature, email a client their portal link, manage the team (add members, change roles, deactivate, bookable), change company settings and business hours, and permanently delete clients. When asked, gather what you need first (search for the client, check the price book before quoting, find the invoice or job number, get the appointment id from get_schedule or get_client_activity, get member ids from list_team), then call the action tool ONCE. It shows the user a confirmation card; tell them to review and press Confirm. Never claim something was done — the card does it only after they confirm.
- Chain lookups yourself — if the user says "cancel Tuesday's appointment with Ben", find it (get_schedule or search + activity) and stage the cancellation; don't ask them for ids.
- BULK WORK is supported and expected. "Reformat every client's phone number", "archive all my leads from last year": fetch the full list (list_clients etc.), compute each change yourself (you are good at reformatting, renaming, recalculating), then stage one update per affected record — call the action tool once per record, several per round is fine. Skip records that already match. Similar changes are automatically combined into ONE confirmation card, so a big batch is still a single Confirm for the user. Before answering, COUNT: if the user asked for N records and you staged fewer, stage the missing ones first (a tool result saying NOT EXECUTED means exactly that — re-issue the call). In your reply, state how many you staged and how many you skipped and why. NEVER refuse doable work or tell the user to do it by hand on a page — that is a last resort for things you truly have no tool for.
- "Sending" a quote or invoice through YOUR tools only marks it sent in the system — no email goes out from the assistant. After they confirm, remind them the quote/invoice page has an "Email to Client" button that actually emails the link (or they can Copy link / use the client portal). EXCEPTION: send_agreement really emails the client a signing link when confirmed — say so.
- Agreements: when asked for a contract/agreement, WRITE it — a complete, professional plain-text agreement with numbered sections tailored to what they described (services, payment, ownership/IP transfer if relevant, term & cancellation, liability), using {{client_name}}, {{company_name}} and {{date}} placeholders. Stage it with create_agreement_template; don't ask for details you can reasonably default, and never just point at the settings page.
- Refunds are bookkeeping here (no card processor yet): the money goes back to the client outside the app, then you correct the books — edit_payment for a partial refund, delete_payment when fully refunded or logged by mistake. Owners/admins only.
- Team rules: owners manage everyone; admins only Sales + Tech, Sales, and Tech members. The system blocks deactivating yourself or removing the last owner.
- Deletion destroys a client AND all their quotes/jobs/invoices/payments permanently. For anyone with real history, recommend archiving (set_client_status ARCHIVED) and only stage deletion if the user insists or it's clearly spam/test data. The card makes them type the client's name as a final check.
- For the few things you can't stage (designing booking forms, uploading a logo), point them to the right page path from the list below.

Style:
- Concise and concrete. Plain text only — no markdown symbols like ** or #. Use "-" for lists.
- Refer to app pages by path (e.g. /app/invoices) — the chat renders paths as clickable links.
- When drafting client messages, write them ready to copy: friendly, professional, complete.
- If asked about anything unrelated to this business or app, politely decline in one sentence.

${APP_CHEATSHEET}`;
}

/**
 * Same-kind, non-destructive proposals staged in one turn collapse into a
 * single batch card — "reformat every phone number" is one Confirm, not 20.
 * Danger/typed-confirm cards never merge: each destructive act is its own
 * decision. Order of first appearance is preserved.
 */
export function mergeBulkProposals(proposals: Proposal[]): Proposal[] {
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) {
    if (p.danger || p.confirmText) continue;
    const g = groups.get(p.kind) ?? [];
    g.push(p);
    groups.set(p.kind, g);
  }
  const out: Proposal[] = [];
  const consumed = new Set<string>();
  for (const p of proposals) {
    if (consumed.has(p.id)) continue;
    const g = groups.get(p.kind);
    if (p.danger || p.confirmText || !g || g.length < 2) {
      out.push(p);
      continue;
    }
    g.forEach((x) => consumed.add(x.id));
    out.push({
      id: `batch-${p.kind}`,
      kind: p.kind,
      title: `${g.length} changes — ${p.kind.replace(/_/g, " ")}`,
      lines: [
        ...g
          .slice(0, 20)
          .map((x) => (x.lines.length ? `${x.title}: ${x.lines.join("; ")}` : x.title).slice(0, 140)),
        ...(g.length > 20 ? [`…and ${g.length - 20} more`] : []),
      ],
      endpoint: g[0].endpoint,
      method: g[0].method,
      payload: g[0].payload,
      batch: g.map((x) => ({ endpoint: x.endpoint, method: x.method, payload: x.payload })),
    });
  }
  return out;
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
    select: { name: true, timezone: true, assistantName: true },
  });
  if (!company) return null;
  const assistantName = company.assistantName || DEFAULT_ASSISTANT_NAME;

  const active = toolsForActor(actor);
  let model = process.env.AI_MODEL_ASSISTANT || ASSISTANT_MODEL_DEFAULT;
  const ctx: ToolCtx = { proposals: [] };

  const contents: AIContent[] = messages.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.slice(0, 4000) }],
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const opts = {
      system: systemPrompt(actor, company.name, company.timezone, assistantName),
      contents,
      tools: active.map((t) => t.decl),
      // Bulk staging emits one functionCall per record — a 20-client batch
      // needs far more than a chat reply's worth of output. A tight cap here
      // truncates the batch mid-emission and records silently drop.
      maxOutputTokens: 8192,
      thinkingBudget: 0, // chat latency beats marginal quality here
      // last round: no tools, force it to answer with what it has
      ...(round === MAX_TOOL_ROUNDS ? { tools: [] } : {}),
    };
    // primary model, then the fallback's separate free-tier quota bucket —
    // and once the primary fails, stay on the fallback for the whole turn
    let parts = await aiChat({ ...opts, model });
    if (!parts && model !== ASSISTANT_MODEL_FALLBACK) {
      model = ASSISTANT_MODEL_FALLBACK;
      parts = await aiChat({ ...opts, model });
    }
    if (!parts) return null;

    const allCalls = parts.filter(
      (p): p is Extract<AIPart, { functionCall: unknown }> => "functionCall" in p
    );
    const calls = allCalls.slice(0, MAX_CALLS_PER_ROUND);
    // over-cap calls stay in history (1:1 with responses) but get an explicit
    // "not executed" answer so the model re-issues them instead of assuming
    // they ran — silent drops here surfaced as bulk updates missing records
    const overflow = allCalls.slice(MAX_CALLS_PER_ROUND);
    if (allCalls.length === 0) {
      const text = parts
        .map((p) => ("text" in p ? p.text : ""))
        .join("")
        .trim();
      if (text) return { reply: text, proposals: mergeBulkProposals(ctx.proposals) };
      // model went silent (rare) — if it staged something, still surface it
      return ctx.proposals.length > 0
        ? {
            reply: "I've set that up — review the card below and confirm.",
            proposals: mergeBulkProposals(ctx.proposals),
          }
        : null;
    }

    // execute this round's calls in parallel, then feed the results back.
    // Every functionCall replayed into history needs a thoughtSignature for
    // 3.x models — critical when a quota fallback switches models mid-turn
    // (the new model rejects the old model's unsigned calls with a 400).
    contents.push({
      role: "model",
      parts: allCalls.map((c) => ({ thoughtSignature: AI_THOUGHT_SIGNATURE_SENTINEL, ...c })),
    });
    const executed: AIPart[] = await Promise.all(
      calls.map(async (call): Promise<AIPart> => {
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
        return { functionResponse: { name: call.functionCall.name, response } };
      })
    );
    const notExecuted: AIPart[] = overflow.map((call) => ({
      functionResponse: {
        name: call.functionCall.name,
        response: {
          error: `NOT EXECUTED — more than ${MAX_CALLS_PER_ROUND} calls in one round. Call this tool again with the same arguments to finish the work.`,
        },
      },
    }));
    contents.push({ role: "user", parts: [...executed, ...notExecuted] });
  }
  return null;
}
