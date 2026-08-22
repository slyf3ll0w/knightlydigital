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
import { prisma } from "@/lib/db";
import { sendEmail, emailEnabled, paymentReminderEmail, appointmentReminderEmail, quoteFollowUpEmail } from "@/lib/email";
import { sendSms, smsEnabled, appointmentReminderText } from "@/lib/sms";
import { notifyUser, notifyUsers } from "@/lib/push";
import { arrivalSlotLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { pastDueFilter } from "@/lib/due-dates";

const DAY = 86400000;

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
  const flipped = await prisma.invoice.updateMany({
    where: { status: "AWAITING_PAYMENT", dueDate: pastDueFilter(now) },
    data: { status: "PAST_DUE" },
  });

  // Without Resend every send is a no-op — bail before claiming any stage so
  // the cadence simply picks up once email is live.
  if (!emailEnabled()) {
    return { checked: 0, sent: 0, markedPastDue: flipped.count, errors: 0 };
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] },
      dueDate: { not: null, lte: now },
      contact: { is: { email: { not: null } } },
      company: { is: { suspendedAt: null } },
    },
    include: {
      payments: { select: { amount: true } },
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
        },
      },
    },
    take: 1000,
  });

  const summary: ReminderSummary = { checked: invoices.length, sent: 0, markedPastDue: flipped.count, errors: 0 };

  for (const inv of invoices) {
    try {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balance = Math.round((Number(inv.total) - paid) * 100) / 100;
      if (balance <= 0 || !inv.contact?.email || !inv.dueDate) continue;

      const daysPastDue = Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY);
      const sentTypes = new Set(inv.reminders.map((r) => r.type));
      const eligible = STAGES.filter((s) => daysPastDue >= s.days && !sentTypes.has(s.type));
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
        console.error("[reminders] send failed after claim for invoice", inv.id, stage.type);
      }
    } catch (err) {
      summary.errors++;
      console.error("[reminders] failed for invoice", inv.id, err);
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
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      contact: { is: { email: { not: null } } },
      company: { is: { suspendedAt: null } },
    },
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
        },
      },
    },
    take: 1000,
  });

  const summary = { checked: quotes.length, sent: 0, errors: 0 };

  for (const quote of quotes) {
    try {
      if (!quote.sentAt || !quote.contact?.email) continue;
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
        console.error("[reminders] follow-up send failed after claim for quote", quote.id, stage.type);
      }
    } catch (err) {
      summary.errors++;
      console.error("[reminders] follow-up failed for quote", quote.id, err);
    }
  }

  return summary;
}

/**
 * Client appointment reminders: the day before (fires in the 2–26h window)
 * and again about an hour out (needs the cron to run hourly to actually catch
 * it; on a daily cron only the day reminder lands). Covers every confirmed
 * appointment with a reachable client — online-booked and manually created —
 * unless the appointment opted out (Appointment.remindClient=false). Each
 * stage fires once (reminderDaySentAt / reminderHourSentAt), claimed
 * atomically before sending; stages are only claimed when at least one
 * channel can actually send, so an unconfigured Resend/Telnyx doesn't burn
 * the stage.
 */
