import { reportError } from "@/lib/report-error";
/**
 * Automated payment reminders (dunning).
 *
 * A daily sweep that chases unpaid invoices past their due date — both
 * subscription-generated and one-off. Reminders escalate in tone: a friendly
 * nudge on the due date, then notices at 3, 7, and 14 days overdue. Each stage
 * fires once (tracked via PaymentReminder rows) and the whole thing stops the
 * moment the balance hits zero. Email is Resend-gated, so until RESEND_API_KEY
 * is set every send is a no-op and nothing is recorded — the cadence simply
 * picks up once email is live.
 *
 * Runs from the same cron as the recurring engine (POST /api/cron/recurring).
 * When a processor is live and card-on-file exists, the recurring engine
 * already auto-charges; this covers everything that still needs a human to pay.
 */

import { Prisma } from "@prisma/client";
import { canChargeOnline } from "@/lib/payments-gate";
import { prisma } from "@/lib/db";
import {
  sendEmail,
  emailEnabled,
  companyEmailBlocked,
  paymentReminderEmail,
  appointmentReminderEmail,
  quoteFollowUpEmail,
} from "@/lib/email";
import { sendSms, smsEnabled, canText, appointmentReminderText, type MeetingKind } from "@/lib/sms";
import { notifyUser, notifyUsers } from "@/lib/push";
import { arrivalSlotLabel, arrivalTimeLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { HOUR_STAGE_MS, inSmsQuietHours, reminderStage } from "@/lib/reminder-stage";
import { pastDueFilter } from "@/lib/due-dates";
import { invoiceBalance } from "@/lib/payments";
import { fireAutomations } from "@/lib/automations-server";
import { completeAddress, composeAddress } from "@/lib/geocoding";

const DAY = 86400000;

/**
 * Per-run memo of the per-company email gate. A stage is claimed (one-shot,
 * never retried) BEFORE the send, so a company whose email is blocked — Finix
 * still PROVISIONING and payments not waived — must be skipped before the
 * claim, or every reminder that came due while they waited is burned.
 */
function emailGate(): (companyId: string) => Promise<boolean> {
  const memo = new Map<string, Promise<boolean>>();
  return (companyId) => {
    let p = memo.get(companyId);
    if (!p) {
      p = companyEmailBlocked(companyId);
      memo.set(companyId, p);
    }
    return p;
  };
}

// Ordered by threshold. Each invoice gets at most one email per run — the most
// advanced unsent stage — so an already-overdue invoice isn't spammed with the
// whole sequence at once.
const STAGES = [
  { type: "due", days: 0 },
  { type: "overdue_3", days: 3 },
  { type: "overdue_7", days: 7 },
  { type: "overdue_14", days: 14 },
] as const;

export interface ReminderSummary {
  checked: number;
  sent: number;
  markedPastDue: number;
  errors: number;
}

export async function runDueReminders(now: Date = new Date()): Promise<ReminderSummary> {
  // Flip awaiting invoices whose due day has fully passed to PAST_DUE (the
  // invoices list does this lazily on view; here we do it globally so statuses
  // are right even for companies no one has opened today). An invoice due
  // today is not late — see lib/due-dates.ts.
  // Ids first so each flipped invoice can fire its invoice.past_due automation
  const toFlip = await prisma.invoice.findMany({
    where: { status: "AWAITING_PAYMENT", dueDate: pastDueFilter(now) },
    select: { id: true, companyId: true },
  });
  const flipped = await prisma.invoice.updateMany({
    where: { id: { in: toFlip.map((i) => i.id) }, status: "AWAITING_PAYMENT" },
    data: { status: "PAST_DUE" },
  });
  for (const inv of toFlip) fireAutomations(inv.companyId, "invoice.past_due", inv.id);

  // Without Resend every send is a no-op — bail before claiming any stage so
  // the cadence simply picks up once email is live.
  if (!emailEnabled()) {
    return { checked: 0, sent: 0, markedPastDue: flipped.count, errors: 0 };
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] },
      dueDate: { not: null, lte: now },
      // Archived clients are closed out — no dunning
      contact: { is: { email: { not: null }, status: { not: "ARCHIVED" } } },
      company: { is: { suspendedAt: null } },
      // Only invoices with a stage that is DUE and UNSENT. Without this the
      // window below filled up with fully-reminded invoices that stay unpaid
      // for months, and once there were `take` of those, newer invoices were
      // never looked at again (found 2026-09-30). Mirrors the `eligible`
      // test in the loop exactly: daysPastDue >= s.days ⇔ dueDate <= now - s.days.
      OR: STAGES.map((s) => ({
        dueDate: { lte: new Date(now.getTime() - s.days * DAY) },
        reminders: { none: { type: s.type } },
      })),
    },
    // Newest-eligible first: an invoice that just crossed a threshold is at
    // the front, and the only rows that can sit in this set without ever
    // leaving it (companies whose email is still blocked) sink to the back.
    orderBy: { dueDate: "desc" },
    include: {
      payments: { select: { amount: true, surchargeAmount: true } },
      reminders: { select: { type: true } },
      contact: { select: { email: true } },
      company: {
        select: {
          name: true,
          email: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
          finixMerchantId: true,
          finixOnboardingState: true,
        },
      },
    },
    take: 1000,
  });

  const summary: ReminderSummary = { checked: invoices.length, sent: 0, markedPastDue: flipped.count, errors: 0 };
  const blocked = emailGate();

  for (const inv of invoices) {
    try {
      const balance = invoiceBalance(inv);
      if (balance <= 0 || !inv.contact?.email || !inv.dueDate) continue;
      // Company can't email yet: leave the stage unclaimed so it sends the
      // day they can, instead of vanishing.
      if (await blocked(inv.companyId)) continue;

      const daysPastDue = Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY);
      const sentTypes = new Set(inv.reminders.map((r) => r.type));
      // A "due today" nudge minutes after the invoice itself (Net-0 terms,
      // engine invoices issued this morning) reads as nagging — give the
      // invoice email a day to land before the reminder cadence starts.
      const issuedToday = !!inv.issuedAt && now.getTime() - inv.issuedAt.getTime() < DAY;
      const eligible = STAGES.filter(
        (s) =>
          daysPastDue >= s.days &&
          !sentTypes.has(s.type) &&
          !(s.type === "due" && issuedToday)
      );
      if (eligible.length === 0) continue;

      const stage = eligible[eligible.length - 1]; // most advanced unsent stage

      // Claim before sending: the @@unique([invoiceId, type]) constraint makes
      // this create the atomic lock, so overlapping or retried cron runs can't
      // both send the same stage. A claim whose send then fails is left in
      // place (logged, never retried) — a missed reminder beats double-emailing
      // the client.
      try {
        await prisma.paymentReminder.create({
          data: { invoiceId: inv.id, type: stage.type, sentAt: now },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
      if (eligible.length > 1) {
        // Mark all earlier passed stages too so we never back-fill them.
        await prisma.paymentReminder.createMany({
          data: eligible.slice(0, -1).map((s) => ({ invoiceId: inv.id, type: s.type, sentAt: now })),
          skipDuplicates: true,
        });
      }

      const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
      const { subject, html } = paymentReminderEmail({
        brand: inv.company,
        companyName: inv.company.name,
        companyEmail: inv.company.email,
        invoiceNumber: inv.invoiceNumber,
        balance,
        payUrl: `${baseUrl}/pay/${inv.publicToken}`,
        dueDate: inv.dueDate,
        stage: stage.type,
        payable: canChargeOnline(inv.company),
      });
      const ok = await sendEmail({
        companyId: inv.companyId,
        to: inv.contact.email,
        subject,
        html,
        replyTo: inv.company.email || undefined,
        fromName: inv.company.name,
      });

      if (ok) {
        summary.sent++;
      } else {
        summary.errors++;
        reportError("[reminders] send failed after claim for invoice", inv.id, stage.type);
      }
    } catch (err) {
      summary.errors++;
      reportError("[reminders] failed for invoice", inv.id, err);
    }
  }

  return summary;
}

// Follow-up nudges on quotes still awaiting a response, measured from sentAt.
// Two stages only — after a week of silence, more automation reads as spam;
// the owner can follow up by hand from there.
const QUOTE_STAGES = [
  { type: "followup_3" as const, days: 3 },
  { type: "followup_7" as const, days: 7 },
];

/**
 * Automated quote follow-ups: quotes sitting in AWAITING_RESPONSE get a
 * friendly email at 3 and 7 days after they were sent. Same atomic-claim
 * pattern as the invoice dunning above (QuoteReminder @@unique is the lock).
 * Stops on approval/changes/archive (status leaves AWAITING_RESPONSE) and
 * never nudges an expired quote — approving it online is blocked anyway.
 */
export async function runQuoteFollowUps(
  now: Date = new Date()
): Promise<{ checked: number; sent: number; errors: number }> {
  if (!emailEnabled()) return { checked: 0, sent: 0, errors: 0 };

  const quotes = await prisma.quote.findMany({
    where: {
      status: "AWAITING_RESPONSE",
      sentAt: { not: null, lte: new Date(now.getTime() - 3 * DAY) },
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        // Same starvation guard as the invoice dunning above: only quotes
        // with a follow-up stage that is due and not yet sent.
        {
          OR: QUOTE_STAGES.map((s) => ({
            sentAt: { lte: new Date(now.getTime() - s.days * DAY) },
            reminders: { none: { type: s.type } },
          })),
        },
      ],
      contact: { is: { email: { not: null } } },
      company: { is: { suspendedAt: null } },
    },
    orderBy: { sentAt: "desc" },
    include: {
      reminders: { select: { type: true } },
      contact: { select: { email: true } },
      company: {
        select: {
          name: true,
          email: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
          finixMerchantId: true,
          finixOnboardingState: true,
        },
      },
    },
    take: 1000,
  });

  const summary = { checked: quotes.length, sent: 0, errors: 0 };
  const blocked = emailGate();

  for (const quote of quotes) {
    try {
      if (!quote.sentAt || !quote.contact?.email) continue;
      // Same rule as payment reminders: a company that can't email yet keeps
      // the stage unclaimed instead of burning it.
      if (await blocked(quote.companyId)) continue;
      const daysSinceSent = Math.floor((now.getTime() - quote.sentAt.getTime()) / DAY);
      const sentTypes = new Set(quote.reminders.map((r) => r.type));
      const eligible = QUOTE_STAGES.filter((s) => daysSinceSent >= s.days && !sentTypes.has(s.type));
      if (eligible.length === 0) continue;

      const stage = eligible[eligible.length - 1]; // most advanced unsent stage

      try {
        await prisma.quoteReminder.create({
          data: { quoteId: quote.id, type: stage.type, sentAt: now },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
      if (eligible.length > 1) {
        await prisma.quoteReminder.createMany({
          data: eligible.slice(0, -1).map((s) => ({ quoteId: quote.id, type: s.type, sentAt: now })),
          skipDuplicates: true,
        });
      }

      const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
      const { subject, html } = quoteFollowUpEmail({
        brand: quote.company,
        companyName: quote.company.name,
        quoteNumber: quote.quoteNumber,
        total: Number(quote.total),
        viewUrl: `${baseUrl}/quote/${quote.publicToken}`,
        stage: stage.type,
        validUntil: quote.validUntil,
      });
      const ok = await sendEmail({
        companyId: quote.companyId,
        to: quote.contact.email,
        subject,
        html,
        replyTo: quote.company.email || undefined,
        fromName: quote.company.name,
      });

      if (ok) {
        summary.sent++;
      } else {
        summary.errors++;
        reportError("[reminders] follow-up send failed after claim for quote", quote.id, stage.type);
      }
    } catch (err) {
      summary.errors++;
      reportError("[reminders] follow-up failed for quote", quote.id, err);
    }
  }

  return summary;
}

/**
 * Client appointment reminders: about a day ahead and again about an hour
 * out (lib/reminder-stage.ts has the rule — the day stage only for a booking
 * that existed a day ahead, the hour stage once the booking is 20 min old,
 * so nobody is "reminded" minutes after the booking itself). The sweep runs
 * every few minutes from instrumentation.ts
 * with the hourly cron as the backstop, so the hour stage lands ~60–70 min
 * out whatever minute the appointment starts. Covers every confirmed
 * appointment with a reachable client — online-booked and manually created —
 * unless the appointment opted out (Appointment.remindClient=false). Each
 * stage fires once (reminderDaySentAt / reminderHourSentAt), claimed
 * atomically before sending; stages are only claimed when at least one
 * channel can actually send, so an unconfigured Resend/Telnyx doesn't burn
 * the stage. Copy follows the appointment TYPE: a phone call says the
 * business will call (and at which number), a video call carries the join
 * link, only an in-person visit says anyone will arrive.
 */
export interface AppointmentReminderSummary {
  checked: number;
  sent: number;
  errors: number;
}

const reminderCompanySelect = {
  name: true,
  email: true,
  timezone: true,
  arrivalWindowMinutes: true,
  brandColor: true,
  documentColor: true,
  brandColorSecondary: true,
  logoUrl: true,
  finixMerchantId: true,
  finixOnboardingState: true,
} as const;

const reminderContactSelect = {
  firstName: true,
  email: true,
  phone: true,
  smsOptOut: true,
  smsDisabled: true,
} as const;

/**
 * One reminder (email + text, either counts) for an appointment or a job
 * visit whose stage was already claimed. Shared by both sweeps and the
 * automation action's copy — the wording lives in lib/sms.ts / lib/email.ts.
 */
async function sendClientReminder(input: {
  companyId: string;
  contactId: string;
  company: {
    name: string;
    email: string | null;
    timezone: string;
    brandColor: string | null;
    documentColor: string | null;
    brandColorSecondary: string | null;
    logoUrl: string | null;
    finixMerchantId: string | null;
    finixOnboardingState: string | null;
  };
  contact: { firstName: string; email: string | null; phone: string | null; smsOptOut: boolean; smsDisabled: boolean };
  serviceName: string;
  kind: MeetingKind;
  scheduledAt: Date;
  windowMinutes: number;
  address: string | null;
  meetingLink: string | null;
  stage: "day" | "hour";
  canEmail: boolean;
  canSms: boolean;
}): Promise<boolean> {
  const tz = input.company.timezone;
  const windowLabel = arrivalSlotLabel(tz, input.scheduledAt, input.windowMinutes);
  const timeLabel = arrivalTimeLabel(tz, input.scheduledAt, input.windowMinutes);
  const inPerson = input.kind === "IN_PERSON" || input.kind === "VISIT";
  const address = inPerson ? input.address : null;
  const phone = input.kind === "PHONE_CALL" ? input.contact.phone : null;
  const meetingLink = input.kind === "VIDEO_CALL" ? input.meetingLink : null;

  let emailOk = false;
  if (input.canEmail && input.contact.email) {
    const { subject, html } = appointmentReminderEmail({
      brand: input.company,
      companyName: input.company.name,
      companyEmail: input.company.email,
      contactFirstName: input.contact.firstName,
      serviceName: input.serviceName,
      windowLabel,
      address,
      stage: input.stage,
      kind: input.kind,
      phone,
      meetingLink,
    });
    emailOk = await sendEmail({
      companyId: input.companyId,
      to: input.contact.email,
      subject,
      html,
      replyTo: input.company.email || undefined,
      fromName: input.company.name,
    });
  }

  // Text rides alongside the email (either channel counts as reminded).
  let smsOk = false;
  if (input.canSms && input.contact.phone) {
    smsOk = await sendSms({
      companyId: input.companyId,
      contactId: input.contactId,
      to: input.contact.phone,
      text: appointmentReminderText({
        companyName: input.company.name,
        firstName: input.contact.firstName,
        serviceName: input.serviceName,
        kind: input.kind,
        windowLabel,
        timeLabel,
        address,
        phone,
        meetingLink,
        stage: input.stage,
      }),
    });
  }
  // A channel that was eligible but didn't go out is otherwise invisible: the
  // stage is already claimed and the other channel may have carried it. Say
  // so, so "the text never came" has a trail (lib/sms.ts warns the gate).
  if (input.canSms && input.contact.phone && !smsOk) {
    console.warn(`[reminders] ${input.stage} reminder text did not send (contact ${input.contactId}, company ${input.companyId})`);
  }
  if (input.canEmail && input.contact.email && !emailOk) {
    console.warn(`[reminders] ${input.stage} reminder email did not send (contact ${input.contactId}, company ${input.companyId})`);
  }
  return emailOk || smsOk;
}

export async function runAppointmentReminders(
  now: Date = new Date()
): Promise<AppointmentReminderSummary> {
  const HOUR = 3600000;
  const appointments = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      tentative: false,
      scheduledAnytime: false,
      remindClient: true,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 26 * HOUR) },
      contact: { is: { OR: [{ email: { not: null } }, { phone: { not: null } }] } },
      company: { is: { suspendedAt: null } },
      OR: [{ reminderDaySentAt: null }, { reminderHourSentAt: null }],
    },
    include: {
      contact: { select: reminderContactSelect },
      company: { select: reminderCompanySelect },
    },
    take: 1000,
  });

  const summary: AppointmentReminderSummary = { checked: appointments.length, sent: 0, errors: 0 };

  for (const appt of appointments) {
    try {
      const stage = reminderStage({
        now,
        scheduledAt: appt.scheduledAt,
        createdAt: appt.createdAt,
        daySentAt: appt.reminderDaySentAt,
        hourSentAt: appt.reminderHourSentAt,
      });
      if (!stage) continue;

      // SMS quiet hours: never text outside 8 AM–9 PM company-local. Email is
      // fine anytime.
      const canEmail = emailEnabled() && Boolean(appt.contact.email);
      const canSms = smsEnabled() && canText(appt.contact) && !inSmsQuietHours(now, appt.company.timezone);
      // Nothing can actually go out right now (unconfigured providers, or a
      // phone-only client inside quiet hours) — leave the stage unclaimed so a
      // later run still in the window picks it up.
      if (!canEmail && !canSms) continue;

      // Claim before sending (compare-and-set on the stage column) so
      // overlapping runs can't both remind the client. A claim whose sends
      // then fail is left in place (logged, never retried) — a missed
      // reminder beats double-texting.
      const claimed = await prisma.appointment.updateMany({
        where: {
          id: appt.id,
          ...(stage === "hour" ? { reminderHourSentAt: null } : { reminderDaySentAt: null }),
        },
        data:
          stage === "hour"
            ? // an hour-stage send also closes the day stage so a late
              // booking doesn't get the "day before" email after the visit
              { reminderHourSentAt: now, reminderDaySentAt: appt.reminderDaySentAt ?? now }
            : { reminderDaySentAt: now },
      });
      if (claimed.count === 0) continue;

      // In-person visits promise an arrival window (per-appointment override,
      // company default fallback); phone/video calls happen at the exact time.
      const ok = await sendClientReminder({
        companyId: appt.companyId,
        contactId: appt.contactId,
        company: appt.company,
        contact: appt.contact,
        serviceName: appt.title,
        kind: appt.type as MeetingKind,
        scheduledAt: appt.scheduledAt,
        windowMinutes:
          appt.type === "IN_PERSON"
            ? resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, appt.company.arrivalWindowMinutes)
            : 0,
        address: appt.address,
        meetingLink: appt.meetingLink,
        stage,
        canEmail,
        canSms,
      });

      if (ok) {
        summary.sent++;
      } else {
        summary.errors++;
        console.error("[reminders] send failed after claim for appointment", appt.id, stage);
      }
    } catch (err) {
      summary.errors++;
      console.error("[reminders] failed for appointment", appt.id, err);
    }
  }

  return summary;
}

