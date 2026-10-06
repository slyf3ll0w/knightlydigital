import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canChargeOnline } from "@/lib/payments-gate";
import { sendEmail, quoteLinkEmail, invoiceLinkEmail } from "@/lib/email";
import { sendSms, canText, companyCanSendSms, quoteLinkText, invoiceLinkText } from "@/lib/sms";
import { quoteDepositAmount, money } from "@/lib/statuses";
import { autoSendQuoteAgreements } from "@/lib/agreements";
import { autoAdvance } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";
import { dueDateFromTerms } from "@/lib/due-dates";
import { inPreview } from "@/lib/preview";
import { notifyUser } from "@/lib/push";
import { reportError } from "@/lib/report-error";
import type { SendChannels } from "@/lib/send-channels";
import { parseDue } from "@/lib/tasks";

/**
 * The one way a quote or an invoice goes out to a client — used by the Send
 * button (the two POST routes keep auth, rate limit and request parsing and
 * call in here) and by the Send-later sweep (`runScheduledSends`), so the
 * scheduled path does exactly what the button does: same channel checks,
 * agreements auto-send, pipeline advance, automations, and the sent /
 * issued / due stamps taken at the moment of sending.
 *
 * Plan: docs/plans/tasks-schedule-send-sticky-notes-2026-10-03.md § 2.
 */

export type DocumentKind = "quote" | "invoice";

export type SendResult =
  | { ok: true; emailed: boolean; texted: boolean; to: string | null; phone: string | null }
  | { ok: false; status: 400 | 404 | 424; error: string };

const QUOTE_SENDABLE = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"];

/** Clears a pending Send later — written by every send and by Cancel. */
export const CLEAR = { scheduledSendAt: null, scheduledSendById: null, scheduledSendChannels: Prisma.DbNull };

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
}

export async function sendQuote(opts: {
  id: string;
  companyId: string;
  /** Extra row filter (the route's viaContactScope); the sweep passes none. */
  scope?: Record<string, unknown>;
  channels: SendChannels;
}): Promise<SendResult> {
  const quote = await prisma.quote.findFirst({
    where: { id: opts.id, companyId: opts.companyId, ...(opts.scope ?? {}) },
    include: { contact: true, company: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) return { ok: false, status: 404, error: "Quote not found." };
  if (!QUOTE_SENDABLE.includes(quote.status)) {
    return { ok: false, status: 400, error: "This quote already has a client response — nothing to send." };
  }
  const contact = quote.contact;
  const textable =
    opts.channels.text && Boolean(contact.phone) && canText(contact) && (await companyCanSendSms(quote.companyId));
  const emailable = opts.channels.email && Boolean(contact.email);
  if (!emailable && !textable) {
    return {
      ok: false,
      status: 400,
      error: "This client has no email or textable phone on file — add one, or share the quote with Copy client link.",
    };
  }

  const viewUrl = `${baseUrl()}/quote/${quote.publicToken}`;
  const deposit = quoteDepositAmount({
    total: Number(quote.total),
    depositType: quote.depositType,
    depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
  });
  const { subject, html } = quoteLinkEmail({
    brand: quote.company,
    companyName: quote.company.name,
    quoteNumber: quote.quoteNumber,
    total: Number(quote.total),
    viewUrl,
    serviceNames: quote.lineItems
      .filter((li) => !(li.isOptional && li.optedOut))
      .map((li) => li.name || li.description || "Service"),
    depositNote: deposit > 0 ? `A deposit of ${money(deposit)} is due when you approve.` : undefined,
  });

  const emailed =
    emailable && contact.email
      ? await sendEmail({
          companyId: quote.companyId,
          to: contact.email,
          subject,
          html,
          replyTo: quote.company.email || undefined,
          fromName: quote.company.name,
        })
      : false;
  let texted = false;
  if (textable && contact.phone) {
    texted = await sendSms({
      companyId: quote.companyId,
      contactId: quote.contactId,
      to: contact.phone,
      text: quoteLinkText({
        companyName: quote.company.name,
        firstName: contact.firstName,
        quoteNumber: quote.quoteNumber,
        total: Number(quote.total),
        viewUrl,
      }),
    });
  }
  if (!emailed && !texted) {
    return {
      ok: false,
      status: 424,
      error: emailable
        ? "Email isn't set up on this server yet — share the quote with Copy client link instead."
        : "The text didn't go out — check Text Notifications in Settings → Phone & texting, or share the quote with Copy client link.",
    };
  }

  const justSent = !quote.sentAt;
  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      // A re-sent change-request goes back to Awaiting Response — the client
      // has a fresh document to review
      ...((quote.status === "DRAFT" || quote.status === "CHANGES_REQUESTED") && { status: "AWAITING_RESPONSE" }),
      ...(justSent && { sentAt: new Date() }),
      // A manual send supersedes a pending Send later
      ...CLEAR,
    },
  });
  // Sending the quote auto-issues any attached agreements set to "with quote"
  if (justSent) await autoSendQuoteAgreements(quote.id, "WITH_QUOTE");
  // Pipeline board: a sent quote advances the lead's card
  await autoAdvance(prisma, quote.companyId, quote.contactId, "QUOTE_SENT");
  if (justSent) fireAutomations(quote.companyId, "quote.sent", quote.id);

  return { ok: true, emailed, texted, to: emailed ? contact.email : null, phone: texted ? contact.phone : null };
}

