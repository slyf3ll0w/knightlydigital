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
import { aiChat, type AIContent, type AIFunctionDecl, type AIPart } from "./ai";

/**
 * Owner assistant, Stage A: read + draft only
 * (docs/plans/ai-assistant-plan.md).
 *
 * The model answers data questions through this tool registry. Every tool is
 * gated by the same capability checks the pages use and scoped by the same
 * Prisma scopes — the assistant can only ever read what the signed-in user
 * could see by clicking around. There are NO write tools; creating/editing
 * is pointed at the relevant page until Stage B's confirmation cards.
 *
 * Results are deliberately small (top-N, minimal fields) — they land in the
 * model's context, so a chatty tool is a token bill and a distraction.
 */

const MAX_TOOL_ROUNDS = 5;

type Tool = {
  decl: AIFunctionDecl;
  allowed: (actor: Actor) => boolean;
  run: (actor: Actor, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
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

// ── tools ────────────────────────────────────────────────────────────────────

const tools: Tool[] = [
  {
    decl: {
      name: "search_clients",
      description:
        "Search the client list by name, company, email, or phone. Returns up to 8 matches with ids for follow-up lookups.",
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
      const rows = await prisma.contact.findMany({
        where: {
          companyId: actor.companyId,
          ...contactScope(actor),
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        },
        take: 8,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, firstName: true, lastName: true, companyName: true,
          email: true, phone: true, status: true, city: true,
        },
      });
      return {
        clients: rows.map((c) => ({
          id: c.id,
          name: clientName(c),
          status: c.status,
          email: c.email,
          phone: c.phone,
          city: c.city,
        })),
      };
    },
  },
  {
    decl: {
      name: "get_client_activity",
      description:
        "Everything recent for one client (by id from search_clients): contact info plus their latest quotes, jobs, invoices, and upcoming appointments.",
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
          address: true, status: true, leadSource: true, notes: true,
          quotes: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { quoteNumber: true, status: true, total: true, title: true },
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
            select: { title: true, scheduledAt: true, type: true },
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
            }
          : {}),
        upcomingAppointments: c.appointments.map((a) => ({
          title: a.title, type: a.type, at: a.scheduledAt.toISOString(),
        })),
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
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId }, select: { timezone: true },
      });
      const tz = company?.timezone ?? "America/Chicago";
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
        "Recent invoices or payments. Filter invoices by status: DRAFT, AWAITING_PAYMENT, PAID, PAST_DUE.",
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
        "Money and activity totals for a date range (max 1 year): payments collected, amount invoiced, expenses, new clients, jobs completed. Use for 'how did we do' / revenue questions.",
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
      description: "The company's services and products with prices, time-on-site durations, and recurring billing settings.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSeePricing(a.role),
    run: async (actor) => {
      const rows = await prisma.workItem.findMany({
        where: { companyId: actor.companyId, isActive: true },
        take: 60, orderBy: { name: "asc" },
        select: {
          name: true, type: true, unitPrice: true, durationMinutes: true,
          recurringInterval: true, description: true,
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
        "How the company is configured: business hours, service-area ZIPs, arrival window, online-booking status, bookable team members, timezone, review link.",
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
];

export function toolsForActor(actor: Actor): Tool[] {
  return tools.filter((t) => t.allowed(actor));
}

// ── system prompt ────────────────────────────────────────────────────────────

const APP_CHEATSHEET = `Where things live in the app (for "how do I" questions):
- Clients: /app/contacts (CSV import lives there too — Jobber/Housecall Pro exports auto-map)
- Requests (incoming leads + online bookings to approve): /app/requests
- Quotes: /app/quotes — approved quotes convert to jobs; deposits collected from the quote page
- Jobs: /app/jobs — completing a job marks it ready to invoice
- Invoices & payments: /app/invoices — record cash/check/Venmo/Zelle/Cash App payments
- Subscriptions (recurring billing): /app/subscriptions
- Schedule (calendar, drag to schedule): /app/schedule
- Price book (services, time-on-site for online booking): /app/settings/products
- Booking forms + embed code + online scheduling settings (hours, service area): /app/settings/booking
- Contract templates (e-sign): /app/settings/contracts
- Team members, roles, who's bookable online: /app/settings/team
- Business info, timezone, branding, deposits, surcharge: /app/settings
- AI setup assistant (re-runnable): /app/setup
- Client portal: each client gets a magic-link portal; send it from their client page.`;

function systemPrompt(actor: Actor, companyName: string, tz: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  return `You are the built-in assistant for ${companyName}'s Streamflaire Hub account — field-service business software (clients, quotes, jobs, invoices, scheduling, online booking).

Today is ${weekday}, ${today} (${tz}). The user is ${actor.name}, role: ${roleLabel[actor.role]}.

Rules:
- For ANY question about their business data, call a tool — never guess or invent numbers. If a tool returns empty, say so plainly.
- You can read data and draft text, but you cannot create or change records. When the user wants to do that, tell them exactly where in the app to click (paths below).
- Only discuss data the tools return. If a tool says the user's role can't see something, say that.
- Be concise and concrete: short sentences, plain text only (no markdown symbols like ** or #). Use "-" for lists. Dollar amounts already come formatted from tools.
- When drafting messages/emails for the user's clients, write them ready to copy: friendly, professional, no placeholders unless data is missing.
- If asked about anything unrelated to running their business or using this app, politely decline in one sentence.

${APP_CHEATSHEET}`;
}

// ── the loop ─────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Run one assistant turn: history in, final text out. Tool calls happen
 * server-side, bounded to MAX_TOOL_ROUNDS. Returns null when AI is
 * unconfigured or the model errors (route maps that to a friendly 503).
 */
export async function runAssistant(actor: Actor, messages: ChatMessage[]): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { name: true, timezone: true },
  });
  if (!company) return null;

  const active = toolsForActor(actor);
  const model = process.env.AI_MODEL_ASSISTANT || undefined;

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
      maxOutputTokens: 1024,
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
      return text || null;
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
          response = await tool.run(actor, call.functionCall.args ?? {});
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