/**
 * Client JOB-visit reminders — the same day-ahead + ~1-hour machinery as
 * appointments, for scheduled jobs. What the client is told is the ARRIVAL
 * WINDOW (lib/arrival-window.ts: per-job override falling back to the company
 * default; 0 = the exact start time), never the dispatch-exact minute.
 * Anytime visits (date only) are skipped — there's no time to promise.
 * Opt out per job with Job.remindClient=false.
 */
export async function runVisitReminders(
  now: Date = new Date()
): Promise<AppointmentReminderSummary> {
  const HOUR = 3600000;
  const jobs = await prisma.job.findMany({
    where: {
      status: "ACTIVE",
      scheduledAnytime: false,
      remindClient: true,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 26 * HOUR) },
      contact: { is: { OR: [{ email: { not: null } }, { phone: { not: null } }] } },
      company: { is: { suspendedAt: null } },
      OR: [{ reminderDaySentAt: null }, { reminderHourSentAt: null }],
    },
    include: {
      contact: { select: reminderContactSelect },
      company: { select: reminderCompanySelect },
    },
    take: 1000,
  });

  const summary: AppointmentReminderSummary = { checked: jobs.length, sent: 0, errors: 0 };

  for (const job of jobs) {
    try {
      const scheduledAt = job.scheduledAt!;
      const stage = reminderStage({
        now,
        scheduledAt,
        createdAt: job.createdAt,
        daySentAt: job.reminderDaySentAt,
        hourSentAt: job.reminderHourSentAt,
      });
      if (!stage) continue;

      const canEmail = emailEnabled() && Boolean(job.contact.email);
      const canSms = smsEnabled() && canText(job.contact) && !inSmsQuietHours(now, job.company.timezone);
      if (!canEmail && !canSms) continue;

      // Claim before sending — same compare-and-set as appointments
      const claimed = await prisma.job.updateMany({
        where: {
          id: job.id,
          ...(stage === "hour" ? { reminderHourSentAt: null } : { reminderDaySentAt: null }),
        },
        data:
          stage === "hour"
            ? { reminderHourSentAt: now, reminderDaySentAt: job.reminderDaySentAt ?? now }
            : { reminderDaySentAt: now },
      });
      if (claimed.count === 0) continue;

      const ok = await sendClientReminder({
        companyId: job.companyId,
        contactId: job.contactId,
        company: job.company,
        contact: job.contact,
        serviceName: job.title,
        kind: "VISIT",
        scheduledAt,
        windowMinutes: resolveArrivalWindowMinutes(job.arrivalWindowMinutes, job.company.arrivalWindowMinutes),
        address: job.address,
        meetingLink: null,
        stage,
        canEmail,
        canSms,
      });

      if (ok) {
        summary.sent++;
        // (Crew heads-up moved to runTechHeadsUp — it has its own stamp so
        // techs hear about remindClient=false jobs too, with action buttons.)
      } else {
        summary.errors++;
        console.error("[reminders] send failed after claim for job visit", job.id, stage);
      }
    } catch (err) {
      summary.errors++;
      console.error("[reminders] failed for job visit", job.id, err);
    }
  }

  return summary;
}

