import { randomBytes } from "crypto";
import { lookup } from "dns/promises";
import { prisma } from "./db";
import { notifyUsers, companyManagerIds } from "./push";
import { sendEmail, emailEnabled, companyEmailBlocked, clientMessageEmail, quoteLinkEmail, invoiceLinkEmail, paymentReminderEmail, appointmentReminderEmail } from "./email";
import { sendSms, canText, companyCanSendSms, quoteLinkText, invoiceLinkText, appointmentReminderText } from "./sms";
import { sendReviewRequest } from "./payments";
import { canChargeOnline } from "./payments-gate";
import { notifyClientOfReply } from "./portal-messages";
import { recordLeadWin, recordLeadLoss } from "./pipeline";
import { getActiveFieldDefs, sanitizeCustomFields } from "./contact-fields";
import { withDocNumberRetry } from "./doc-numbers";
import { dueDateFromTerms } from "./due-dates";
import { arrivalSlotLabel, resolveArrivalWindowMinutes } from "./arrival-window";
import { zonedMidnight, zonedParts } from "./timezone";
import { isPrivateIp } from "./website-check";
import { isQuickBooksConfigured, pushInvoice, pushEstimate, pushPayment } from "./quickbooks";
import { meteredOneShot } from "./atlas-oneshot";
import { quoteDepositAmount, money as moneyLabel } from "./statuses";
import { AUTOMATION_LIMITS, ATLAS_TEXT_FIELD, renderAction, type CompiledAutomation, type AutomationAction } from "./automations";
import { baseUrl, money, type Loaded } from "./automations-context";