export async function sendInvoice(opts: {
  id: string;
  companyId: string;
  scope?: Record<string, unknown>;
  channels: SendChannels;
}): Promise<SendResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: opts.id, companyId: opts.companyId, ...(opts.scope ?? {}) },
    include: { contact: true, company: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) return { ok: false, status: 404, error: "Invoice not found." };
  if (invoice.status === "PAID") return { ok: false, status: 400, error: "This invoice is already paid." };

  const contact = invoice.contact;
  const textable =
    opts.channels.text && Boolean(contact?.phone) && canText(contact!) && (await companyCanSendSms(invoice.companyId));
  const emailable = opts.channels.email && Boolean(contact?.email);
  if (!contact || (!emailable && !textable)) {
    return {
      ok: false,
      status: 400,
      error: "This client has no email or textable phone on file — add one, or share the invoice with Copy payment link.",
    };
  }

  const payUrl = `${baseUrl()}/pay/${invoice.publicToken}`;
  // No online payments for this company → the link views, it doesn't pay.
  const payable = canChargeOnline(invoice.company);
  const { subject, html } = invoiceLinkEmail({
    brand: invoice.company,
    companyName: invoice.company.name,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total),
    payUrl,
    serviceNames: invoice.lineItems.map((li) => li.name || li.description || "Service"),
    payable,
  });

  const emailed =
    emailable && contact.email
      ? await sendEmail({
          companyId: invoice.companyId,
          to: contact.email,
          subject,
          html,
          replyTo: invoice.company.email || undefined,
          fromName: invoice.company.name,
        })
      : false;
  let texted = false;
  if (textable && contact.phone) {
    texted = await sendSms({
      companyId: invoice.companyId,
      contactId: invoice.contactId,
      to: contact.phone,
      text: invoiceLinkText({
        companyName: invoice.company.name,
        firstName: contact.firstName,
        invoiceNumber: invoice.invoiceNumber,
        total: Number(invoice.total),
        payUrl,
        payable,
      }),
    });
  }
  if (!emailed && !texted) {
    return {
      ok: false,
      status: 424,
      error: contact.email
        ? "Email isn't set up on this server yet — share the invoice with Copy payment link instead."
        : "The text didn't go out — check Text Notifications in Settings → Phone & texting, or share the invoice with Copy payment link.",
    };
  }

  // Sending IS issuing: stamp the dates a drafted engine invoice (or any
  // draft) never got, so A/R aging, the PAST_DUE flip, and payment reminders
  // can see it. Dates already set are left alone.
  const now = new Date();
  const patch = {
    ...(invoice.status === "DRAFT" ? { status: "AWAITING_PAYMENT" as const } : {}),
    ...(invoice.issuedAt ? {} : { issuedAt: now }),
    ...(invoice.dueDate ? {} : { dueDate: dueDateFromTerms(now, contact.paymentTermsDays) }),
  };
  await prisma.invoice.update({ where: { id: invoice.id }, data: { ...patch, ...CLEAR } });
  // First send only (a re-send of an issued invoice is a reminder, not a send)
  if (invoice.status === "DRAFT") fireAutomations(invoice.companyId, "invoice.sent", invoice.id);

  return { ok: true, emailed, texted, to: contact.email, phone: texted ? contact.phone : null };
}

