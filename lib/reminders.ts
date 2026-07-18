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

import { prisma } from "@/lib/db";
import { sendEmail, paymentReminderEmail, appointmentReminderEmail } from "@/lib/email";
import { notifyUser } from "@/lib/push";
import { slotLabel } from "@/lib/booking-availability";

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
  // Flip awaiting invoices whose due date has passed to PAST_DUE (the invoices
  // list does this lazily on view; here we do it globally so statuses are right
  // even for companies no one has opened today).
  const flipped = await prisma.invoice.updateMany({
    where: { status: "AWAITING_PAYMENT", dueDate: { lt: now } },
    data: { status: "PAST_DUE" },
  });

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] },
      dueDate: { not: null, lte: now },
      contact: { is: { email: { not: null } } },
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
      const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
      const { subject, html } = paymentReminderEmail({
        companyName: inv.company.name,
        companyEmail: inv.company.email,
        invoiceNumber: inv.invoiceNumber,
        balance,
        payUrl: `${baseUrl}/pay/${inv.publicToken}`,
        dueDate: inv.dueDate,
        stage: stage.type,
      });
      const ok = await sendEmail({
        to: inv.contact.email,
        subject,
        html,
        replyTo: inv.company.email || undefined,
        fromName: inv.company.name,
        brand: inv.company,
      });

      // Only record once the email actually went out, so an unconfigured Resend
      // (no-op send) doesn't silently burn through the cadence — it resumes when
      // email is live. Mark all passed stages so we never back-fill earlier ones.
      if (ok) {
        await prisma.paymentReminder.createMany({
          data: eligible.map((s) => ({ invoiceId: inv.id, type: s.type, sentAt: now })),
        });
        summary.sent++;
      }
    } catch (err) {
      summary.errors++;
      console.error("[reminders] failed for invoice", inv.id, err);
    }
  }

  return summary;
}

/**
 * Client reminders for ONLINE-BOOKED appointments: the day before (fires in
 * the 2–26h window) and again about an hour out (needs the cron to run
 * hourly to actually catch it; on a daily cron only the day reminder lands).
 * Scoped to confirmed appointments whose request came from a booking form —
 * manually created appointments never email clients unprompted. Each stage
 * fires once (reminderDaySentAt / reminderHourSentAt) and only records after
 * a real send, so an unconfigured Resend doesn't burn the stage.
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
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 26 * HOUR) },
      contact: { is: { email: { not: null } } },
      request: { is: { source: "booking_form" } },
      OR: [{ reminderDaySentAt: null }, { reminderHourSentAt: null }],
    },
    include: {
      contact: { select: { firstName: true, email: true } },
      company: {
        select: {
          name: true,
          email: true,
          timezone: true,
          arrivalWindowMinutes: true,
          brandColor: true,
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
      if (!stage || !appt.contact.email) continue;

      const windowEnd = new Date(
        appt.scheduledAt.getTime() + appt.company.arrivalWindowMinutes * 60000
      );
      const { subject, html } = appointmentReminderEmail({
        companyName: appt.company.name,
        companyEmail: appt.company.email,
        contactFirstName: appt.contact.firstName,
        serviceName: appt.title,
        windowLabel: slotLabel(appt.company.timezone, appt.scheduledAt, windowEnd),
        address: appt.address,
        stage,
      });
      const ok = await sendEmail({
        to: appt.contact.email,
        subject,
        html,
        replyTo: appt.company.email || undefined,
        fromName: appt.company.name,
        brand: appt.company,
      });
      if (ok) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data:
            stage === "hour"
              ? // an hour-stage send also closes the day stage so a late
                // booking doesn't get the "day before" email after the visit
                { reminderHourSentAt: now, reminderDaySentAt: appt.reminderDaySentAt ?? now }
              : { reminderDaySentAt: now },
        });
        summary.sent++;
        // The email reminds the client; the push reminds whoever's going
        if (stage === "hour" && appt.assignedToId) {
          await notifyUser(appt.assignedToId, {
            title: "Upcoming appointment",
            body: `${appt.title} — arrival window ${slotLabel(appt.company.timezone, appt.scheduledAt, windowEnd)}`,
            url: "/app/schedule",
            tag: `appt-${appt.id}`,
          });
        }
      }
    } catch (err) {
      summary.errors++;
      console.error("[reminders] failed for appointment", appt.id, err);
    }
  }

  return summary;
}