/**
 * One `case` per allowlisted action (lib/automations.ts ACTIONS). Every case
 * goes through the same lib helper the app's own buttons use — the email
 * gates, the texting consent check, the review-request dedupe — and returns
 * a short line for the run log: "emailed s@x.com", "skipped: client has no
 * email", "failed: …". Nothing here charges, deletes, archives, or emits an
 * automation event; that is what keeps a rule from cascading.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_EMAILS_PER_CONTACT_PER_DAY = 3; // tighter than the human route's 10 — this is a robot
const MAX_EMAILS_PER_COMPANY_PER_DAY = 200; // shared with the human route's count
const MAX_TEXTS_PER_CONTACT_PER_DAY = 2;

export type AutomationRow = { id: string; companyId: string; name: string; createdById: string | null };

/** Whose behalf the rule acts on: its creator while they're active, else the owner. */
export async function actorUserId(companyId: string, createdById: string | null): Promise<string | null> {
  if (createdById) {
    const u = await prisma.user.findFirst({ where: { id: createdById, companyId, isActive: true }, select: { id: true } });
    if (u) return u.id;
  }
  const owner = await prisma.user.findFirst({ where: { companyId, role: "OWNER", isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return owner?.id ?? null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A local instant `daysOut` days from now at `hour` o'clock in the company's zone. */
function atLocalHour(tz: string, now: Date, daysOut: number, hour: number): Date {
  const p = zonedParts(tz, new Date(now.getTime() + daysOut * DAY));
  return new Date(zonedMidnight(tz, p.y, p.m, p.d).getTime() + hour * HOUR);
}

async function emailGate(companyId: string, contactId: string): Promise<string | null> {
  if (!emailEnabled()) return "skipped: email not configured";
  if (await companyEmailBlocked(companyId)) return "skipped: company email blocked";
  const since = new Date(Date.now() - DAY);
  const [toContact, byCompany] = await Promise.all([
    prisma.clientMessage.count({ where: { companyId, contactId, createdAt: { gte: since } } }),
    prisma.clientMessage.count({ where: { companyId, createdAt: { gte: since } } }),
  ]);
  if (toContact >= MAX_EMAILS_PER_CONTACT_PER_DAY) return `skipped: client already emailed ${MAX_EMAILS_PER_CONTACT_PER_DAY}× today`;
  if (byCompany >= MAX_EMAILS_PER_COMPANY_PER_DAY) return "skipped: company daily email cap";
  return null;
}

async function textGate(companyId: string, contact: NonNullable<Loaded["contact"]>): Promise<string | null> {
  if (!contact.phone) return "skipped: client has no phone";
  if (!canText(contact)) return "skipped: client can't be texted (opted out or texts off)";
  if (!(await companyCanSendSms(companyId))) return "skipped: texting isn't live on your line yet";
  const sent = await prisma.smsSend.count({ where: { companyId, contactId: contact.id, createdAt: { gte: new Date(Date.now() - DAY) } } });
  if (sent >= MAX_TEXTS_PER_CONTACT_PER_DAY) return `skipped: client already texted ${MAX_TEXTS_PER_CONTACT_PER_DAY}× today`;
  return null;
}

async function safeWebhookHost(url: string): Promise<string | null> {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "only https:// URLs";
    if (u.username || u.password) return "credentials in the URL aren't allowed";
    host = u.hostname;
  } catch {
    return "not a valid URL";
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "that host is private";
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) return "that host resolves to a private address";
  } catch {
    return "that host doesn't resolve";
  }
  return null;
}

export async function runAction(automation: AutomationRow, compiled: CompiledAutomation, index: number, loaded: Loaded, now = new Date()): Promise<string> {
  const step = compiled.spec.steps[index] as AutomationAction;
  const rendered = renderAction(compiled, index, loaded.ctx);
  const { companyId } = automation;
  const { company, contact } = loaded;
  const tz = company.timezone ?? "America/Chicago";
  const brand = { brandColor: company.brandColor, brandColorSecondary: company.brandColorSecondary, documentColor: company.documentColor, logoUrl: company.logoUrl };

  switch (step.type) {
    case "notify_team": {
      let ids: string[];
      if (step.to === "assigned") ids = loaded.assignedUserId ? [loaded.assignedUserId] : await companyManagerIds(companyId);
      else if (step.to === "everyone") ids = (await prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true } })).map((u) => u.id);
      else ids = await companyManagerIds(companyId);
      await notifyUsers(ids, { title: rendered.title.slice(0, 120), body: rendered.body?.slice(0, 500), url: loaded.link, tag: `automation-${automation.id}-${loaded.link}` });
      return `notified ${ids.length}`;
    }
    case "notify_user": {
      const u = await prisma.user.findFirst({ where: { id: String(step.userId), companyId, isActive: true }, select: { id: true, name: true } });
      if (!u) return "skipped: that team member is no longer active";
      await notifyUsers([u.id], { title: rendered.title.slice(0, 120), body: rendered.body?.slice(0, 500), url: loaded.link, tag: `automation-${automation.id}-${loaded.link}` });
      return `notified ${u.name}`;
    }
    case "email_client": {
      if (!contact?.email) return "skipped: client has no email";
      const gate = await emailGate(companyId, contact.id);
      if (gate) return gate;
      const senderId = await actorUserId(companyId, automation.createdById);
      const signature = [company.name, company.phone, company.website].filter(Boolean).join("\n");
      const subject = rendered.subject.slice(0, 150);
      const body = rendered.body.slice(0, 10_000);
      const message = await prisma.clientMessage.create({ data: { companyId, contactId: contact.id, senderId, subject, body, signature } });
      const email = clientMessageEmail({
        messageSubject: subject, messageBody: body, signature, logoUrl: company.logoUrl,
        readUrl: `${baseUrl()}/message/${message.publicToken}`, pixelUrl: `${baseUrl()}/api/public/open/${message.publicToken}`,
      });
      const sent = await sendEmail({ companyId, to: contact.email, subject: email.subject, html: email.html, replyTo: company.email || undefined, fromName: company.name, pageBackground: "#ffffff" });
      if (!sent) {
        await prisma.clientMessage.delete({ where: { id: message.id } }).catch(() => {});
        return "failed: email send failed";
      }
      return `emailed ${contact.email}`;
    }
    case "text_client": {
      if (!contact) return "skipped: no client";
      const gate = await textGate(companyId, contact);
      if (gate) return gate;
      const text = rendered.body.slice(0, 480);
      const ok = await sendSms({ companyId, contactId: contact.id, to: contact.phone!, text });
      return ok ? `texted ${contact.phone}` : "failed: text send failed";
    }
    case "portal_message": {
      if (!contact) return "skipped: no client";
      const senderId = await actorUserId(companyId, automation.createdById);
      const body = rendered.body.slice(0, 1000);
      const message = await prisma.portalMessage.create({ data: { companyId, contactId: contact.id, direction: "OUTBOUND", senderId, body, via: "portal" } });
      await notifyClientOfReply(
        {
          id: contact.id, companyId, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone,
          smsOptOut: contact.smsOptOut, smsDisabled: contact.smsDisabled, hubToken: contact.hubToken, assignedToId: contact.assignedToId,
          company: { name: company.name, email: company.email, logoUrl: company.logoUrl, brandColor: company.brandColor, brandColorSecondary: company.brandColorSecondary, documentColor: company.documentColor },
        },
        message.id,
        body
      );
      return "portal message sent";
    }
    case "email_address": {
      if (!emailEnabled()) return "skipped: email not configured";
      const to = String(step.to);
      const subject = rendered.subject.slice(0, 150);
      const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#111827;line-height:1.5;white-space:pre-wrap;">${esc(rendered.body.slice(0, 10_000))}</div><p style="margin-top:24px;color:#6b7280;font-size:12px;">Sent by the “${esc(automation.name)}” automation in ${esc(company.name)}’s WorkBench.</p>`;
      const sent = await sendEmail({ companyId, to, subject, html, replyTo: company.email || undefined, fromName: company.name });
      return sent ? `emailed ${to}` : "failed: email send failed";
    }
    case "send_quote_link": {
      const q = loaded.quote;
      if (!q || !contact) return "skipped: no quote";
      if (!["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(q.status)) return "skipped: the quote already has an answer";
      if (!contact.email) return "skipped: client has no email";
      if (!emailEnabled()) return "skipped: email not configured";
      if (await companyEmailBlocked(companyId)) return "skipped: company email blocked";
      const deposit = quoteDepositAmount({ total: Number(q.total), depositType: q.depositType, depositValue: q.depositValue == null ? null : Number(q.depositValue) });
      const viewUrl = `${baseUrl()}/quote/${q.publicToken}`;
      const { subject, html } = quoteLinkEmail({
        brand, companyName: company.name, quoteNumber: q.quoteNumber, total: Number(q.total), viewUrl,
        serviceNames: q.lineItems.filter((li) => !(li.isOptional && li.optedOut)).map((li) => li.name || li.description || "Service"),
        depositNote: deposit > 0 ? `A deposit of ${moneyLabel(deposit)} is due when you approve.` : undefined,
      });
      const emailed = await sendEmail({ companyId, to: contact.email, subject, html, replyTo: company.email || undefined, fromName: company.name });
      if (!emailed) return "failed: email send failed";
      let texted = false;
      if (contact.phone && canText(contact) && (await companyCanSendSms(companyId))) {
        texted = await sendSms({ companyId, contactId: contact.id, to: contact.phone, text: quoteLinkText({ companyName: company.name, firstName: contact.firstName, quoteNumber: q.quoteNumber, total: Number(q.total), viewUrl }) });
      }
      if (!q.sentAt) await prisma.quote.update({ where: { id: q.id }, data: { status: "AWAITING_RESPONSE", sentAt: now } });
      return `quote link emailed${texted ? " + texted" : ""}`;
    }
    case "send_pay_link": {
      const i = loaded.invoice;
      if (!i || !contact) return "skipped: no invoice";
      if (i.status === "PAID") return "skipped: already paid";
      if (i.status === "ARCHIVED") return "skipped: invoice archived";
      if (!contact.email) return "skipped: client has no email";
      if (!emailEnabled()) return "skipped: email not configured";
      if (await companyEmailBlocked(companyId)) return "skipped: company email blocked";
      const payable = canChargeOnline(company);
      const payUrl = `${baseUrl()}/pay/${i.publicToken}`;
      const { subject, html } = invoiceLinkEmail({ brand, companyName: company.name, invoiceNumber: i.invoiceNumber, total: Number(i.total), payUrl, serviceNames: i.lineItems.map((li) => li.name || li.description || "Service"), payable });
      const emailed = await sendEmail({ companyId, to: contact.email, subject, html, replyTo: company.email || undefined, fromName: company.name });
      if (!emailed) return "failed: email send failed";
      let texted = false;
      if (contact.phone && canText(contact) && (await companyCanSendSms(companyId))) {
        texted = await sendSms({ companyId, contactId: contact.id, to: contact.phone, text: invoiceLinkText({ companyName: company.name, firstName: contact.firstName, invoiceNumber: i.invoiceNumber, total: Number(i.total), payUrl, payable }) });
      }
      const patch = { ...(i.status === "DRAFT" ? { status: "AWAITING_PAYMENT" as const, issuedAt: now } : {}), ...(i.dueDate ? {} : { dueDate: dueDateFromTerms(now, contact.paymentTermsDays) }) };
      if (Object.keys(patch).length > 0) await prisma.invoice.update({ where: { id: i.id }, data: patch });
      return `pay link emailed${texted ? " + texted" : ""}`;
    }
    case "send_payment_reminder": {
      const i = loaded.invoice;
      if (!i || !contact) return "skipped: no invoice";
      if (!["AWAITING_PAYMENT", "PAST_DUE"].includes(i.status)) return `skipped: invoice is ${i.status.toLowerCase().replace("_", " ")}`;
      const balance = Number(loaded.ctx.invoice_balance ?? 0);
      if (balance <= 0) return "skipped: nothing owed";
      if (!contact.email) return "skipped: client has no email";
      if (!emailEnabled()) return "skipped: email not configured";
      if (await companyEmailBlocked(companyId)) return "skipped: company email blocked";
      const dueIn = Number(loaded.ctx.due_in_days ?? 0);
      const stage = dueIn >= 0 ? "due" : dueIn <= -14 ? "overdue_14" : dueIn <= -7 ? "overdue_7" : "overdue_3";
      const { subject, html } = paymentReminderEmail({
        brand, companyName: company.name, companyEmail: company.email, invoiceNumber: i.invoiceNumber, balance, payUrl: `${baseUrl()}/pay/${i.publicToken}`,
        dueDate: i.dueDate ?? now, stage, payable: canChargeOnline(company),
      });
      const sent = await sendEmail({ companyId, to: contact.email, subject, html, replyTo: company.email || undefined, fromName: company.name });
      return sent ? `reminder emailed (${stage.replace("_", " ")})` : "failed: email send failed";
    }
    case "send_appointment_reminder": {
      const a = loaded.appointment;
      if (!a || !contact) return "skipped: no appointment";
      if (a.status !== "SCHEDULED") return `skipped: appointment is ${a.status.toLowerCase().replace("_", " ")}`;
      if (a.scheduledAt.getTime() <= now.getTime()) return "skipped: appointment already started";
      const stage: "day" | "hour" = a.scheduledAt.getTime() - now.getTime() <= 2 * HOUR ? "hour" : "day";
      const windowMinutes = a.type === "IN_PERSON" ? resolveArrivalWindowMinutes(a.arrivalWindowMinutes, company.arrivalWindowMinutes) : 0;
      const windowLabel = arrivalSlotLabel(tz, a.scheduledAt, windowMinutes);
      const args = { companyName: company.name, firstName: contact.firstName, serviceName: a.title, windowLabel, address: a.type === "IN_PERSON" ? a.address : null, stage };
      if (contact.phone && canText(contact) && (await companyCanSendSms(companyId))) {
        const ok = await sendSms({ companyId, contactId: contact.id, to: contact.phone, text: appointmentReminderText(args) });
        if (ok) return `reminder texted (${stage})`;
      }
      if (!contact.email) return "skipped: client can't be texted and has no email";
      if (!emailEnabled()) return "skipped: email not configured";
      if (await companyEmailBlocked(companyId)) return "skipped: company email blocked";
      const { subject, html } = appointmentReminderEmail({ brand, companyName: company.name, companyEmail: company.email, contactFirstName: contact.firstName, serviceName: a.title, windowLabel, address: args.address, stage });
      const sent = await sendEmail({ companyId, to: contact.email, subject, html, replyTo: company.email || undefined, fromName: company.name });
      return sent ? `reminder emailed (${stage})` : "failed: email send failed";
    }
    case "request_review": {
      if (!contact?.email) return "skipped: client has no email";
      if (!company.reviewLink) return "skipped: no review link set";
      await sendReviewRequest({ companyId, contactId: contact.id, jobId: loaded.jobId, email: contact.email, contactFirstName: contact.firstName, jobTitle: loaded.jobTitle, quiet: true });
      return "review request sent (or already sent recently)";
    }
    case "add_client_note": {
      if (!contact) return "skipped: no client";
      const userId = await actorUserId(companyId, automation.createdById);
      if (!userId) return "skipped: no active owner to author the note";
      await prisma.contactNote.create({ data: { contactId: contact.id, userId, body: `[${automation.name}] ${rendered.body}`.slice(0, 2000) } });
      return "note added";
    }
    case "add_job_note": {
      if (!loaded.jobId) return "skipped: no job";
      const userId = await actorUserId(companyId, automation.createdById);
      if (!userId) return "skipped: no active owner to author the note";
      await prisma.jobNote.create({ data: { jobId: loaded.jobId, userId, body: `[${automation.name}] ${rendered.body}`.slice(0, 2000) } });
      return "job note added";
    }
    case "move_lead": {
      if (!contact) return "skipped: no client";
      const stage = await prisma.pipelineStage.findFirst({ where: { companyId, isConverted: false, name: { equals: String(step.stageName), mode: "insensitive" } }, select: { id: true, name: true } });
      if (!stage) return `skipped: no stage named "${step.stageName}"`;
      if (contact.pipelineStageId === stage.id) return "skipped: already in that stage";
      if (!contact.pipelineStageId) return "skipped: client is not on the leads board";
      const first = await prisma.contact.findFirst({ where: { companyId, pipelineStageId: stage.id }, orderBy: { pipelineOrder: "asc" }, select: { pipelineOrder: true } });
      await prisma.contact.update({ where: { id: contact.id }, data: { pipelineStageId: stage.id, pipelineOrder: (first?.pipelineOrder ?? 1) - 1, stageChangedAt: now } });
      return `moved to ${stage.name}`;
    }
    case "set_lead_outcome": {
      if (!contact) return "skipped: no client";
      if (step.outcome === "won") {
        if (contact.status !== "LEAD" && !contact.pipelineStageId) return "skipped: not a lead on the board";
        // Inside a transaction lib/pipeline returns the move instead of firing
        // lead.won — actions never emit events, so rules can't cascade
        await prisma.$transaction((tx) => recordLeadWin(tx, companyId, { id: contact.id, status: contact.status, pipelineStageId: contact.pipelineStageId }));
        return "lead marked won";
      }
      if (!contact.pipelineStageId) return "skipped: not on the leads board";
      await prisma.$transaction((tx) => recordLeadLoss(tx, { id: contact.id, status: contact.status }, step.reason ? String(step.reason) : null));
      return "lead marked lost";
    }
    case "set_custom_field": {
      if (!contact) return "skipped: no client";
      const defs = await getActiveFieldDefs(companyId);
      const def = defs.find((d) => d.id === String(step.fieldId));
      if (!def) return "skipped: that custom field no longer exists";
      const sanitized = sanitizeCustomFields({ [def.id]: rendered.value ?? "" }, defs);
      if (!(def.id in sanitized)) return `skipped: "${rendered.value}" isn't a valid value for ${def.label}`;
      const existing = (contact.customFields && typeof contact.customFields === "object" ? contact.customFields : {}) as Record<string, string>;
      await prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...existing, ...sanitized } } });
      return `${def.label} set`;
    }
    case "assign_job": {
      if (!loaded.jobId) return "skipped: no job";
      const u = await prisma.user.findFirst({ where: { id: String(step.userId), companyId, isActive: true }, select: { id: true, name: true } });
      if (!u) return "skipped: that team member is no longer active";
      const already = await prisma.jobAssignment.findFirst({ where: { jobId: loaded.jobId, userId: u.id }, select: { id: true } });
      if (already) return `skipped: ${u.name} is already on the job`;
      await prisma.jobAssignment.create({ data: { jobId: loaded.jobId, userId: u.id } });
      return `assigned to ${u.name}`;
    }
    case "add_checklist_item": {
      if (!loaded.jobId) return "skipped: no job";
      const label = rendered.label.slice(0, 120);
      const dup = await prisma.jobChecklistItem.findFirst({ where: { jobId: loaded.jobId, sourceName: "", label }, select: { id: true } });
      if (dup) return "skipped: that checklist item is already on the job";
      const last = await prisma.jobChecklistItem.findFirst({ where: { jobId: loaded.jobId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      await prisma.jobChecklistItem.create({ data: { jobId: loaded.jobId, label, sourceName: "", sortOrder: (last?.sortOrder ?? -1) + 1 } });
      return "checklist item added";
    }
    case "create_request": {
      if (!contact) return "skipped: no client";
      const r = await withDocNumberRetry(async () => {
        const last = await prisma.request.findFirst({ where: { companyId }, orderBy: { requestNumber: "desc" }, select: { requestNumber: true } });
        return prisma.request.create({
          data: { companyId, contactId: contact.id, requestNumber: (last?.requestNumber ?? 0) + 1, title: rendered.title.slice(0, 120), details: rendered.details?.slice(0, 1000) || null, source: "internal" },
          select: { requestNumber: true },
        });
      });
      return `request #${r.requestNumber} created`;
    }
    case "create_appointment": {
      if (!contact) return "skipped: no client";
      const daysOut = Number(step.daysOut ?? 0);
      const hour = Number(step.hour ?? 9);
      const when = atLocalHour(tz, now, daysOut, hour);
      let assignedToId: string | null = null;
      if (loaded.assignedUserId) {
        const u = await prisma.user.findFirst({ where: { id: loaded.assignedUserId, companyId, isActive: true, role: { not: "TECH" } }, select: { id: true } });
        assignedToId = u?.id ?? null;
      }
      if (!assignedToId) assignedToId = await actorUserId(companyId, automation.createdById);
      if (!assignedToId) return "skipped: nobody to assign it to";
      const kind = String(step.kind ?? "PHONE_CALL") as "PHONE_CALL" | "VIDEO_CALL" | "IN_PERSON";
      const a = await withDocNumberRetry(async () => {
        const last = await prisma.appointment.findFirst({ where: { companyId }, orderBy: { appointmentNumber: "desc" }, select: { appointmentNumber: true } });
        return prisma.appointment.create({
          data: {
            companyId, contactId: contact.id, assignedToId, appointmentNumber: (last?.appointmentNumber ?? 0) + 1, title: rendered.title.slice(0, 120), type: kind,
            scheduledAt: when, scheduledEnd: new Date(when.getTime() + HOUR), address: kind === "IN_PERSON" ? loaded.job?.address ?? null : null,
          },
          select: { appointmentNumber: true },
        });
      });
      return `appointment #${a.appointmentNumber} booked for ${when.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric" })}`;
    }
    case "create_quote_draft": {
      if (!contact) return "skipped: no client";
      const q = await withDocNumberRetry(async () => {
        const last = await prisma.quote.findFirst({ where: { companyId }, orderBy: { quoteNumber: "desc" }, select: { quoteNumber: true } });
        return prisma.quote.create({
          data: { companyId, contactId: contact.id, quoteNumber: (last?.quoteNumber ?? 0) + 1, title: rendered.title.slice(0, 120), status: "DRAFT", subtotal: 0, total: 0, requestId: null },
          select: { quoteNumber: true },
        });
      });
      return `draft quote #${q.quoteNumber} created`;
    }
    case "create_invoice_draft": {
      const j = loaded.job;
      if (!j) return "skipped: no job";
      const existing = await prisma.invoice.findFirst({ where: { jobId: j.id }, select: { invoiceNumber: true } });
      if (existing) return `skipped: job already has invoice #${existing.invoiceNumber}`;
      if (j.lineItems.length === 0) return "skipped: the job has no line items";
      const subtotal = money(j.lineItems.reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0));
      const inv = await withDocNumberRetry(async () => {
        const last = await prisma.invoice.findFirst({ where: { companyId }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } });
        return prisma.invoice.create({
          data: {
            companyId, contactId: j.contactId, jobId: j.id, publicToken: randomBytes(24).toString("hex"), invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
            subject: j.title, status: "DRAFT", subtotal, total: subtotal,
            lineItems: {
              create: j.lineItems.map((li) => ({
                name: li.name, description: li.description || li.name, quantity: Number(li.quantity), unitCost: li.unitCost == null ? null : Number(li.unitCost), unitPrice: Number(li.unitPrice),
                total: money(Number(li.quantity) * Number(li.unitPrice)), workItemId: li.workItemId, recurringInterval: (li.recurringInterval as never) ?? null, sortOrder: li.sortOrder,
              })),
            },
          },
          select: { invoiceNumber: true },
        });
      });
      return `draft invoice #${inv.invoiceNumber} created`;
    }
    case "create_agreement": {
      if (!contact) return "skipped: no client";
      const template = await prisma.contractTemplate.findFirst({ where: { id: String(step.templateId), companyId, isActive: true } });
      if (!template) return "skipped: that agreement template no longer exists";
      const today = now.toLocaleDateString("en-US", { timeZone: tz, month: "long", day: "numeric", year: "numeric" });
      const text = template.body
        .replaceAll("{{client_name}}", `${contact.firstName} ${contact.lastName}`.trim())
        .replaceAll("{{company_name}}", company.name)
        .replaceAll("{{date}}", today);
      const k = await withDocNumberRetry(async () => {
        const last = await prisma.contract.findFirst({ where: { companyId }, orderBy: { contractNumber: "desc" }, select: { contractNumber: true } });
        return prisma.contract.create({
          data: { companyId, contactId: contact.id, contractNumber: (last?.contractNumber ?? 0) + 1, publicToken: randomBytes(24).toString("hex"), templateId: template.id, quoteId: loaded.quote?.id ?? null, title: template.name, body: text, status: "DRAFT" },
          select: { contractNumber: true },
        });
      });
      return `draft agreement #${k.contractNumber} created`;
    }
    case "create_time_block": {
      const createdById = await actorUserId(companyId, automation.createdById);
      if (!createdById) return "skipped: no active owner";
      let userId = loaded.assignedUserId;
      if (userId) {
        const u = await prisma.user.findFirst({ where: { id: userId, companyId, isActive: true }, select: { id: true } });
        userId = u?.id ?? null;
      }
      const startAt = atLocalHour(tz, now, Number(step.daysOut ?? 1), Number(step.hour ?? 9));
      await prisma.timeBlock.create({ data: { companyId, userId: userId ?? createdById, createdById, title: rendered.title.slice(0, 120), startAt, endAt: new Date(startAt.getTime() + HOUR) } });
      return `follow-up on the schedule for ${startAt.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric" })}`;
    }
    case "push_to_quickbooks": {
      if (!isQuickBooksConfigured()) return "skipped: QuickBooks isn't available on this server";
      const connection = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
      if (!connection) return "skipped: QuickBooks isn't connected";
      if (loaded.paymentId) {
        const id = await pushPayment(connection, loaded.paymentId);
        return id ? "payment pushed to QuickBooks" : "skipped: payment not syncable";
      }
      if (loaded.invoice) {
        const id = await pushInvoice(connection, loaded.invoice.id);
        return id ? "invoice pushed to QuickBooks" : "skipped: draft invoices don't sync";
      }
      if (loaded.quote) {
        const id = await pushEstimate(connection, loaded.quote.id);
        return id ? "estimate pushed to QuickBooks" : "skipped: draft quotes don't sync";
      }
      return "skipped: nothing to push";
    }
    case "send_webhook": {
      const url = String(step.url);
      const problem = await safeWebhookHost(url);
      if (problem) return `skipped: ${problem}`;
      const body = JSON.stringify({ event: compiled.spec.trigger.event, entityType: compiled.entity, link: `${baseUrl()}${loaded.link}`, fields: loaded.ctx, automation: { id: automation.id, name: automation.name }, sentAt: now.toISOString() });
      if (Buffer.byteLength(body) > AUTOMATION_LIMITS.webhookBodyBytes) return "skipped: payload too large";
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), AUTOMATION_LIMITS.webhookTimeoutMs);
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "WorkBench-Automations/1" }, body, redirect: "manual", signal: ctl.signal });
        return res.ok ? `sent (HTTP ${res.status})` : `failed: HTTP ${res.status}`;
      } catch (e) {
        return `failed: ${e instanceof Error && e.name === "AbortError" ? "timed out" : "couldn't reach the URL"}`;
      } finally {
        clearTimeout(timer);
      }
    }
    case "atlas_draft": {
      const userId = await actorUserId(companyId, automation.createdById);
      if (!userId) return "skipped: no active owner to bill";
      const res = await meteredOneShot(
        { id: userId, companyId },
        {
          kind: "automation",
          system: `You write short, warm, plain-English text for a home-service business (${company.name}). Return only the text — no preamble, no quotes, no sign-off unless asked.`,
          prompt: rendered.prompt.slice(0, 2000),
          maxOutputTokens: 400,
        }
      );
      if (!res.ok) return `skipped: ${res.error}`;
      loaded.ctx[ATLAS_TEXT_FIELD] = res.text.slice(0, 2000);
      return `drafted ${res.text.length} chars`;
    }
  }
  return "skipped: unknown action";
}
