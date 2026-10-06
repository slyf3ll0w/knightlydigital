import * as Sentry from "@sentry/nextjs";

// Server-side Sentry. With no NEXT_PUBLIC_SENTRY_DSN set the SDK disables
// itself, so this is a no-op everywhere until the var exists in Railway —
// local dev and CI never phone home.
export async function register() {
  // Two-way calendar sync: Google has no cheap push for "your calendar
  // changed" without webhook channels, so the server polls every connected
  // account with Google's incremental sync token (a near-free call when
  // nothing changed). Node runtime only, never during `next build`; the
  // hourly cron sweep is the backstop if this process restarts.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { runGoogleCalendarPullSweep } = await import("@/lib/google-calendar-pull");
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        await runGoogleCalendarPullSweep();
      } catch (err) {
        console.error("[google-calendar] pull poll failed", err);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, 5 * 60_000);
    timer.unref?.();

    // Client reminders + crew heads-ups every 5 minutes. The hourly cron
    // alone put the "about an hour ahead" reminder anywhere from 5 to 75
    // minutes out depending on the appointment's minute (a 10:30 call was
    // reminded at 10:00); the ticker lands it 60–70 min out. Every sweep
    // claims its rows with compare-and-set, so the hourly cron pass is a
    // safe backstop. Production only unless REMINDER_TICKER=1 — a dev
    // server must never text real clients. REMINDER_TICKER=0 turns it off.
    const tickerOn =
      process.env.REMINDER_TICKER === "1" ||
      (process.env.REMINDER_TICKER !== "0" && process.env.NODE_ENV === "production");
    if (tickerOn) {
      const { runAppointmentReminders, runVisitReminders, runTechHeadsUp, runAppointmentTechHeadsUp } =
        await import("@/lib/reminders");
      const { runTaskReminders } = await import("@/lib/tasks");
      const { REMINDER_TICK_MS } = await import("@/lib/reminder-stage");
      let remindersBusy = false;
      const remindersTick = async () => {
        if (remindersBusy) return;
        remindersBusy = true;
        const now = new Date();
        for (const [name, run] of [
          ["appointmentReminders", runAppointmentReminders],
          ["visitReminders", runVisitReminders],
          ["techHeadsUp", runTechHeadsUp],
          ["appointmentHeadsUp", runAppointmentTechHeadsUp],
          // Personal task reminders (push + bell at the chosen time)
          ["taskReminders", runTaskReminders],
        ] as const) {
          try {
            await run(now);
          } catch (err) {
            console.error(`[reminders] ticker ${name} failed`, err);
          }
        }
        remindersBusy = false;
      };
      const remindersTimer = setInterval(remindersTick, REMINDER_TICK_MS);
      remindersTimer.unref?.();
    }
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV,
    // Errors only — no performance tracing. Keeps us far inside the free
    // tier and the signal is exactly what launch-watching needs.
    tracesSampleRate: 0,
    // Tenant data must not ride along in error reports.
    sendDefaultPii: false,
  });
}

// Server Component / route handler errors surface through this hook —
// without it only unhandled process-level errors would be captured.
export const onRequestError = Sentry.captureRequestError;