/**
 * Crew heads-up push ~1 hour before a scheduled visit — the tech-facing
 * counterpart of runVisitReminders, with its own stamp (Job.techHeadsUpSentAt)
 * so it fires even when the client reminder is off or unreachable. The push
 * carries action buttons (Chrome/Android; other platforms show a plain
 * notification): "On My Way" deep-links into the job with ?omw=1 (auto-opens
 * the tech's Messages app with the template), "Directions" opens the maps app.
 * Anytime visits are skipped — there's no time to be an hour ahead of.
 */
export async function runTechHeadsUp(now: Date = new Date()): Promise<AppointmentReminderSummary> {
  const jobs = await prisma.job.findMany({
    where: {
      status: "ACTIVE",
      scheduledAnytime: false,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + HOUR_STAGE_MS) },
      techHeadsUpSentAt: null,
      assignments: { some: {} },
      company: { is: { suspendedAt: null } },
    },
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true, address: true, city: true, state: true, zip: true } },
      assignments: { select: { userId: true } },
      company: { select: { timezone: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 1000,
  });

  const summary: AppointmentReminderSummary = { checked: jobs.length, sent: 0, errors: 0 };

  for (const job of jobs) {
    try {
      // Claim before sending — same compare-and-set as the client reminders
      const claimed = await prisma.job.updateMany({
        where: { id: job.id, techHeadsUpSentAt: null },
        data: { techHeadsUpSentAt: now },
      });
      if (claimed.count === 0) continue;

      const timeLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: job.company.timezone,
        hour: "numeric",
        minute: "2-digit",
      }).format(job.scheduledAt!);
      const address = completeAddress(job.address, job.contact) || composeAddress(job.contact) || null;
      const clientName = `${job.contact.firstName} ${job.contact.lastName}`.trim();

      const actions = [
        ...(job.contact.phone
          ? [{ action: "omw", title: "On My Way", url: `/app/jobs/${job.id}?omw=1` }]
          : []),
        ...(address
          ? [
              {
                action: "nav",
                title: "Directions",
                url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
              },
            ]
          : []),
      ];

      await notifyUsers(
        job.assignments.map((a) => a.userId),
        {
          title: `Up next at ${timeLabel}`,
          body: [job.title, clientName, address].filter(Boolean).join(" · "),
          url: `/app/jobs/${job.id}`,
          tag: `visit-${job.id}`,
          ...(actions.length > 0 ? { actions } : {}),
        }
      );
      summary.sent++;
    } catch (err) {
      summary.errors++;
      reportError("[reminders] tech heads-up failed for job", job.id, err);
    }
  }

  return summary;
}

