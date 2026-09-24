import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  runDueSubscriptions,
  runMonthlyConsolidations,
  generateDueVisits,
} from "@/lib/subscriptions";
import {
  runDueReminders,
  runAppointmentReminders,
  runQuoteFollowUps,
  runVisitReminders,
  runTechHeadsUp,
} from "@/lib/reminders";
import { runAutoChargeRetries, runCardExpiryNudges } from "@/lib/auto-charge";
import { runQuickBooksNightlySync } from "@/lib/quickbooks";
import { runGoogleCalendarSweep } from "@/lib/google-calendar";
import { runGoogleCalendarPullSweep } from "@/lib/google-calendar-pull";
import { runRecurringExpenses } from "@/lib/expenses";
import { expireApprovalBookings } from "@/lib/approval-bookings";
import { rollupStorageSnapshots } from "@/lib/usage";
import { runNightlyReconciliation } from "@/lib/reconcile";
import { runLineRegistrationSweep, runLineReleaseSweep } from "@/lib/business-line";
import { runStaleCallSweep } from "@/lib/voice";
import { runAutomationSweeps } from "@/lib/automations-server";
import { pruneBuilds } from "@/lib/estimator-build-jobs";

/**
 * Hourly billing cron. A scheduler (Railway cron service, or an external
 * pinger like cron-job.org) POSTs here with the shared secret. Every sweep is
 * idempotent — running twice in an hour won't double-bill or double-remind —
 * and each one claims its rows in the DB, so a sweep that is cut short simply
 * resumes on the next tick.
 *
 *   curl -X POST https://<host>/api/cron/recurring \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Set CRON_SECRET in the environment. If it's unset the endpoint is disabled
 * (503) so an unconfigured deploy can't be triggered anonymously.
 *
 * Three guards keep one slow hour from cascading:
 *  - overlap: a tick that arrives while the previous one is still running is
 *    refused (409) instead of racing it;
 *  - isolation: a sweep that throws is logged and the rest still run — one
 *    bad row in reminders must never stop autopay retries;
 *  - budget: sweeps that would start after BUDGET_MS are deferred to the next
 *    tick, so the request always finishes inside any proxy timeout.
 */
export const dynamic = "force-dynamic";

const BUDGET_MS = 8 * 60_000;

/**
 * Sweeps that bill or collect. A failure here is a revenue problem, so the
 * response says so (`ok: false`, 500) — a scheduler that alerts on non-2xx
 * hears about it, and `console.error` alone never reaches anyone.
 */
const MONEY_STEPS = new Set(["subscriptions", "consolidations", "autoChargeRetries"]);

