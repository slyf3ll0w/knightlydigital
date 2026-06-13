import { NextRequest, NextResponse } from "next/server";
import { runDueSubscriptions } from "@/lib/subscriptions";
import { runDueReminders } from "@/lib/reminders";

/**
 * Daily billing cron. A scheduler (Railway cron service, or an external pinger
 * like cron-job.org) POSTs here once a day with the shared secret. It does two
 * sweeps: (1) generate the next cycle for every due subscription, and (2) send
 * payment reminders for unpaid/overdue invoices (due, +3, +7, +14 days). Both
 * are idempotent — running twice in a day won't double-bill or double-remind.
 *
 *   curl -X POST https://<host>/api/cron/recurring \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Set CRON_SECRET in the environment. If it's unset the endpoint is disabled
 * (503) so an unconfigured deploy can't be triggered anonymously.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const subscriptions = await runDueSubscriptions(now);
  const reminders = await runDueReminders(now);
  return NextResponse.json({ ok: true, subscriptions, reminders });
}
