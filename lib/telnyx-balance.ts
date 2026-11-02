import { reportError } from "@/lib/report-error";
import { alertOperator } from "@/lib/ops-alert";
import { getTelnyxBalance, telnyxConfigured } from "@/lib/telnyx";

/**
 * Telnyx prepaid-balance watch (docs/plans/telnyx-balance-watch-2026-09-22.md,
 * built 2026-11-02). Every tenant's business line runs on the platform's one
 * Telnyx account; at zero Telnyx refuses every call, text and registration.
 * The hourly cron reads the balance and emails the operator when it slides
 * under the warn / critical lines, deduped so a low balance nags once a day
 * (warn) or every six hours (critical). Telnyx's own auto-recharge stays the
 * first line of defence; this notices when it silently stops working.
 *
 *   TELNYX_BALANCE_WARN      dollars, default 25
 *   TELNYX_BALANCE_CRITICAL  dollars, default 10
 */
export type BalanceLevel = "ok" | "warn" | "critical";

export function balanceThresholds(env: Record<string, string | undefined> = process.env): { warn: number; critical: number } {
  const warn = Number(env.TELNYX_BALANCE_WARN ?? 25);
  const critical = Number(env.TELNYX_BALANCE_CRITICAL ?? 10);
  return { warn: Number.isFinite(warn) ? warn : 25, critical: Number.isFinite(critical) ? critical : 10 };
}

/** Pure: which line a balance sits under. */
export function balanceLevel(balance: number, t = balanceThresholds()): BalanceLevel {
  if (balance <= t.critical) return "critical";
  if (balance <= t.warn) return "warn";
  return "ok";
}

export async function runTelnyxBalanceWatch(): Promise<{ balance: number | null; level: BalanceLevel | null; alerted: boolean }> {
  if (!telnyxConfigured()) return { balance: null, level: null, alerted: false };
  let balance: number;
  try {
    balance = (await getTelnyxBalance()).balance;
  } catch (err) {
    reportError("[telnyx-balance] read failed", err);
    return { balance: null, level: null, alerted: false };
  }
  const t = balanceThresholds();
  const level = balanceLevel(balance, t);
  if (level === "ok") return { balance, level, alerted: false };
  const money = (n: number) => `$${n.toFixed(2)}`;
  const alerted = await alertOperator(
    level === "critical" ? "telnyx-balance-critical" : "telnyx-balance-warn",
    level === "critical"
      ? `Telnyx balance ${money(balance)} — calls and texts will start failing`
      : `Telnyx balance is low (${money(balance)})`,
    `<p>The platform's Telnyx prepaid balance is <strong>${money(balance)}</strong> (${level === "critical" ? "critical" : "warn"} line: ${money(level === "critical" ? t.critical : t.warn)}).</p>
<p>At zero Telnyx refuses every call, text, number purchase and texting registration for every business on a Voice plan. Top up and check auto-recharge in Mission Control → Billing.</p>
<p style="color:#6b7280;font-size:12px">You'll get this at most ${level === "critical" ? "every six hours" : "once a day"} while it lasts.</p>`,
    level === "critical" ? 6 * 60 * 60_000 : 24 * 60 * 60_000
  );
  return { balance, level, alerted };
}
