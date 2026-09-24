/**
 * Automations — the spec (docs/plans/automations-builder-2026-09-24.md).
 *
 * An automation is ONE trigger (an app event, a time-based sweep, a schedule,
 * an inbound webhook, or a manual run) followed by a LINEAR list of steps:
 *   - filter  "only continue if…" (structured rules, or an advanced expression)
 *   - wait    "wait N hours / days" (the engine parks the run and resumes)
 *   - action  an allowlisted thing to do (message, record change, integration)
 *
 * Conditions and templates reuse the estimate tools' expression language
 * (lib/estimator.ts) over a flat context of fields ({client_first_name},
 * {quote_total}, …). The builder page and Atlas both write this spec; the
 * engine in lib/automations-server.ts executes it with no model in the loop.
 *
 * Safety is by construction, not by prompt:
 *   - the action allowlist has nothing that moves money, deletes or archives
 *     records, or changes team members / roles;
 *   - one automation fires at most once per (entity, event) — AutomationRun
 *     rows are the dedupe key — and a company caps out at a daily run count;
 *   - actions never emit events, so automations can't trigger each other.
 *
 * v1 specs ({trigger, when, actions}) still compile: they are normalized to
 * v2 ({trigger, steps}) on read, so rules built before 2026-09-24 keep running.
 *
 * This file is pure (no Prisma) so tests and the client can import it.
 */

import {
  evaluate,
  identifiersIn,
  parseExpr,
  parseTemplate,
  renderTemplate,
  truthy,
  type EvalCtx,
  type Node,
  type TemplatePart,
  type Value,
} from "./estimator";

export const AUTOMATION_LIMITS = {
  /** Real actions per rule (filters and waits don't count). */
  actions: 5,
  /** Every step, filters and waits included. */
  steps: 12,
  perCompany: 30,
  /** Successful runs per company per rolling 24 h — a runaway rule stops here. */
  dailyRuns: 300,
  /** Entities one sweep considers per automation per tick. */
  sweepBatch: 200,
  maxDays: 120,
  maxHours: 720,
  maxWaitDays: 60,
  /** Rules on one filter step. */
  rules: 8,
  webhookTimeoutMs: 5000,
  webhookBodyBytes: 64 * 1024,
} as const;

// ── entities ─────────────────────────────────────────────────────────────────

export type EntityType =
  | "request" | "appointment" | "quote" | "job" | "invoice" | "contact"
  | "payment" | "call" | "message" | "contract" | "time_entry" | "team_member"
  | "subscription" | "expense" | "company" | "webhook";

/** Entities that carry a client (so client_* fields and client actions apply). */
export const CLIENT_ENTITIES: readonly EntityType[] = [
  "request", "appointment", "quote", "job", "invoice", "contact", "payment", "call", "message", "contract", "subscription",
];

export const ENTITY_LABEL: Record<EntityType, string> = {
  request: "request", appointment: "appointment", quote: "quote", job: "job", invoice: "invoice", contact: "client",
  payment: "payment", call: "call", message: "message", contract: "agreement", time_entry: "time entry", team_member: "team member",
  subscription: "recurring plan", expense: "expense", company: "your company", webhook: "webhook payload",
};

/** In-app path for a record of this entity (run log links, team notifications). */
export const ENTITY_PATH: Partial<Record<EntityType, string>> = {
  request: "/app/requests", appointment: "/app/appointments", quote: "/app/quotes", job: "/app/jobs", invoice: "/app/invoices",
  contact: "/app/contacts", payment: "/app/payments", call: "/app/calls", contract: "/app/contracts", subscription: "/app/subscriptions",
  expense: "/app/expenses",
};

// ── triggers ─────────────────────────────────────────────────────────────────

export type TriggerKind = "event" | "sweep" | "schedule" | "webhook" | "manual";
export type TriggerGroup =
  | "Leads & clients" | "Requests" | "Appointments" | "Quotes" | "Jobs" | "Invoices & payments"
  | "Calls & messages" | "Agreements" | "Team" | "Recurring & expenses" | "Time & external";

export type TriggerDef = {
  label: string;
  group: TriggerGroup;
  entity: EntityType;
  kind: TriggerKind;
  /** Sweeps: the count the trigger waits for. `{days}` / `{hours}` in the label is replaced. */
  days?: { default: number; help: string };
  hours?: { default: number; help: string };
  /** lead.stage_changed: optional stage name to narrow to. */
  stagePick?: boolean;
  /** client.field_changed: optional custom-field pick. */
  fieldPick?: boolean;
  /** manual.run: which page the Run button appears on. */
  entityPick?: readonly EntityType[];
  /** How to make it fire on purpose (the test recipe). */
  recipe: string;
};