/**
 * Assignee heads-up push ~1 hour before an appointment — the appointment
 * counterpart of runTechHeadsUp, with its own stamp
 * (Appointment.techHeadsUpSentAt) so the person taking the call or visit
 * hears about it even when the client can't be reminded (opted out, no
 * phone/email, remindClient off).
 */
export async function runAppointmentTechHeadsUp(now: Date = new Date()): Promise<AppointmentReminderSummary> {
  const appointments = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAnytime: false,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + HOUR_STAGE_MS) },
      techHeadsUpSentAt: null,
      // the lead is always set when anyone is on it (lib/appointment-people.ts)
      assignedToId: { not: null },
      company: { is: { suspendedAt: null } },
    },
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true } },
      company: { select: { timezone: true, arrivalWindowMinutes: true } },
      extraAssignees: { select: { userId: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 1000,
  });

  const summary: AppointmentReminderSummary = { checked: appointments.length, sent: 0, errors: 0 };

  for (const appt of appointments) {
    try {
      const claimed = await prisma.appointment.updateMany({
        where: { id: appt.id, techHeadsUpSentAt: null },
        data: { techHeadsUpSentAt: now },
      });
      if (claimed.count === 0 || !appt.assignedToId) continue;

      const windowLabel = arrivalTimeLabel(
        appt.company.timezone,
        appt.scheduledAt,
        appt.type === "IN_PERSON"
          ? resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, appt.company.arrivalWindowMinutes)
          : 0
      );
      const who = `${appt.contact.firstName} ${appt.contact.lastName}`.trim();
      const how =
        appt.type === "PHONE_CALL"
          ? `call ${who}${appt.contact.phone ? ` at ${appt.contact.phone}` : ""}`
          : appt.type === "VIDEO_CALL"
            ? `video call with ${who}`
            : [who, appt.address].filter(Boolean).join(" · ");
      // Everyone going hears it, not just the lead
      await notifyUsers([appt.assignedToId, ...appt.extraAssignees.map((e) => e.userId)], {
        title: `Up next at ${windowLabel}`,
        body: `${appt.title} — ${how}`,
        url: `/app/appointments/${appt.id}`,
        tag: `appt-${appt.id}`,
      });
      summary.sent++;
    } catch (err) {
      summary.errors++;
      reportError("[reminders] appointment heads-up failed", appt.id, err);
    }
  }

  return summary;
}
