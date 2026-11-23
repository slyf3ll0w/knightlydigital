/**
 * Metering for Talk to Atlas (Gemini Live).
 *
 * The audio runs straight between the browser and Google on a short-lived
 * token, so the only count of seconds is the one the browser sends back. A
 * browser that never reports would talk for free on WorkBench's key. The
 * server cannot hear the audio, but it can hold the line three ways
 * (2026-11-23 security review):
 *
 *  - every session is PREPAID a small amount when its token is minted, and
 *    the reports that follow are charged only past what was prepaid;
 *  - a login opens at most MAX_SESSIONS_PER_DAY sessions in 24 hours;
 *  - a login with UNREPORTED_LIMIT sessions that never reported anything in
 *    24 hours is paused until they age out, and the operator hears about it.
 *
 * Reported seconds are also clamped to the time the session has existed.
 * The rules are pure; the routes do the I/O.
 */

export const IN_CENTS_PER_MIN = Number(process.env.LIVE_AUDIO_IN_CENTS_PER_MIN) || 0.5;
export const OUT_CENTS_PER_MIN = Number(process.env.LIVE_AUDIO_OUT_CENTS_PER_MIN) || 1.8;

/** Charged at mint, credited against the session's own reports: half a minute each way. */
export const PREPAID_SECONDS = 30;
export const MAX_SESSIONS_PER_DAY = 80;
/** Sessions older than the grace with no report at all, in 24 hours, before the login is paused. */
export const UNREPORTED_LIMIT = 15;
export const UNREPORTED_GRACE_MS = 5 * 60_000;
/** A token lives 30 minutes; a report later than this is for nothing we minted. */
export const SESSION_LIFE_MS = 45 * 60_000;

export function audioCents(inSeconds: number, outSeconds: number): number {
  return (inSeconds / 60) * IN_CENTS_PER_MIN + (outSeconds / 60) * OUT_CENTS_PER_MIN;
}

export const PREPAID_CENTS = audioCents(PREPAID_SECONDS, PREPAID_SECONDS);

/** May this login open another session? Pure. */
export function mintVerdict(counts: { sessions24h: number; unreported24h: number }): "ok" | "daily-cap" | "unreported" {
  if (counts.unreported24h >= UNREPORTED_LIMIT) return "unreported";
  if (counts.sessions24h >= MAX_SESSIONS_PER_DAY) return "daily-cap";
  return "ok";
}

/**
 * Apply one usage report to a session. Seconds can never exceed the time the
 * session has existed (plus a minute of slack), and the charge is only what
 * the running total costs beyond what was already charged. Pure.
 */
export function applyReport(
  session: { startedAt: Date; inSeconds: number; outSeconds: number; chargedCents: number },
  report: { inSeconds: number; outSeconds: number },
  now: Date
): { inSeconds: number; outSeconds: number; chargedCents: number; chargeNow: number } | null {
  const age = now.getTime() - session.startedAt.getTime();
  if (age < 0 || age > SESSION_LIFE_MS) return null;
  const ceiling = Math.floor(age / 1000) + 60;
  const clean = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const inSeconds = Math.min(ceiling, session.inSeconds + clean(report.inSeconds));
  const outSeconds = Math.min(ceiling, session.outSeconds + clean(report.outSeconds));
  const owed = audioCents(inSeconds, outSeconds);
  const chargeNow = Math.max(0, owed - session.chargedCents);
  return { inSeconds, outSeconds, chargedCents: session.chargedCents + chargeNow, chargeNow };
}