export interface AppointmentReminderSummary {
  checked: number;
  sent: number;
  errors: number;
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
      contact: { select: { firstName: true, email: true, phone: true, smsOptOut: true } },
      company: {
        select: {
          name: true,
          email: true,
          timezone: true,
          arrivalWindowMinutes: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
        },
      },
    },
    take: 1000,
  });

  const summary: AppointmentReminderSummary = { checked: appointments.length, sent: 0, errors: 0 };

  for (const appt of appointments) {
    try {
      const msUntil = appt.scheduledAt.getTime() - now.getTime();
      const stage: "day" | "hour" | null =
        msUntil <= 75 * 60000 && !appt.reminderHourSentAt
          ? "hour"
          : msUntil > 2 * HOUR && !appt.reminderDaySentAt
            ? "day"
            : null;
      if (!stage) continue;

      // SMS quiet hours: never text outside 8 AM–9 PM company-local. Email is
      // fine anytime.
      const localHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: appt.company.timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(now)
      );
      const smsQuiet = localHour < 8 || localHour >= 21;

      const canEmail = emailEnabled() && Boolean(appt.contact.email);
      const canSms =
        smsEnabled() && Boolean(appt.contact.phone) && !appt.contact.smsOptOut && !smsQuiet;
      // Nothing can actually go out right now (unconfigured providers, or a
      // phone-only client inside quiet hours) — leave the stage unclaimed so a
      // later cron run still in the window picks it up.
      if (!canEmail && !canSms) continue;

      // Claim before sending (compare-and-set on the stage column) so
      // overlapping cron runs can't both remind the client. A claim whose
      // sends then fail is left in place (logged, never retried) — a missed
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
      const windowLabel = arrivalSlotLabel(
        appt.company.timezone,
        appt.scheduledAt,
        appt.type === "IN_PERSON"
          ? resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, appt.company.arrivalWindowMinutes)
          : 0
      );

      let emailOk = false;
      if (canEmail && appt.contact.email) {
        const { subject, html } = appointmentReminderEmail({
          brand: appt.company,
          companyName: appt.company.name,
          companyEmail: appt.company.email,
          contactFirstName: appt.contact.firstName,
          serviceName: appt.title,
          windowLabel,
          address: appt.address,
          stage,
        });
        emailOk = await sendEmail({
          companyId: appt.companyId,
          to: appt.contact.email,
          subject,
          html,
          replyTo: appt.company.email || undefined,
          fromName: appt.company.name,
        });
      }

      // Text rides alongside the email (either channel counts as reminded).
      let smsOk = false;
      if (canSms && appt.contact.phone) {
        smsOk = await sendSms({
          companyId: appt.companyId,
          to: appt.contact.phone,
          text: appointmentReminderText({
            companyName: appt.company.name,
            firstName: appt.contact.firstName,
            serviceName: appt.title,
            windowLabel,
            address: appt.address,
            stage,
          }),
        });
      }

      const ok = emailOk || smsOk;
      if (ok) {
        summary.sent++;
        // The email reminds the client; the push reminds whoever's going
        if (stage === "hour" && appt.assignedToId) {
          await notifyUser(appt.assignedToId, {
            title: "Upcoming appointment",
            body: `${appt.title} — ${windowLabel}`,
            url: "/app/schedule",
            tag: `appt-${appt.id}`,
          });
        }
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
 * Client JOB-visit reminders — the same day-before + ~1-hour machinery as
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
      contact: { select: { firstName: true, email: true, phone: true, smsOptOut: true } },
      assignments: { select: { userId: true } },
      company: {
        select: {
          name: true,
          email: true,
          timezone: true,
          arrivalWindowMinutes: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
        },
      },
    },
    take: 1000,
  });

  const summary: AppointmentReminderSummary = { checked: jobs.length, sent: 0, errors: 0 };

  for (const job of jobs) {
    try {
      const scheduledAt = job.scheduledAt!;
      const msUntil = scheduledAt.getTime() - now.getTime();
      const stage: "day" | "hour" | null =
        msUntil <= 75 * 60000 && !job.reminderHourSentAt
          ? "hour"
          : msUntil > 2 * HOUR && !job.reminderDaySentAt
            ? "day"
            : null;
      if (!stage) continue;

      // SMS quiet hours: never text outside 8 AM–9 PM company-local
      const localHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: job.company.timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(now)
      );
      const smsQuiet = localHour < 8 || localHour >= 21;

      const canEmail = emailEnabled() && Boolean(job.contact.email);
      const canSms =
        smsEnabled() && Boolean(job.contact.phone) && !job.contact.smsOptOut && !smsQuiet;
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

      const windowLabel = arrivalSlotLabel(
        job.company.timezone,
        scheduledAt,
        resolveArrivalWindowMinutes(job.arrivalWindowMinutes, job.company.arrivalWindowMinutes)
      );

      let emailOk = false;
      if (canEmail && job.contact.email) {
        const { subject, html } = appointmentReminderEmail({
          brand: job.company,
          companyName: job.company.name,
          companyEmail: job.company.email,
          contactFirstName: job.contact.firstName,
          serviceName: job.title,
          windowLabel,
          address: job.address,
          stage,
        });
        emailOk = await sendEmail({
          companyId: job.companyId,
          to: job.contact.email,
          subject,
          html,
          replyTo: job.company.email || undefined,
          fromName: job.company.name,
        });
      }

      let smsOk = false;
      if (canSms && job.contact.phone) {
        smsOk = await sendSms({
          companyId: job.companyId,
          to: job.contact.phone,
          text: appointmentReminderText({
            companyName: job.company.name,
            firstName: job.contact.firstName,
            serviceName: job.title,
            windowLabel,
            address: job.address,
            stage,
          }),
        });
      }

      const ok = emailOk || smsOk;
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
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 65 * 60000) },
      techHeadsUpSentAt: null,
      assignments: { some: {} },
      company: { is: { suspendedAt: null } },
    },
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true, address: true } },
      assignments: { select: { userId: true } },
      company: { select: { timezone: true } },
    },
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
      const address = job.address ?? job.contact.address;
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
      console.error("[reminders] tech heads-up failed for job", job.id, err);
    }
  }

  return summary;
}