export const TRIGGERS = {
  // Leads & clients
  "lead.created": { label: "a new lead is added", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Add a client with status Lead, or submit the booking form as a new person." },
  "lead.stage_changed": { label: "a lead moves to a stage", group: "Leads & clients", entity: "contact", kind: "event", stagePick: true, recipe: "Drag a lead card to another column on Leads." },
  "lead.won": { label: "a lead is marked won", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Drag a lead to Won (or approve their quote)." },
  "lead.lost": { label: "a lead is marked lost", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Drag a lead to Lost and give a reason." },
  "lead.contact_made": { label: "you reach a lead (a call connects or you text them)", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Text a lead from Messages, or finish a call with them." },
  "lead.no_answer": { label: "you call a lead and they don't pick up", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Call a lead from the app and hang up while it rings." },
  "lead.stale": { label: "a lead has sat in the same stage for {days} days", group: "Leads & clients", entity: "contact", kind: "sweep", days: { default: 14, help: "days in the same stage" }, recipe: "Set days to 1 on a lead that moved yesterday; fires on the next hourly sweep." },
  "client.created": { label: "a new client is added", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Add a client with status Active." },
  "client.archived": { label: "a client is archived", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Archive a client from their page." },
  "client.reactivated": { label: "an archived client is reactivated", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Set an archived client back to Active." },
  "client.note_added": { label: "a note is added to a client", group: "Leads & clients", entity: "contact", kind: "event", recipe: "Add a note on a client page." },
  "client.field_changed": { label: "a client's custom field changes", group: "Leads & clients", entity: "contact", kind: "event", fieldPick: true, recipe: "Edit a client and change the chosen custom field." },
  "client.inactive": { label: "a client hasn't had a job in {days} days", group: "Leads & clients", entity: "contact", kind: "sweep", days: { default: 180, help: "days since their last completed job" }, recipe: "Set days low for a client whose last job is older; fires on the next sweep." },
  // Requests
  "request.created": { label: "a new request comes in", group: "Requests", entity: "request", kind: "event", recipe: "Submit the public booking form, or add a request in the app." },
  "request.converted": { label: "a request is turned into a quote, job or appointment", group: "Requests", entity: "request", kind: "event", recipe: "Open a request and press Create quote / job / appointment." },
  "request.archived": { label: "a request is archived", group: "Requests", entity: "request", kind: "event", recipe: "Archive a request." },
  // Appointments
  "appointment.scheduled": { label: "an appointment is booked", group: "Appointments", entity: "appointment", kind: "event", recipe: "Book an appointment in the app or through the public scheduler." },
  "appointment.rescheduled": { label: "an appointment is rescheduled", group: "Appointments", entity: "appointment", kind: "event", recipe: "Change an appointment's date or time." },
  "appointment.cancelled": { label: "an appointment is cancelled", group: "Appointments", entity: "appointment", kind: "event", recipe: "Cancel an appointment." },
  "appointment.completed": { label: "an appointment is marked completed", group: "Appointments", entity: "appointment", kind: "event", recipe: "Mark an appointment Completed." },
  "appointment.no_show": { label: "an appointment is marked no-show", group: "Appointments", entity: "appointment", kind: "event", recipe: "Mark an appointment No-show." },
  "appointment.upcoming": { label: "an appointment starts in {hours} hours", group: "Appointments", entity: "appointment", kind: "sweep", hours: { default: 24, help: "hours before the start" }, recipe: "Book an appointment inside the window; fires on the next hourly sweep." },
  "appointment.no_quote": { label: "an appointment ended {hours} hours ago with no quote sent", group: "Appointments", entity: "appointment", kind: "sweep", hours: { default: 24, help: "hours after it ended" }, recipe: "Complete an appointment, send no quote, wait for the sweep." },
  // Quotes
  "quote.sent": { label: "a quote is sent (first send)", group: "Quotes", entity: "quote", kind: "event", recipe: "Send a draft quote." },
  "quote.viewed": { label: "a client opens a quote (first time)", group: "Quotes", entity: "quote", kind: "event", recipe: "Open the quote's client link in a private window." },
  "quote.approved": { label: "a quote is approved", group: "Quotes", entity: "quote", kind: "event", recipe: "Approve a quote from its client link, or mark it approved." },
  "quote.changes_requested": { label: "a client asks for changes on a quote", group: "Quotes", entity: "quote", kind: "event", recipe: "Press Request changes on the quote's client link." },
  "quote.converted": { label: "a quote is turned into a job", group: "Quotes", entity: "quote", kind: "event", recipe: "Press Create job on an approved quote." },
  "quote.deposit_paid": { label: "a deposit is paid on a quote", group: "Quotes", entity: "quote", kind: "event", recipe: "Pay the deposit on a quote's client link (test card)." },
  "quote.unanswered": { label: "a sent quote has had no answer for {days} days", group: "Quotes", entity: "quote", kind: "sweep", days: { default: 5, help: "days since it was sent" }, recipe: "Set days to 1 on a quote sent yesterday; fires on the next sweep." },
  // Jobs
  "job.created": { label: "a job is created", group: "Jobs", entity: "job", kind: "event", recipe: "Create a job." },
  "job.scheduled": { label: "a job is scheduled or its date changes", group: "Jobs", entity: "job", kind: "event", recipe: "Set or move a job's date." },
  "job.assigned": { label: "a job's crew changes", group: "Jobs", entity: "job", kind: "event", recipe: "Assign or change who's on a job." },
  "job.started": { label: "a job is started (first clock-in)", group: "Jobs", entity: "job", kind: "event", recipe: "Clock in on a job for the first time." },
  "job.on_my_way": { label: "a tech sends On my way", group: "Jobs", entity: "job", kind: "event", recipe: "Press On my way on a job." },
  "job.checklist_done": { label: "a job's checklist is finished", group: "Jobs", entity: "job", kind: "event", recipe: "Tick the last checklist item on a job." },
  "job.photo_added": { label: "a photo is added to a job", group: "Jobs", entity: "job", kind: "event", recipe: "Add a photo on a job." },
  "job.note_added": { label: "a note is added to a job", group: "Jobs", entity: "job", kind: "event", recipe: "Add a note on a job." },
  "job.completed": { label: "a job is marked complete", group: "Jobs", entity: "job", kind: "event", recipe: "Mark a job Complete." },
  "job.archived": { label: "a job is archived", group: "Jobs", entity: "job", kind: "event", recipe: "Archive a job." },
  "job.today": { label: "a job is scheduled for today (once per job, each morning)", group: "Jobs", entity: "job", kind: "sweep", recipe: "Schedule a job for today; fires on the next hourly sweep." },
  "job.unscheduled": { label: "a job has been unscheduled for {days} days", group: "Jobs", entity: "job", kind: "sweep", days: { default: 3, help: "days since it was created without a date" }, recipe: "Create a job with no date, set days to 1, wait for the sweep." },
  "job.completed_ago": { label: "a job was completed {days} days ago", group: "Jobs", entity: "job", kind: "sweep", days: { default: 7, help: "days since completion" }, recipe: "Set days to 1 on a job completed yesterday; fires on the next sweep." },
  // Invoices & payments
  "invoice.sent": { label: "an invoice is sent", group: "Invoices & payments", entity: "invoice", kind: "event", recipe: "Send a draft invoice." },
  "invoice.viewed": { label: "a client opens an invoice (first time)", group: "Invoices & payments", entity: "invoice", kind: "event", recipe: "Open the invoice's pay link in a private window." },
  "invoice.partially_paid": { label: "an invoice is partially paid", group: "Invoices & payments", entity: "invoice", kind: "event", recipe: "Record a payment smaller than the balance." },
  "invoice.paid": { label: "an invoice is paid in full", group: "Invoices & payments", entity: "invoice", kind: "event", recipe: "Record a payment for the full balance." },
  "invoice.past_due": { label: "an invoice goes past due", group: "Invoices & payments", entity: "invoice", kind: "event", recipe: "Set an invoice's status to Past due (or let the due date pass)." },
  "invoice.overdue": { label: "an invoice is {days} days past due", group: "Invoices & payments", entity: "invoice", kind: "sweep", days: { default: 7, help: "days past the due date" }, recipe: "Set days to 1 on an invoice due yesterday; fires on the next sweep." },
  "payment.autocharge_failed": { label: "a card-on-file charge fails", group: "Invoices & payments", entity: "invoice", kind: "event", recipe: "Needs a declining test card on an autopay invoice." },
  "payment.received": { label: "a payment is received", group: "Invoices & payments", entity: "payment", kind: "event", recipe: "Record any payment (cash, check, card)." },
  "payment.refunded": { label: "a refund is issued", group: "Invoices & payments", entity: "payment", kind: "event", recipe: "Refund a payment from the Payments page." },
  // Calls & messages
  "call.inbound": { label: "a call comes in and is answered", group: "Calls & messages", entity: "call", kind: "event", recipe: "Call the business line and answer it in the app." },
  "call.missed": { label: "a call is missed", group: "Calls & messages", entity: "call", kind: "event", recipe: "Call the business line and let it ring out (no voicemail)." },
  "call.voicemail": { label: "a caller leaves a voicemail", group: "Calls & messages", entity: "call", kind: "event", recipe: "Call the business line, let it ring out, leave a message." },
  "call.outbound_completed": { label: "an outbound call ends", group: "Calls & messages", entity: "call", kind: "event", recipe: "Call a client from the app and hang up after they answer." },
  "message.text_received": { label: "a client texts the business line", group: "Calls & messages", entity: "message", kind: "event", recipe: "Text the business line from a client's phone." },
  "message.portal_received": { label: "a client sends a message from their portal", group: "Calls & messages", entity: "message", kind: "event", recipe: "Send a message from the client hub." },
  "message.email_opened": { label: "a client opens an email you sent", group: "Calls & messages", entity: "message", kind: "event", recipe: "Send a client an email from their page and open it with images on." },
  "review.requested": { label: "a review request goes out", group: "Calls & messages", entity: "contact", kind: "event", recipe: "Press Request review on a completed job." },
  // Agreements
  "contract.sent": { label: "an agreement is sent", group: "Agreements", entity: "contract", kind: "event", recipe: "Send an agreement." },
  "contract.signed": { label: "an agreement is signed", group: "Agreements", entity: "contract", kind: "event", recipe: "Sign an agreement from its client link." },
  // Team
  "team.clock_in": { label: "a team member clocks in", group: "Team", entity: "time_entry", kind: "event", recipe: "Clock in on a job." },
  "team.clock_out": { label: "a team member clocks out", group: "Team", entity: "time_entry", kind: "event", recipe: "Clock out of a job." },
  "team.long_shift": { label: "someone has been clocked in for {hours} hours", group: "Team", entity: "time_entry", kind: "sweep", hours: { default: 10, help: "hours on the clock" }, recipe: "Set hours to 1, clock in, wait for the sweep." },
  "team.member_added": { label: "a team member joins", group: "Team", entity: "team_member", kind: "event", recipe: "Invite someone and have them accept." },
  // Recurring & expenses
  "subscription.started": { label: "a recurring plan starts", group: "Recurring & expenses", entity: "subscription", kind: "event", recipe: "Create a recurring plan." },
  "subscription.paused": { label: "a recurring plan is paused", group: "Recurring & expenses", entity: "subscription", kind: "event", recipe: "Pause a recurring plan." },
  "subscription.cancelled": { label: "a recurring plan is cancelled", group: "Recurring & expenses", entity: "subscription", kind: "event", recipe: "Cancel a recurring plan." },
  "subscription.visit_generated": { label: "a recurring visit is put on the schedule", group: "Recurring & expenses", entity: "job", kind: "event", recipe: "Create a weekly plan; the next visit is generated on the hourly sweep." },
  "expense.added": { label: "an expense is logged", group: "Recurring & expenses", entity: "expense", kind: "event", recipe: "Add an expense." },
  // Time & external
  "schedule.tick": { label: "on a schedule", group: "Time & external", entity: "company", kind: "schedule", recipe: "Set the hour to the next hour; fires on that hourly sweep." },
  "webhook.received": { label: "a webhook is received", group: "Time & external", entity: "webhook", kind: "webhook", recipe: "POST any JSON to the automation's URL (shown on the builder)." },
  "manual.run": { label: "you press Run on a record", group: "Time & external", entity: "contact", kind: "manual", entityPick: ["contact", "job", "quote", "invoice"], recipe: "Open a client, job, quote or invoice and choose Run automation." },
} as const satisfies Record<string, TriggerDef>;

export type TriggerName = keyof typeof TRIGGERS;
export const TRIGGER_NAMES = Object.keys(TRIGGERS) as TriggerName[];
export const TRIGGER_GROUPS: readonly TriggerGroup[] = [
  "Leads & clients", "Requests", "Appointments", "Quotes", "Jobs", "Invoices & payments", "Calls & messages", "Agreements", "Team", "Recurring & expenses", "Time & external",
];

export function triggerDef(name: TriggerName): TriggerDef {
  return TRIGGERS[name];
}
export function isTrigger(name: string): name is TriggerName {
  return Object.prototype.hasOwnProperty.call(TRIGGERS, name);
}
export const EVENT_NAMES = TRIGGER_NAMES.filter((t) => TRIGGERS[t].kind === "event");
export const SWEEP_NAMES = TRIGGER_NAMES.filter((t) => TRIGGERS[t].kind === "sweep");
/** Names the engine's fireAutomations accepts (events + manual). */
export type EventName = TriggerName;
export type SweepName = (typeof SWEEP_NAMES)[number];
export function isSweep(t: TriggerName): boolean {
  return TRIGGERS[t].kind === "sweep";
}

export type Schedule = { every: "day" | "week"; hour: number; weekday?: number };

export type TriggerSpec = {
  event: TriggerName;
  days?: number;
  hours?: number;
  schedule?: Schedule;
  /** lead.stage_changed: only when it lands in this stage. */
  stage?: string;
  /** client.field_changed: only this custom field (ContactFieldDef id). */
  fieldId?: string;
  /** manual.run: the page the Run button lives on. */
  entity?: EntityType;
};

export function triggerEntity(t: TriggerSpec | TriggerName): EntityType {
  if (typeof t === "string") return TRIGGERS[t].entity;
  if (t.event === "manual.run" && t.entity) return t.entity;
  return TRIGGERS[t.event].entity;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ── context fields (what conditions and templates may reference) ─────────────

export type FieldType = "text" | "number" | "enum" | "bool";
export type FieldDef = { key: string; label: string; type: FieldType; options?: readonly string[]; help?: string };

const f = (key: string, label: string, type: FieldType = "text", extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, ...extra });

/** Fields every entity with a client carries. */
export const CLIENT_FIELDS: readonly FieldDef[] = [
  f("client_name", "Client full name"),
  f("client_first_name", "Client first name"),
  f("client_last_name", "Client last name"),
  f("client_email", "Client email", "text", { help: "empty when none" }),
  f("client_phone", "Client phone", "text", { help: "empty when none" }),
  f("client_company", "Client business name"),
  f("client_status", "Client status", "enum", { options: ["LEAD", "ACTIVE", "ARCHIVED"] }),
  f("client_can_text", "Client can be texted", "bool", { help: "has a mobile number and hasn't opted out" }),
  f("lead_source", "Lead source", "text", { help: "how they found you, or empty" }),
  f("stage", "Pipeline stage", "text", { help: "stage name, or empty when not on the board" }),
  f("city", "City"),
  f("zip", "ZIP"),
  f("assigned_to", "Assigned salesperson", "text", { help: "name, or empty" }),
];

/** Fields every trigger carries. */
export const COMMON_FIELDS: readonly FieldDef[] = [
  f("company_name", "Your company name"),
  f("days", "Days waiting", "number", { help: "sweeps: days waiting / overdue / in stage (0 for events)" }),
  f("hours", "Hours", "number", { help: "sweeps: hours until / since (0 for events)" }),
  f("now_hour", "Hour of day now", "number", { help: "0–23 in your timezone" }),
  f("now_weekday", "Day of week now", "enum", { options: WEEKDAYS }),
  f("today", "Today's date", "text", { help: "YYYY-MM-DD" }),
];

export const ENTITY_FIELDS: Record<EntityType, readonly FieldDef[]> = {
  request: [f("request_number", "Request #", "number"), f("request_title", "Request title"), f("request_details", "Request details"), f("request_source", "Request source", "enum", { options: ["internal", "client_hub", "booking_form", "estimate_form", "webhook"] })],
  appointment: [
    f("appointment_number", "Appointment #", "number"), f("appointment_title", "Appointment title"),
    f("appointment_type", "Appointment type", "enum", { options: ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"] }),
    f("appointment_status", "Appointment status", "enum", { options: ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] }),
    f("appointment_when", "Appointment date & time", "text", { help: "as text, in your timezone" }),
    f("hours_until", "Hours until it starts", "number", { help: "negative once it has started" }),
  ],
  quote: [
    f("quote_number", "Quote #", "number"), f("quote_title", "Quote title"), f("quote_total", "Quote total", "number"), f("total", "Amount", "number"),
    f("quote_status", "Quote status", "enum", { options: ["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "CONVERTED", "ARCHIVED"] }),
    f("quote_link", "Quote link", "text", { help: "the client's approval link" }), f("deposit_amount", "Deposit amount", "number"),
  ],
  job: [
    f("job_number", "Job #", "number"), f("job_title", "Job title"), f("job_address", "Job address"), f("job_total", "Job total", "number"), f("total", "Amount", "number"),
    f("job_status", "Job status", "enum", { options: ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"] }),
    f("job_scheduled", "Job date & time", "text", { help: "as text, or empty when unscheduled" }),
    f("days_until_job", "Days until the job", "number", { help: "negative once it has passed; 0 when unscheduled" }),
    f("crew", "Crew", "text", { help: "assigned names, comma-separated" }),
    f("job_recurring", "Part of a recurring plan", "bool"),
  ],
  invoice: [
    f("invoice_number", "Invoice #", "number"), f("invoice_total", "Invoice total", "number"), f("invoice_balance", "Balance owed", "number"), f("total", "Amount", "number"),
    f("invoice_status", "Invoice status", "enum", { options: ["DRAFT", "AWAITING_PAYMENT", "PAID", "PAST_DUE", "ARCHIVED"] }),
    f("invoice_kind", "Invoice kind", "enum", { options: ["STANDARD", "DEPOSIT"] }),
    f("due_date", "Due date", "text", { help: "YYYY-MM-DD or empty" }), f("due_in_days", "Days until due", "number", { help: "negative when past due" }),
    f("pay_link", "Pay link"),
  ],
  contact: [],
  payment: [
    f("payment_amount", "Payment amount", "number"), f("total", "Amount", "number"),
    f("payment_method", "Payment method", "enum", { options: ["CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER"] }),
    f("refund_amount", "Refunded amount", "number"), f("invoice_number", "Invoice #", "number"), f("invoice_balance", "Balance owed", "number"), f("pay_link", "Pay link"),
  ],
  call: [
    f("call_direction", "Direction", "enum", { options: ["INBOUND", "OUTBOUND"] }),
    f("call_status", "Call status", "enum", { options: ["RINGING", "IN_PROGRESS", "COMPLETED", "MISSED", "VOICEMAIL", "NO_ANSWER", "FAILED"] }),
    f("call_from", "From number"), f("call_to", "To number"), f("call_duration", "Duration (seconds)", "number"), f("call_notes", "Call notes", "text", { help: "Atlas's notes from the call, when it listened" }),
  ],
  message: [f("message_body", "Message text"), f("message_via", "Sent via", "enum", { options: ["sms", "portal", "email"] }), f("message_subject", "Subject", "text", { help: "emails only" })],
  contract: [f("contract_title", "Agreement title"), f("contract_status", "Agreement status", "enum", { options: ["DRAFT", "SENT", "SIGNED", "VOID"] }), f("contract_link", "Signing link")],
  time_entry: [f("team_member", "Team member"), f("job_number", "Job #", "number"), f("job_title", "Job title"), f("shift_hours", "Hours on this entry", "number"), f("started_at", "Started at", "text")],
  team_member: [f("team_member", "Team member"), f("team_member_email", "Email"), f("team_member_role", "Role", "enum", { options: ["OWNER", "ADMIN", "USER", "SALES", "TECH"] })],
  subscription: [f("subscription_name", "Plan name"), f("subscription_status", "Plan status", "enum", { options: ["ACTIVE", "PAUSED", "CANCELLED"] }), f("subscription_amount", "Plan amount", "number"), f("total", "Amount", "number"), f("frequency", "Frequency")],
  expense: [f("expense_amount", "Expense amount", "number"), f("total", "Amount", "number"), f("expense_category", "Category"), f("expense_note", "Note"), f("expense_by", "Logged by")],
  company: [
    f("open_quotes", "Quotes awaiting a response", "number"), f("overdue_invoices", "Overdue invoices", "number"), f("overdue_balance", "Overdue balance", "number"),
    f("jobs_today", "Jobs scheduled today", "number"), f("unscheduled_jobs", "Unscheduled jobs", "number"), f("new_leads_today", "New leads today", "number"), f("open_requests", "Open requests", "number"),
  ],
  webhook: [],
};

const CUSTOM_PREFIX = "custom_";
const DATA_PREFIX = "data_";
/** Set by an atlas_draft step for the steps after it. */
export const ATLAS_TEXT_FIELD = "atlas_text";

/** Every field a trigger's steps may reference, in builder order. */
export function fieldDefsFor(t: TriggerSpec | TriggerName): FieldDef[] {
  const entity = triggerEntity(t);
  const out: FieldDef[] = [];
  if (CLIENT_ENTITIES.includes(entity)) out.push(...CLIENT_FIELDS);
  out.push(...ENTITY_FIELDS[entity]);
  out.push(...COMMON_FIELDS);
  return out;
}
export function fieldsFor(t: TriggerSpec | TriggerName): string[] {
  return fieldDefsFor(t).map((d) => d.key);
}

/** A custom-field label → its context key ("Gate code" → custom_gate_code). */
export function customFieldKey(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return `${CUSTOM_PREFIX}${slug || "field"}`;
}

function identifierAllowed(name: string, entity: EntityType, known: Set<string>): boolean {
  if (known.has(name)) return true;
  if (CLIENT_ENTITIES.includes(entity) && name.startsWith(CUSTOM_PREFIX) && name.length > CUSTOM_PREFIX.length) return true;
  if (entity === "webhook" && name.startsWith(DATA_PREFIX) && name.length > DATA_PREFIX.length) return true;
  return false;
}

export const FIELD_HELP: Record<string, string> = Object.fromEntries(
  [...CLIENT_FIELDS, ...COMMON_FIELDS, ...Object.values(ENTITY_FIELDS).flat()].map((d) => [d.key, d.help ? `${d.label} — ${d.help}` : d.label])
);

// ── filters ──────────────────────────────────────────────────────────────────

export type Op =
  | "eq" | "neq" | "contains" | "not_contains" | "empty" | "not_empty" | "in" | "not_in"
  | "gt" | "gte" | "lt" | "lte" | "is_true" | "is_false" | "weekday" | "weekend" | "between_hours";

export const OPS: Record<Op, { label: string; types: readonly FieldType[]; value: "none" | "one" | "list" | "range" }> = {
  eq: { label: "is", types: ["text", "number", "enum"], value: "one" },
  neq: { label: "is not", types: ["text", "number", "enum"], value: "one" },
  contains: { label: "contains", types: ["text"], value: "one" },
  not_contains: { label: "doesn't contain", types: ["text"], value: "one" },
  empty: { label: "is empty", types: ["text", "number", "enum"], value: "none" },
  not_empty: { label: "is not empty", types: ["text", "number", "enum"], value: "none" },
  in: { label: "is one of", types: ["text", "enum"], value: "list" },
  not_in: { label: "is not one of", types: ["text", "enum"], value: "list" },
  gt: { label: "is more than", types: ["number"], value: "one" },
  gte: { label: "is at least", types: ["number"], value: "one" },
  lt: { label: "is less than", types: ["number"], value: "one" },
  lte: { label: "is at most", types: ["number"], value: "one" },
  is_true: { label: "is yes", types: ["bool"], value: "none" },
  is_false: { label: "is no", types: ["bool"], value: "none" },
  weekday: { label: "is a weekday", types: ["enum"], value: "none" },
  weekend: { label: "is a weekend", types: ["enum"], value: "none" },
  between_hours: { label: "is between (hours)", types: ["number"], value: "range" },
};
export const OP_NAMES = Object.keys(OPS) as Op[];

export type Rule = { field: string; op: Op; value?: string | number | (string | number)[] };

export type FilterStep = { type: "filter"; match: "all" | "any"; rules: Rule[]; expr?: string };
export type WaitStep = { type: "wait"; amount: number; unit: "hours" | "days" };

function q(v: unknown): string {
  return `"${String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
}
function num(v: unknown): string {
  const x = Number(v);
  return Number.isFinite(x) ? String(x) : "0";
}

/** One rule → one expression in the estimate-tool language. */
export function ruleExpr(r: Rule, type: FieldType | undefined): string {
  const fld = r.field;
  const isNum = type === "number";
  const one = () => (isNum ? num(r.value) : q(r.value));
  switch (r.op) {
    case "eq": return `${fld} == ${one()}`;
    case "neq": return `${fld} != ${one()}`;
    case "contains": return `contains(${fld}, ${q(r.value)})`;
    case "not_contains": return `not contains(${fld}, ${q(r.value)})`;
    case "empty": return isNum ? `${fld} == 0` : `len(${fld}) == 0`;
    case "not_empty": return isNum ? `${fld} != 0` : `len(${fld}) > 0`;
    case "in":
    case "not_in": {
      const list = (Array.isArray(r.value) ? r.value : String(r.value ?? "").split(",")).map((v) => String(v).trim()).filter(Boolean);
      const e = `contains([${list.map(q).join(", ")}], ${fld})`;
      return r.op === "in" ? e : `not ${e}`;
    }
    case "gt": return `${fld} > ${num(r.value)}`;
    case "gte": return `${fld} >= ${num(r.value)}`;
    case "lt": return `${fld} < ${num(r.value)}`;
    case "lte": return `${fld} <= ${num(r.value)}`;
    case "is_true": return `${fld}`;
    case "is_false": return `not ${fld}`;
    case "weekday": return `(${fld} != "Sat" and ${fld} != "Sun")`;
    case "weekend": return `(${fld} == "Sat" or ${fld} == "Sun")`;
    case "between_hours": {
      const [a, b] = Array.isArray(r.value) ? r.value : String(r.value ?? "").split(",");
      return `(${fld} >= ${num(a)} and ${fld} < ${num(b)})`;
    }
  }
}

/** A filter step → the expression the engine evaluates (empty string = always). */
export function filterExpr(step: FilterStep, defs: FieldDef[]): string {
  if (step.expr) return step.expr;
  if (step.rules.length === 0) return "";
  const byKey = new Map(defs.map((d) => [d.key, d.type]));
  const parts = step.rules.map((r) => `(${ruleExpr(r, byKey.get(r.field) ?? (r.field.startsWith(DATA_PREFIX) || r.field.startsWith(CUSTOM_PREFIX) ? "text" : undefined))})`);
  return parts.join(step.match === "any" ? " or " : " and ");
}

// ── actions ──────────────────────────────────────────────────────────────────

export type ParamKind = "template" | "template_long" | "text" | "email" | "url" | "number" | "select" | "user" | "stage" | "custom_field" | "agreement_template";
export type ParamDef = { key: string; label: string; kind: ParamKind; required?: boolean; options?: readonly { value: string; label: string }[]; max?: number; min?: number; help?: string; placeholder?: string };

export type ActionGroup = "Messaging" | "Records" | "Integrations";
export type ActionDef = {
  label: string;
  group: ActionGroup;
  /** "client" = any entity with a client; a list = only those entities; "any" = everything. */
  needs: "any" | "client" | readonly EntityType[];
  params: readonly ParamDef[];
  /** One line on what it does (builder picker). */
  hint: string;
};

const p = (key: string, label: string, kind: ParamKind, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, kind, ...extra });

export const ACTIONS = {
  // Messaging
  notify_team: { label: "Notify the team", group: "Messaging", needs: "any", hint: "A push + bell notification in the app.", params: [
    p("to", "Who", "select", { required: true, options: [{ value: "managers", label: "Owners & admins" }, { value: "assigned", label: "The assigned person" }, { value: "everyone", label: "Everyone" }] }),
    p("title", "Title", "template", { required: true, max: 120 }), p("body", "Details", "template_long", { max: 500 }),
  ] },
  notify_user: { label: "Notify one person", group: "Messaging", needs: "any", hint: "A push + bell notification to one team member.", params: [
    p("userId", "Who", "user", { required: true }), p("title", "Title", "template", { required: true, max: 120 }), p("body", "Details", "template_long", { max: 500 }),
  ] },
  email_client: { label: "Email the client", group: "Messaging", needs: "client", hint: "A tracked email under your business name (needs their email).", params: [
    p("subject", "Subject", "template", { required: true, max: 150 }), p("body", "Message", "template_long", { required: true, max: 2000 }),
  ] },
  text_client: { label: "Text the client", group: "Messaging", needs: "client", hint: "An SMS from your business line — only if they can be texted.", params: [p("body", "Message", "template_long", { required: true, max: 480 })] },
  portal_message: { label: "Message the client in their portal", group: "Messaging", needs: "client", hint: "Appears in their hub thread; mirrors to text or email when possible.", params: [p("body", "Message", "template_long", { required: true, max: 1000 })] },
  email_address: { label: "Email an address", group: "Messaging", needs: "any", hint: "An internal email — the office, the owner, an outside inbox.", params: [
    p("to", "To", "email", { required: true, max: 200 }), p("subject", "Subject", "template", { required: true, max: 150 }), p("body", "Message", "template_long", { required: true, max: 2000 }),
  ] },
  send_quote_link: { label: "Send the quote link", group: "Messaging", needs: ["quote"], hint: "Re-sends the client's approval link (email, plus text when possible).", params: [] },
  send_pay_link: { label: "Send the pay link", group: "Messaging", needs: ["invoice", "payment"], hint: "Sends the invoice's pay link (email, plus text when possible).", params: [] },
  send_payment_reminder: { label: "Send a payment reminder", group: "Messaging", needs: ["invoice", "payment"], hint: "The standard reminder email; skipped once the invoice is paid.", params: [] },
  send_appointment_reminder: { label: "Send an appointment reminder", group: "Messaging", needs: ["appointment"], hint: "The standard reminder (text when possible, else email).", params: [] },
  request_review: { label: "Request a review", group: "Messaging", needs: "client", hint: "Sends your review link (needs it set in Branding); once per client per job.", params: [] },
  // Records
  add_client_note: { label: "Add a note on the client", group: "Records", needs: "client", hint: "A note on the client's page, tagged with the rule's name.", params: [p("body", "Note", "template_long", { required: true, max: 1000 })] },
  add_job_note: { label: "Add a note on the job", group: "Records", needs: ["job", "time_entry"], hint: "A note on the job.", params: [p("body", "Note", "template_long", { required: true, max: 1000 })] },
  move_lead: { label: "Move the lead to a stage", group: "Records", needs: "client", hint: "Moves their card on the Leads board.", params: [p("stageName", "Stage", "stage", { required: true, max: 60 })] },
  set_lead_outcome: { label: "Mark the lead won or lost", group: "Records", needs: "client", hint: "Won stamps the win; Lost needs a reason.", params: [
    p("outcome", "Outcome", "select", { required: true, options: [{ value: "won", label: "Won" }, { value: "lost", label: "Lost" }] }), p("reason", "Reason (lost)", "text", { max: 120 }),
  ] },
  set_custom_field: { label: "Set a client custom field", group: "Records", needs: "client", hint: "Writes a value into one of your custom fields.", params: [p("fieldId", "Field", "custom_field", { required: true }), p("value", "Value", "template", { required: true, max: 200 })] },
  assign_job: { label: "Assign the job", group: "Records", needs: ["job"], hint: "Adds a team member to the job's crew.", params: [p("userId", "Who", "user", { required: true })] },
  add_checklist_item: { label: "Add a checklist item to the job", group: "Records", needs: ["job"], hint: "One more line on the job's checklist.", params: [p("label", "Item", "template", { required: true, max: 120 })] },
  create_request: { label: "Create a request", group: "Records", needs: "client", hint: "A new request for this client in your inbox.", params: [p("title", "Title", "template", { required: true, max: 120 }), p("details", "Details", "template_long", { max: 1000 })] },
  create_appointment: { label: "Book an appointment", group: "Records", needs: "client", hint: "A phone/video/in-person appointment N days out.", params: [
    p("daysOut", "Days from now", "number", { required: true, min: 0, max: 120 }), p("hour", "At hour (0–23)", "number", { required: true, min: 0, max: 23 }),
    p("title", "Title", "template", { required: true, max: 120 }),
    p("kind", "Type", "select", { required: true, options: [{ value: "PHONE_CALL", label: "Phone call" }, { value: "VIDEO_CALL", label: "Video call" }, { value: "IN_PERSON", label: "In person" }] }),
  ] },
  create_quote_draft: { label: "Create a draft quote", group: "Records", needs: "client", hint: "An empty draft quote for the client (nothing is sent).", params: [p("title", "Title", "template", { required: true, max: 120 })] },
  create_invoice_draft: { label: "Create a draft invoice from the job", group: "Records", needs: ["job"], hint: "Copies the job's line items into a draft invoice (nothing is sent).", params: [] },
  create_agreement: { label: "Create an agreement from a template", group: "Records", needs: "client", hint: "A draft agreement for the client (nothing is sent).", params: [p("templateId", "Template", "agreement_template", { required: true })] },
  create_time_block: { label: "Put a follow-up on the schedule", group: "Records", needs: "any", hint: "A time block on the assigned person's (or owner's) calendar.", params: [
    p("daysOut", "Days from now", "number", { required: true, min: 0, max: 120 }), p("hour", "At hour (0–23)", "number", { required: true, min: 0, max: 23 }), p("title", "Title", "template", { required: true, max: 120 }),
  ] },
  // Integrations
  push_to_quickbooks: { label: "Push to QuickBooks", group: "Integrations", needs: ["quote", "invoice", "payment"], hint: "Syncs the record now (needs QuickBooks connected).", params: [] },
  send_webhook: { label: "Send to a URL", group: "Integrations", needs: "any", hint: "POSTs the record's fields as JSON — for Zapier, Make, Sheets…", params: [p("url", "URL", "url", { required: true, max: 500, placeholder: "https://hooks.zapier.com/…" })] },
  atlas_draft: { label: "Draft text with Atlas", group: "Integrations", needs: "any", hint: "Atlas writes text from your prompt; later steps can use {atlas_text}. Metered.", params: [p("prompt", "Prompt", "template_long", { required: true, max: 1000, placeholder: "Write a warm two-sentence thank-you for {client_first_name} about {job_title}." })] },
} as const satisfies Record<string, ActionDef>;

export type ActionType = keyof typeof ACTIONS;
export const ACTION_TYPES = Object.keys(ACTIONS) as ActionType[];
export const ACTION_GROUPS: readonly ActionGroup[] = ["Messaging", "Records", "Integrations"];
export function actionDef(t: ActionType): ActionDef {
  return ACTIONS[t];
}
export function isActionType(t: string): t is ActionType {
  return Object.prototype.hasOwnProperty.call(ACTIONS, t);
}
export function actionAllowedFor(t: ActionType, entity: EntityType): boolean {
  const needs = ACTIONS[t].needs;
  if (needs === "any") return true;
  if (needs === "client") return CLIENT_ENTITIES.includes(entity);
  return (needs as readonly EntityType[]).includes(entity);
}

export type AutomationAction = { type: ActionType } & Record<string, string | number | undefined>;
export type Step = FilterStep | WaitStep | AutomationAction;
export type StepKind = "filter" | "wait" | "action";
export function stepKind(s: Step): StepKind {
  return s.type === "filter" ? "filter" : s.type === "wait" ? "wait" : "action";
}
export function isAction(s: Step): s is AutomationAction {
  return s.type !== "filter" && s.type !== "wait";
}

export type AutomationSpec = {
  version: 2;
  trigger: TriggerSpec;
  steps: Step[];
};

export type CompiledAutomation = {
  spec: AutomationSpec;
  /** Per step: the parsed filter (filters only). */
  filters: (Node | null)[];
  /** Per step: template param → parsed template (actions only). */
  templates: Record<string, TemplatePart[]>[];
  entity: EntityType;
};

export type CompileResult = { ok: true; compiled: CompiledAutomation } | { ok: false; errors: string[] };

function s(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function intIn(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
}

/** Accept a v1 spec ({trigger, when, actions}) or v2 ({trigger, steps}) and give back raw v2 parts. */
function normalizeRaw(r: Record<string, unknown>): { trigger: Record<string, unknown>; steps: unknown[] } {
  const trigger = (r.trigger && typeof r.trigger === "object" ? { ...(r.trigger as Record<string, unknown>) } : {}) as Record<string, unknown>;
  if (trigger.event === undefined && typeof r.event === "string") trigger.event = r.event;
  if (trigger.days === undefined && r.days !== undefined) trigger.days = r.days;
  if (Array.isArray(r.steps)) return { trigger, steps: r.steps };
  const steps: unknown[] = [];
  const when = s(r.when, 500);
  if (when) steps.push({ type: "filter", match: "all", rules: [], expr: when });
  if (Array.isArray(r.actions)) steps.push(...r.actions);
  return { trigger, steps };
}

export function compileAutomation(raw: unknown): CompileResult {
  const errors: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const { trigger: t, steps: rawSteps } = normalizeRaw(r);

  // trigger
  const eventName = s(t.event, 40);
  if (!isTrigger(eventName)) {
    return { ok: false, errors: [`trigger.event must be one of: ${TRIGGER_NAMES.join(", ")}`] };
  }
  const def: TriggerDef = TRIGGERS[eventName];
  const trigger: TriggerSpec = { event: eventName };
  if (def.days) trigger.days = intIn(t.days, 1, AUTOMATION_LIMITS.maxDays, def.days.default);
  if (def.hours) trigger.hours = intIn(t.hours, 1, AUTOMATION_LIMITS.maxHours, def.hours.default);
  if (def.kind === "schedule") {
    const sc = (t.schedule && typeof t.schedule === "object" ? t.schedule : {}) as Record<string, unknown>;
    const every = sc.every === "week" ? "week" : "day";
    trigger.schedule = { every, hour: intIn(sc.hour, 0, 23, 8), ...(every === "week" ? { weekday: intIn(sc.weekday, 0, 6, 1) } : {}) };
  }
  if (def.stagePick) {
    const stage = s(t.stage, 60);
    if (stage) trigger.stage = stage;
  }
  if (def.fieldPick) {
    const fieldId = s(t.fieldId, 40);
    if (fieldId) trigger.fieldId = fieldId;
  }
  if (def.entityPick) {
    const e = s(t.entity, 20) as EntityType;
    trigger.entity = (def.entityPick as readonly EntityType[]).includes(e) ? e : def.entityPick[0];
  }
  const entity = triggerEntity(trigger);
  const defs = fieldDefsFor(trigger);
  const known = new Set(defs.map((d) => d.key));

  // steps
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) errors.push("Add at least one action");
  if (rawSteps.length > AUTOMATION_LIMITS.steps) errors.push(`At most ${AUTOMATION_LIMITS.steps} steps`);
  const steps: Step[] = [];
  const filters: (Node | null)[] = [];
  const templates: Record<string, TemplatePart[]>[] = [];
  let actionCount = 0;
  let waitCount = 0;

  const checkIds = (where: string, node: Node) => {
    for (const name of identifiersIn(node)) if (!identifierAllowed(name, entity, known)) errors.push(`${where}: unknown field "${name}" — for this trigger use: ${[...known].join(", ")}`);
  };
  const tpl = (where: string, src: string, into: Record<string, TemplatePart[]>, key: string) => {
    try {
      const parts = parseTemplate(src);
      for (const part of parts) if ("expr" in part) checkIds(where, part.expr);
      into[key] = parts;
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  };

  rawSteps.slice(0, AUTOMATION_LIMITS.steps).forEach((rs, idx) => {
    const a = (rs ?? {}) as Record<string, unknown>;
    const type = s(a.type, 30);
    const where = `Step ${idx + 1} (${type || "?"})`;

    if (type === "filter") {
      const match = a.match === "any" ? "any" : "all";
      const rawRules = Array.isArray(a.rules) ? a.rules.slice(0, AUTOMATION_LIMITS.rules) : [];
      const rules: Rule[] = [];
      for (const rr of rawRules) {
        const o = (rr ?? {}) as Record<string, unknown>;
        const field = s(o.field, 60);
        const op = s(o.op, 20) as Op;
        if (!field || !identifierAllowed(field, entity, known)) {
          errors.push(`${where}: unknown field "${field}"`);
          continue;
        }
        if (!OP_NAMES.includes(op)) {
          errors.push(`${where}: unknown comparison "${op}"`);
          continue;
        }
        const rule: Rule = { field, op };
        const want = OPS[op].value;
        if (want === "one") rule.value = typeof o.value === "number" ? o.value : s(o.value, 200);
        else if (want === "list" || want === "range") {
          const list = Array.isArray(o.value) ? o.value : String(o.value ?? "").split(",");
          rule.value = list.map((v) => (typeof v === "number" ? v : s(v, 100))).filter((v) => v !== "").slice(0, 20);
        }
        rules.push(rule);
      }
      const expr = s(a.expr, 500) || undefined;
      const step: FilterStep = { type: "filter", match, rules, ...(expr ? { expr } : {}) };
      const src = filterExpr(step, defs);
      let node: Node | null = null;
      if (src) {
        try {
          node = parseExpr(src);
          checkIds(where, node);
        } catch (e) {
          errors.push(`${where}: ${(e as Error).message}`);
        }
      }
      steps.push(step);
      filters.push(node);
      templates.push({});
      return;
    }

    if (type === "wait") {
      const unit = a.unit === "hours" ? "hours" : "days";
      const amount = intIn(a.amount, 1, unit === "hours" ? AUTOMATION_LIMITS.maxWaitDays * 24 : AUTOMATION_LIMITS.maxWaitDays, 1);
      if (idx === rawSteps.length - 1) errors.push(`${where}: a wait needs something after it`);
      waitCount++;
      steps.push({ type: "wait", amount, unit });
      filters.push(null);
      templates.push({});
      return;
    }

    if (!isActionType(type)) {
      errors.push(`${where}: type must be filter, wait, or one of ${ACTION_TYPES.join(", ")}`);
      return;
    }
    const adef = ACTIONS[type];
    if (!actionAllowedFor(type, entity)) {
      errors.push(`${where}: "${adef.label}" can't run on a ${ENTITY_LABEL[entity]} trigger`);
    }
    actionCount++;
    const action: AutomationAction = { type };
    const tpls: Record<string, TemplatePart[]> = {};
    for (const pd of adef.params) {
      const rawV = a[pd.key];
      switch (pd.kind) {
        case "template":
        case "template_long": {
          const v = s(rawV, pd.max ?? 1000);
          if (pd.required && !v) errors.push(`${where}: ${pd.label.toLowerCase()} is required`);
          if (v) {
            action[pd.key] = v;
            tpl(`${where} ${pd.label.toLowerCase()}`, v, tpls, pd.key);
          }
          break;
        }
        case "number": {
          const n = Number(rawV);
          if (!Number.isFinite(n)) {
            if (pd.required) errors.push(`${where}: ${pd.label.toLowerCase()} is required`);
          } else action[pd.key] = intIn(n, pd.min ?? 0, pd.max ?? 1_000_000, pd.min ?? 0);
          break;
        }
        case "select": {
          const v = s(rawV, 40);
          const ok = pd.options?.some((o) => o.value === v);
          if (!ok) {
            if (pd.required) {
              // notify_team's "to" defaults to managers (v1 behaviour); anything else must be chosen
              if (type === "notify_team" && pd.key === "to") action.to = "managers";
              else errors.push(`${where}: ${pd.label.toLowerCase()} must be one of ${pd.options?.map((o) => o.value).join(", ")}`);
            }
          } else action[pd.key] = v;
          break;
        }
        case "email": {
          const v = s(rawV, pd.max ?? 200).toLowerCase();
          if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push(`${where}: "${v}" isn't an email address`);
          else if (pd.required && !v) errors.push(`${where}: ${pd.label.toLowerCase()} is required`);
          else if (v) action[pd.key] = v;
          break;
        }
        case "url": {
          const v = s(rawV, pd.max ?? 500);
          if (pd.required && !v) errors.push(`${where}: ${pd.label.toLowerCase()} is required`);
          else if (v && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v)) errors.push(`${where}: the URL must start with https://`);
          else if (v) action[pd.key] = v;
          break;
        }
        default: {
          // text / user / stage / custom_field / agreement_template: an id or a short string
          const legacy = pd.key === "stageName" && rawV === undefined ? a.stage : rawV;
          const v = s(legacy, pd.max ?? 80);
          if (pd.required && !v) errors.push(`${where}: ${pd.label.toLowerCase()} is required`);
          else if (v) action[pd.key] = v;
        }
      }
    }
    steps.push(action);
    filters.push(null);
    templates.push(tpls);
    if (type === "atlas_draft") known.add(ATLAS_TEXT_FIELD);
  });

  if (actionCount === 0 && steps.length > 0) errors.push("Add at least one action");
  if (actionCount > AUTOMATION_LIMITS.actions) errors.push(`At most ${AUTOMATION_LIMITS.actions} actions (filters and waits don't count)`);
  if (waitCount > 3) errors.push("At most 3 waits");

  if (errors.length > 0) return { ok: false, errors: Array.from(new Set(errors)).slice(0, 20) };
  return { ok: true, compiled: { spec: { version: 2, trigger, steps }, filters, templates, entity } };
}

export function specFromJson(raw: unknown): AutomationSpec | null {
  const c = compileAutomation(raw);
  return c.ok ? c.compiled.spec : null;
}

// ── plain-English rendering (cards, list page, Atlas confirmation) ───────────

export function triggerLabel(spec: AutomationSpec | TriggerSpec): string {
  const t = "trigger" in spec ? spec.trigger : spec;
  const def: TriggerDef = TRIGGERS[t.event];
  let label: string = def.label;
  if (def.days) label = label.replace("{days}", String(t.days ?? def.days.default));
  if (def.hours) label = label.replace("{hours}", String(t.hours ?? def.hours.default));
  if (t.event === "lead.stage_changed" && t.stage) label = `a lead moves to “${t.stage}”`;
  if (t.event === "schedule.tick" && t.schedule) {
    const h = t.schedule.hour;
    const hh = `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
    label = t.schedule.every === "week" ? `every ${WEEKDAYS[t.schedule.weekday ?? 1]} at ${hh}` : `every day at ${hh}`;
  }
  if (t.event === "manual.run" && t.entity) label = `you press Run on a ${ENTITY_LABEL[t.entity]}`;
  return label;
}

const short = (v: unknown, n = 80) => {
  const str = String(v ?? "");
  return str.length > n ? `${str.slice(0, n - 3)}…` : str;
};

export function ruleLabel(r: Rule, defs: FieldDef[]): string {
  const d = defs.find((x) => x.key === r.field);
  const name = d?.label ?? r.field;
  const op = OPS[r.op];
  const val = Array.isArray(r.value) ? r.value.join(", ") : String(r.value ?? "");
  if (op.value === "none") return `${name} ${op.label}`;
  if (op.value === "range") return `${name} ${op.label} ${val.replace(",", "–")}`;
  return `${name} ${op.label} ${d?.type === "number" ? val : `“${val}”`}`;
}

export function stepLabel(step: Step, spec: AutomationSpec): string {
  if (step.type === "filter") {
    if (step.expr) return `Only if: ${step.expr}`;
    if (step.rules.length === 0) return "Always";
    const defs = fieldDefsFor(spec.trigger);
    return `Only if ${step.match === "any" ? "any of" : ""}${step.match === "any" ? ": " : ""}${step.rules.map((r) => ruleLabel(r, defs)).join(step.match === "any" ? " or " : " and ")}`;
  }
  if (step.type === "wait") return `Wait ${step.amount} ${step.unit === "hours" ? (step.amount === 1 ? "hour" : "hours") : step.amount === 1 ? "day" : "days"}`;
  return actionLabel(step);
}

export function actionLabel(a: AutomationAction): string {
  switch (a.type) {
    case "notify_team":
      return `Notify ${a.to === "assigned" ? "the assigned person" : a.to === "everyone" ? "the whole team" : "owners & admins"}: “${short(a.title)}”`;
    case "notify_user": return `Notify one person: “${short(a.title)}”`;
    case "email_client": return `Email the client: “${short(a.subject)}”`;
    case "text_client": return `Text the client: “${short(a.body, 60)}”`;
    case "portal_message": return `Message the client in their portal: “${short(a.body, 60)}”`;
    case "email_address": return `Email ${a.to}: “${short(a.subject)}”`;
    case "send_quote_link": return "Send the quote link";
    case "send_pay_link": return "Send the pay link";
    case "send_payment_reminder": return "Send a payment reminder";
    case "send_appointment_reminder": return "Send an appointment reminder";
    case "request_review": return "Send a review request (if a review link is set)";
    case "add_client_note": return `Add a note on the client: “${short(a.body)}”`;
    case "add_job_note": return `Add a note on the job: “${short(a.body)}”`;
    case "move_lead": return `Move the lead to “${a.stageName}”`;
    case "set_lead_outcome": return a.outcome === "won" ? "Mark the lead won" : `Mark the lead lost${a.reason ? ` (${a.reason})` : ""}`;
    case "set_custom_field": return `Set custom field to “${short(a.value, 40)}”`;
    case "assign_job": return "Assign the job to a team member";
    case "add_checklist_item": return `Add checklist item “${short(a.label, 60)}”`;
    case "create_request": return `Create a request: “${short(a.title, 60)}”`;
    case "create_appointment": return `Book a ${String(a.kind ?? "").toLowerCase().replace("_", " ")} appointment ${a.daysOut} day${a.daysOut === 1 ? "" : "s"} out: “${short(a.title, 50)}”`;
    case "create_quote_draft": return `Create a draft quote: “${short(a.title, 60)}”`;
    case "create_invoice_draft": return "Create a draft invoice from the job";
    case "create_agreement": return "Create an agreement from a template";
    case "create_time_block": return `Put “${short(a.title, 50)}” on the schedule ${a.daysOut} day${a.daysOut === 1 ? "" : "s"} out`;
    case "push_to_quickbooks": return "Push to QuickBooks";
    case "send_webhook": return `Send to ${short(a.url, 60)}`;
    case "atlas_draft": return `Atlas drafts text: “${short(a.prompt, 60)}”`;
  }
}

export type Described = { trigger: string; when: string | null; actions: string[]; steps: { kind: StepKind; text: string }[] };

export function describeAutomation(spec: AutomationSpec): Described {
  const steps = spec.steps.map((st) => ({ kind: stepKind(st), text: stepLabel(st, spec) }));
  const first = spec.steps[0];
  const leadFilter = first && first.type === "filter" && (first.rules.length > 0 || first.expr) ? stepLabel(first, spec) : null;
  const rest = leadFilter ? steps.slice(1) : steps;
  return { trigger: `When ${triggerLabel(spec)}`, when: leadFilter, actions: rest.map((x) => x.text), steps };
}

// ── evaluation ───────────────────────────────────────────────────────────────

export type AutomationCtx = Record<string, Value>;

const EMPTY_BOOK: EvalCtx["priceBook"] = new Map();

/** Does the filter at `index` pass for this context? Evaluation errors count as "no" and are reported. */
export function evaluateFilter(compiled: CompiledAutomation, index: number, ctx: AutomationCtx): { pass: boolean; error?: string } {
  const node = compiled.filters[index];
  if (!node) return { pass: true };
  try {
    return { pass: truthy(evaluate(node, { vars: ctx, priceBook: EMPTY_BOOK })) };
  } catch (e) {
    return { pass: false, error: (e as Error).message };
  }
}

/** The leading filter (right after the trigger), or "always". */
export function evaluateWhen(compiled: CompiledAutomation, ctx: AutomationCtx): { fire: boolean; error?: string } {
  const first = compiled.spec.steps[0];
  if (!first || first.type !== "filter") return { fire: true };
  const v = evaluateFilter(compiled, 0, ctx);
  return { fire: v.pass, ...(v.error ? { error: v.error } : {}) };
}

/** Render one step's template params against the context. */
export function renderAction(compiled: CompiledAutomation, index: number, ctx: AutomationCtx): Record<string, string> {
  const out: Record<string, string> = {};
  const evalCtx: EvalCtx = { vars: ctx, priceBook: EMPTY_BOOK };
  for (const [key, parts] of Object.entries(compiled.templates[index] ?? {})) out[key] = renderTemplate(parts, evalCtx);
  return out;
}

// ── Atlas's reference card ───────────────────────────────────────────────────

function triggerLines(): string {
  return TRIGGER_GROUPS.map((g) => {
    const names = TRIGGER_NAMES.filter((t) => TRIGGERS[t].group === g).map((t) => {
      const d: TriggerDef = TRIGGERS[t];
      const extra = d.days ? ` (days)` : d.hours ? ` (hours)` : d.kind === "schedule" ? " (schedule)" : d.stagePick ? " (stage?)" : "";
      return `${t}${extra}`;
    });
    return `  ${g}: ${names.join(", ")}`;
  }).join("\n");
}
function actionLines(): string {
  return ACTION_TYPES.map((t) => {
    const d = ACTIONS[t];
    const params = d.params.map((pp) => `${pp.key}${pp.required ? "" : "?"}`).join(", ");
    const needs = d.needs === "any" ? "" : d.needs === "client" ? " [needs a client]" : ` [${(d.needs as readonly string[]).join("/")} only]`;
    return `  ${t}(${params})${needs} — ${d.hint}`;
  }).join("\n");
}

export const AUTOMATION_GUIDE = `AUTOMATION SPEC — reference (v2)

An automation = ONE trigger + a LINEAR list of steps. It runs by itself with no AI in the loop. It fires at most once per record per trigger. No branching.

spec = {
  trigger: { event: "quote.unanswered", days: 5 },
  steps: [
    { type: "filter", match: "all", rules: [ { field: "quote_total", op: "gte", value: 300 }, { field: "client_email", op: "not_empty" } ] },
    { type: "email_client", subject: "Still thinking it over, {client_first_name}?", body: "Hi {client_first_name},\\n\\nJust checking in on quote #{quote_number} for {quote_total|money}: {quote_link}\\n" },
    { type: "wait", amount: 2, unit: "days" },
    { type: "filter", match: "all", rules: [ { field: "quote_status", op: "eq", value: "AWAITING_RESPONSE" } ] },
    { type: "notify_team", to: "assigned", title: "Quote #{quote_number} still unanswered", body: "{client_name} — {quote_total|money}" }
  ]
}

trigger options: days (sweeps marked (days)), hours (sweeps marked (hours)), schedule {every:"day"|"week", hour:0-23, weekday:0-6} for schedule.tick, stage (lead.stage_changed, optional stage name), entity (manual.run: contact|job|quote|invoice).

Triggers:
${triggerLines()}

Steps:
  filter — match "all"|"any", rules [{field, op, value}]. ops: eq neq contains not_contains empty not_empty in not_in gt gte lt lte is_true is_false weekday weekend between_hours. Put a filter right after the trigger for "only if…"; put one after a wait to re-check (the record is reloaded fresh).
  wait — {amount, unit:"hours"|"days"}; max 60 days; not last.
  actions (the WHOLE allowlist — nothing else exists; no charging, deleting, archiving, status changes):
${actionLines()}

Limits: ${AUTOMATION_LIMITS.actions} actions per rule (filters/waits don't count), ${AUTOMATION_LIMITS.steps} steps, ${AUTOMATION_LIMITS.perCompany} rules per company.
Fields depend on the trigger — action 'guide' lists them per trigger (with types). Templates: {field}, {field|money}, {field|int}. Custom client fields: custom_<slug>. Webhook payload keys: data_<key>. After an atlas_draft step, {atlas_text} is available.
Never promise an action that isn't in the list. Never make a client message pushy or misleading — it goes out under the business's name.
Always run action 'test' first: it reports how often the rule WOULD have fired over the last 30 days so the user can sanity-check before confirming.`;
