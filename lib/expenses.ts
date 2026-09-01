import { prisma } from "@/lib/db";

/**
 * Recurring monthly expenses. Owners set up a template once ("Shop rent,
 * $1,200, the 1st") and the daily cron posts a real Expense row each month.
 * Everything downstream (Insights profit, CSV export, QBO purchase push) just
 * sees ordinary Expense rows.
 */

/** The template's next due date after `from`: same day next month, clamped to
 *  that month's last day (dayOfMonth 31 → Feb 28). Noon anchor, matching
 *  Expense.incurredAt. */
export function nextMonthlyDate(from: Date, dayOfMonth: number): Date {
  const y = from.getFullYear();
  const m = from.getMonth() + 1; // next month (Date normalizes year rollover)
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dayOfMonth, lastDay), 12, 0, 0);
}

/** First occurrence of dayOfMonth strictly after `after` (used when creating a
 *  template or changing its day, so it never backfills the past). */
export function firstRunAfter(after: Date, dayOfMonth: number): Date {
  const lastDay = new Date(after.getFullYear(), after.getMonth() + 1, 0).getDate();
  const thisMonth = new Date(
    after.getFullYear(),
    after.getMonth(),
    Math.min(dayOfMonth, lastDay),
    12, 0, 0
  );
  return thisMonth > after ? thisMonth : nextMonthlyDate(after, dayOfMonth);
}

export type RecurringExpenseRunSummary = {
  processed: number;
  posted: number;
  errors: number;
};

/**
 * Daily cron sweep: post every due template as an Expense and advance its
 * nextRunDate. Idempotent — the update is a compare-and-swap on nextRunDate,
 * so a template is claimed exactly once even if two runs overlap. If the cron
 * was down for a while, each run advances one cycle per template per loop
 * iteration (capped), catching up without double-posting.
 */
export async function runRecurringExpenses(
  now: Date = new Date()
): Promise<RecurringExpenseRunSummary> {
  const summary: RecurringExpenseRunSummary = { processed: 0, posted: 0, errors: 0 };

  // Cap catch-up so a template that somehow sits years overdue can't flood
  // the log in one run.
  for (let pass = 0; pass < 12; pass++) {
    const due = await prisma.recurringExpense.findMany({
      where: {
        active: true,
        nextRunDate: { lte: now },
        company: { is: { suspendedAt: null } },
      },
      orderBy: { nextRunDate: "asc" },
      take: 500,
    });
    if (due.length === 0) break;

    for (const t of due) {
      try {
        await prisma.$transaction(async (tx) => {
          // Claim this cycle: only the run that moves nextRunDate forward
          // gets to write the expense.
          const claimed = await tx.recurringExpense.updateMany({
            where: { id: t.id, nextRunDate: t.nextRunDate },
            data: { nextRunDate: nextMonthlyDate(t.nextRunDate, t.dayOfMonth) },
          });
          if (claimed.count === 0) return;
          await tx.expense.create({
            data: {
              companyId: t.companyId,
              description: t.description,
              category: t.category,
              amount: t.amount,
              incurredAt: t.nextRunDate,
              createdById: t.createdById,
            },
          });
          summary.posted++;
        });
        summary.processed++;
      } catch (err) {
        summary.errors++;
        console.error("[expenses] recurring post failed for", t.id, err);
      }
    }
  }
  return summary;
}