// Single-container deployment: an in-process flag is the overlap guard. The
// per-row DB claims underneath make an overlap safe anyway — this just stops
// it being wasteful.
let running = false;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (!authorized(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (running) {
    return NextResponse.json({ ok: false, skipped: "previous run still in progress" }, { status: 409 });
  }
  running = true;
  const started = Date.now();
  const now = new Date();
  const results: Record<string, unknown> = {};
  const deferred: string[] = [];
  const failed: string[] = [];
  // Steps that finished but reported per-row errors (a plan that couldn't
  // bill, a retry that blew up). Those never throw — each sweep catches and
  // counts — so without this they'd be invisible to Sentry forever.
  const degraded: string[] = [];

  const step = async (name: string, fn: () => Promise<unknown>) => {
    if (Date.now() - started > BUDGET_MS) {
      deferred.push(name);
      return;
    }
    try {
      const out = await fn();
      results[name] = out;
      const errors = (out as { errors?: unknown } | null)?.errors;
      if (typeof errors === "number" && errors > 0) {
        degraded.push(name);
        Sentry.captureMessage(`[cron] ${name}: ${errors} row error${errors === 1 ? "" : "s"}`, {
          level: "error",
          tags: { cron: name },
          extra: { summary: out },
        });
      }
    } catch (err) {
      console.error(`[cron] ${name} failed`, err);
      Sentry.captureException(err, { tags: { cron: name } });
      failed.push(name);
      results[name] = { error: err instanceof Error ? err.message : "failed" };
    }
  };

  try {
    // Money first: the sweeps that bill or retry charges run before anything
    // that merely notifies, so a slow hour defers nudges, not revenue.
    await step("subscriptions", () => runDueSubscriptions(now));
    // Monthly-consolidated series: bill the month's completed visits on the 1st
    await step("consolidations", () => runMonthlyConsolidations(now));
    // Autopay retries: re-attempt declined card-on-file charges on their
    // +1d/+3d/+7d schedule (soft declines only — hard declines gave up already)
    await step("autoChargeRetries", () => runAutoChargeRetries(now));
    // Materialize upcoming visit-series jobs (~4-week rolling horizon)
    await step("visits", () => generateDueVisits(now));
    // Standing monthly expenses (rent, insurance…) post to the expense log on
    // their day of the month
    await step("recurringExpenses", () => runRecurringExpenses(now));
    await step("reminders", () => runDueReminders(now));
    // Crew heads-up push ~1 hour before each visit, with On My Way / Directions
    // action buttons — needs the hourly cron to land, like the 1-hour stages
    await step("techHeadsUp", () => runTechHeadsUp(now));
    // Online-booking appointment reminders (1 day / 1 hour before). The 1-hour
    // stage only lands if this cron runs hourly — daily runs still cover the
    // day-before stage.
    await step("appointmentReminders", () => runAppointmentReminders(now));
    // "Hold for approval" bookings nobody answered: auto-decline 2 h before
    // the slot (frees it, tells the client), and a morning nudge while any wait
    await step("approvalBookings", () => expireApprovalBookings(now));
    // Job-visit reminders (same cadence): clients are told the arrival window,
    // never the dispatch-exact time
    await step("visitReminders", () => runVisitReminders(now));
    // Sales follow-ups: quotes sitting unanswered get a nudge at 3 and 7 days
    await step("quoteFollowUps", () => runQuoteFollowUps(now));
    // Owner-built automations with time triggers (quote unanswered N days,
    // invoice N days overdue, lead stale N days) — one run per record, ever
    await step("automations", () => runAutomationSweeps(now));
    // Estimate-tool build logs older than a week (the tool itself is the record)
    await step("estimatorBuilds", () => pruneBuilds());
    // "Your card expires soon" nudges for clients on autopay (once per card)
    await step("cardNudges", () => runCardExpiryNudges(now));
    // QuickBooks sweep: catches invoices issued/edited outside the payment
    // hook. No-op unless QBO env vars are set and companies have connected.
    await step("quickbooks", () => runQuickBooksNightlySync());
    // Google Calendar push: reconciles every connected user's schedule —
    // catches visit-series generation and anything the write trigger missed.
    // No-op unless GOOGLE_CALENDAR_* env vars are set and users have connected.
    await step("googleCalendarPull", () => runGoogleCalendarPullSweep());
    await step("googleCalendar", () => runGoogleCalendarSweep());
    // Business-line 10DLC registrations: poll Telnyx for every pending brand/
    // campaign and advance it (create campaign, bind number, mark active).
    // No-op without Telnyx keys or with nothing pending.
    await step("lineRegistrations", () => runLineRegistrationSweep());
    // Lapsed add-ons: schedule the number's release 30 days out (owner
    // notified), release once that passes, un-schedule on resubscribe.
    await step("lineReleases", () => runLineReleaseSweep(now));
    // Business-line calls whose hangup webhook never arrived: close them so
    // the Calls page never shows a call "ringing" since yesterday.
    await step("staleCalls", () => runStaleCallSweep(now));
    // Team-map retention: location history older than 30 days is deleted —
    // deliberate; keep the window short.
    await step("prunedPings", async () => {
      const r = await prisma.locationPing.deleteMany({
        where: { recordedAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
      });
      return r.count;
    });
    // Per-company storage snapshot for the superadmin cost dashboard. On an
    // hourly cron this just overwrites today's level — harmless.
    await step("storageCompanies", () => rollupStorageSnapshots());
    // Financial reconciliation: re-derives every money invariant and emails the
    // platform operator on drift. Self-gates to once a day; never throws.
    await step("reconcile", () => runNightlyReconciliation(now));
  } finally {
    running = false;
  }

  const moneyFailed = failed.some((name) => MONEY_STEPS.has(name)) || degraded.some((name) => MONEY_STEPS.has(name));
  return NextResponse.json(
    {
      ok: !moneyFailed,
      ms: Date.now() - started,
      ...(deferred.length ? { deferred } : {}),
      ...(failed.length ? { failed } : {}),
      ...(degraded.length ? { degraded } : {}),
      ...results,
    },
    { status: moneyFailed ? 500 : 200 }
  );
}
