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
import { sendEmail, paymentReminderEmail } from "@/lib/email";

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
      company: { select: { name: true, email: true } },
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
      const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
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