// ── Send later ──────────────────────────────────────────────────────────────

import { SCHEDULE_WARNING_TEXT, type ScheduleWarning } from "@/lib/send-later-shared";
export { SCHEDULE_WARNING_TEXT, type ScheduleWarning };

/**
 * What to tell the sender at scheduling time (pure, unit-tested):
 *  - past: the time has already gone by — it goes out on the next tick;
 *  - expires_first: a quote whose validUntil is earlier than the send time;
 *  - unreachable: no chosen channel can reach the client right now (it can
 *    still be scheduled — they may add an email — but it will fail then).
 */
export function scheduleSendWarnings(input: {
  at: Date;
  now: Date;
  validUntil?: Date | null;
  emailable: boolean;
  textable: boolean;
}): ScheduleWarning[] {
  const out: ScheduleWarning[] = [];
  if (input.at.getTime() <= input.now.getTime()) out.push("past");
  if (input.validUntil && input.validUntil.getTime() < input.at.getTime()) out.push("expires_first");
  if (!input.emailable && !input.textable) out.push("unreachable");
  return out;
}

export function channelsFromJson(raw: unknown, defaults: SendChannels): SendChannels {
  const o = (raw ?? {}) as Partial<Record<keyof SendChannels, unknown>>;
  return {
    email: typeof o.email === "boolean" ? o.email : defaults.email,
    text: typeof o.text === "boolean" ? o.text : defaults.text,
  };
}

/** The route-level defaults, mirrored from the two send routes. */
export const SEND_DEFAULTS: Record<DocumentKind, SendChannels> = {
  quote: { email: true, text: false },
  invoice: { email: true, text: true },
};

export interface ScheduledSendSummary {
  checked: number;
  sent: number;
  failed: number;
  errors: number;
}


/**
 * Send-later sweep: every quote / invoice whose scheduled instant has
 * passed. Runs from the 5-minute ticker and the hourly cron; each row is
 * claimed by compare-and-set on scheduledSendAt (and cleared in the same
 * write), so the two never send twice and a crash mid-send leaves nothing
 * to resend by itself. The person who scheduled it gets a bell card either
 * way: "Quote #1042 sent to Maria" or "Couldn't send quote #1042: …" with
 * a tap into the document to fix and resend.
 */
