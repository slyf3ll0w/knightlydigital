/**
 * The free setup call: the one "I'm stuck" door a self-serve sign-up has
 * (David 2026-11-16). Every place a new company can stall links here: the
 * payment-setup step, the Get started card on Home, the last stop of the
 * welcome tour, the welcome email and the stalled-sign-up nudge
 * (lib/setup-nudge.ts).
 *
 * The page is the marketing site's /book-a-call (WorkBench's own phone-call
 * booking item). It lives outside /app, so the phone app opens it in the
 * system browser: links to it are plain <a target="_blank">, never <Link>.
 */
export const SETUP_CALL_PATH = "/book-a-call";

export const SETUP_CALL_LABEL = "Book a free setup call";

/** Absolute URL, for emails. */
export function setupCallUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${SETUP_CALL_PATH}`;
}

/* ── The stalled-sign-up nudge: who gets it (pure; scripts/test-setup-nudge.ts) ── */

/** Hours after sign-up before a stalled company hears from us. */
export const NUDGE_AFTER_HOURS = 48;
/** Past this a sign-up is cold: no email, the lead on the board is the record. */
export const NUDGE_WINDOW_DAYS = 14;
/**
 * Companies opened before the nudge shipped never get it: the first cron
 * tick must not email everyone who signed up in the last two weeks.
 */
export const NUDGE_EPOCH = new Date("2026-11-16T00:00:00Z");

export type NudgeFacts = {
  createdAt: Date;
  setupNudgeSentAt: Date | null;
  isTest: boolean;
  isPlatform: boolean;
  suspended: boolean;
  /** Held at the payment-setup step (lib/payments-gate.ts paymentsSetupRequired). */
  paymentsHeld: boolean;
  /** Real clients on the books (placeholders don't count). */
  clients: number;
};

/**
 * Why a company counts as stalled, or null when it should be left alone.
 * "payments" = never got past connecting Square (they have not even seen the
 * app); "no_clients" = got in and added nobody.
 */
export function nudgeReason(f: NudgeFacts, now: Date): "payments" | "no_clients" | null {
  if (f.setupNudgeSentAt || f.isTest || f.isPlatform || f.suspended) return null;
  if (f.createdAt < NUDGE_EPOCH) return null;
  const ageMs = now.getTime() - f.createdAt.getTime();
  if (ageMs < NUDGE_AFTER_HOURS * 3_600_000) return null;
  if (ageMs > NUDGE_WINDOW_DAYS * 86_400_000) return null;
  if (f.paymentsHeld) return "payments";
  if (f.clients === 0) return "no_clients";
  return null;
}