export async function runScheduledSends(now: Date = new Date()): Promise<ScheduledSendSummary> {
  const summary: ScheduledSendSummary = { checked: 0, sent: 0, failed: 0, errors: 0 };

  const quotes = await prisma.quote.findMany({
    where: { scheduledSendAt: { lte: now }, company: { is: { suspendedAt: null } } },
    select: {
      id: true,
      companyId: true,
      quoteNumber: true,
      scheduledSendAt: true,
      scheduledSendById: true,
      scheduledSendChannels: true,
      contact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { scheduledSendAt: "asc" },
    take: 200,
  });
  const invoices = await prisma.invoice.findMany({
    where: { scheduledSendAt: { lte: now }, company: { is: { suspendedAt: null } } },
    select: {
      id: true,
      companyId: true,
      invoiceNumber: true,
      scheduledSendAt: true,
      scheduledSendById: true,
      scheduledSendChannels: true,
      contact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { scheduledSendAt: "asc" },
    take: 200,
  });
  summary.checked = quotes.length + invoices.length;

  const jobs: {
    kind: DocumentKind;
    id: string;
    companyId: string;
    number: number;
    at: Date | null;
    byId: string | null;
    channels: SendChannels;
    clientName: string;
  }[] = [
    ...quotes.map((q) => ({
      kind: "quote" as const,
      id: q.id,
      companyId: q.companyId,
      number: q.quoteNumber,
      at: q.scheduledSendAt,
      byId: q.scheduledSendById,
      channels: channelsFromJson(q.scheduledSendChannels, SEND_DEFAULTS.quote),
      clientName: `${q.contact.firstName} ${q.contact.lastName}`.trim(),
    })),
    ...invoices.map((i) => ({
      kind: "invoice" as const,
      id: i.id,
      companyId: i.companyId,
      number: i.invoiceNumber,
      at: i.scheduledSendAt,
      byId: i.scheduledSendById,
      channels: channelsFromJson(i.scheduledSendChannels, SEND_DEFAULTS.invoice),
      clientName: i.contact ? `${i.contact.firstName} ${i.contact.lastName}`.trim() : "the client",
    })),
  ];

  for (const job of jobs) {
    try {
      if (!job.at) continue;
      // Claim: only the sweep that sees the stored instant clears it
      const claimed =
        job.kind === "quote"
          ? await prisma.quote.updateMany({ where: { id: job.id, scheduledSendAt: job.at }, data: CLEAR })
          : await prisma.invoice.updateMany({ where: { id: job.id, scheduledSendAt: job.at }, data: CLEAR });
      if (claimed.count === 0) continue;

      const label = `${job.kind === "quote" ? "Quote" : "Invoice"} #${job.number}`;
      const url = `/app/${job.kind}s/${job.id}`;
      const result: SendResult = (await inPreview(job.companyId))
        ? { ok: false, status: 400, error: "this is a preview account" }
        : job.kind === "quote"
          ? await sendQuote({ id: job.id, companyId: job.companyId, channels: job.channels })
          : await sendInvoice({ id: job.id, companyId: job.companyId, channels: job.channels });

      if (result.ok) {
        summary.sent++;
        const how = [result.emailed ? `emailed ${result.to}` : null, result.texted ? `texted ${result.phone}` : null]
          .filter(Boolean)
          .join(" · ");
        if (job.byId) {
          await notifyUser(job.byId, {
            title: `${label} sent to ${job.clientName || "the client"}`,
            body: how || undefined,
            url,
            tag: `scheduled-send-${job.kind}-${job.id}`,
          });
        }
      } else {
        summary.failed++;
        if (job.byId) {
          await notifyUser(job.byId, {
            title: `Couldn't send ${label.toLowerCase()}`,
            body: `${result.error} It's still a draft — open it to fix and send.`,
            url,
            tag: `scheduled-send-${job.kind}-${job.id}`,
          });
        }
      }
    } catch (err) {
      summary.errors++;
      reportError("[send-later] sweep failed for", job.kind, job.id, err);
    }
  }
  return summary;
}

// ── Scheduling (the two schedule-send routes and Atlas call these) ──────────

export type ScheduleOutcome = { status: number; json: Record<string, unknown> };

function fmtScheduled(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/**
 * Park a draft to go out later. Body: { date: "YYYY-MM-DD", time: "HH:mm" }
 * (wall clock in the company's zone) or { at: ISO }, plus optional
 * { email, text }. The document must still be sendable (same rule as the
 * Send button); an unreachable client or a time in the past is allowed but
 * answered with a warning, so the sender can decide.
 */
export async function scheduleDocumentSend(opts: {
  kind: DocumentKind;
  id: string;
  companyId: string;
  scope: Record<string, unknown>;
  actorId: string;
  body: Record<string, unknown>;
  tz: string;
  now?: Date;
}): Promise<ScheduleOutcome> {
  const now = opts.now ?? new Date();
  let at: Date | null = null;
  if (typeof opts.body.at === "string" && opts.body.at) {
    at = new Date(opts.body.at);
  } else {
    const parsed = parseDue(opts.body.date ?? null, opts.body.time ?? null, opts.tz);
    if (!parsed || "error" in parsed || parsed.allDay) {
      return { status: 400, json: { error: "Pick a date and a time to send." } };
    }
    at = parsed.dueAt;
  }
  if (!at || isNaN(at.getTime())) return { status: 400, json: { error: "That send time doesn't look right." } };
  if (at.getTime() > now.getTime() + 366 * 86_400_000) {
    return { status: 400, json: { error: "Pick a time within the next year." } };
  }
  const channels = channelsFromJson(opts.body, SEND_DEFAULTS[opts.kind]);
  if (!channels.email && !channels.text) return { status: 400, json: { error: "Pick email, text, or both." } };

  if (opts.kind === "quote") {
    const q = await prisma.quote.findFirst({
      where: { id: opts.id, companyId: opts.companyId, ...opts.scope },
      select: { id: true, status: true, validUntil: true, contact: { select: { email: true, phone: true, smsOptOut: true, smsDisabled: true } } },
    });
    if (!q) return { status: 404, json: { error: "Quote not found." } };
    if (!QUOTE_SENDABLE.includes(q.status)) {
      return { status: 400, json: { error: "This quote already has a client response — nothing to send." } };
    }
    const emailable = channels.email && Boolean(q.contact.email);
    const textable = channels.text && Boolean(q.contact.phone) && canText(q.contact) && (await companyCanSendSms(opts.companyId));
    const warnings = scheduleSendWarnings({ at, now, validUntil: q.validUntil, emailable, textable });
    await prisma.quote.update({
      where: { id: q.id },
      data: { scheduledSendAt: at, scheduledSendById: opts.actorId, scheduledSendChannels: channels },
    });
    return { status: 200, json: { scheduledSendAt: at.toISOString(), label: fmtScheduled(opts.tz, at), channels, warnings } };
  }

  const inv = await prisma.invoice.findFirst({
    where: { id: opts.id, companyId: opts.companyId, ...opts.scope },
    select: { id: true, status: true, contact: { select: { email: true, phone: true, smsOptOut: true, smsDisabled: true } } },
  });
  if (!inv) return { status: 404, json: { error: "Invoice not found." } };
  if (inv.status === "PAID") return { status: 400, json: { error: "This invoice is already paid." } };
  const emailable = channels.email && Boolean(inv.contact?.email);
  const textable =
    channels.text && Boolean(inv.contact?.phone) && Boolean(inv.contact && canText(inv.contact)) && (await companyCanSendSms(opts.companyId));
  const warnings = scheduleSendWarnings({ at, now, emailable, textable });
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { scheduledSendAt: at, scheduledSendById: opts.actorId, scheduledSendChannels: channels },
  });
  return { status: 200, json: { scheduledSendAt: at.toISOString(), label: fmtScheduled(opts.tz, at), channels, warnings } };
}

/** Cancel a pending Send later; the document stays a draft. */
export async function cancelScheduledSend(opts: {
  kind: DocumentKind;
  id: string;
  companyId: string;
  scope: Record<string, unknown>;
}): Promise<ScheduleOutcome> {
  const where = { id: opts.id, companyId: opts.companyId, ...opts.scope };
  const r =
    opts.kind === "quote"
      ? await prisma.quote.updateMany({ where, data: CLEAR })
      : await prisma.invoice.updateMany({ where, data: CLEAR });
  if (r.count === 0) return { status: 404, json: { error: "Not found." } };
  return { status: 200, json: { ok: true } };
}

/** The "Scheduled for Fri, Oct 10 · 9:00 AM" line for a detail page. */
export function scheduledLine(tz: string, at: Date | null | undefined): string | null {
  return at ? fmtScheduled(tz, at) : null;
}
