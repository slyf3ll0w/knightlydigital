/**
 * Platform-level alerts: things only the operator can fix (Telnyx out of
 * funds, …), as distinct from tenant notifications (lib/push.ts) and the
 * reconciliation report (lib/reconcile.ts, which shares operatorEmail()).
 *
 * Each alert key is deduped through the rate-limit store so a condition that
 * persists for a day produces one email, not one per request or cron tick.
 */
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { limit } from "@/lib/rate-limit";

const TELNYX_BILLING_URL = "https://portal.telnyx.com/#/app/account/billing";

/** Who hears about platform trouble: PLATFORM_ALERT_EMAIL, else RECONCILE_ALERT_EMAIL, else the oldest superadmin. */
export async function operatorEmail(): Promise<string | null> {
  const fromEnv = process.env.PLATFORM_ALERT_EMAIL ?? process.env.RECONCILE_ALERT_EMAIL ?? null;
  if (fromEnv) return fromEnv;
  const superadmin = await prisma.user.findFirst({
    where: { role: "SUPERADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return superadmin?.email ?? null;
}

/**
 * Email the operator at most once per `dedupeMs` per key. Never throws — an
 * alert that fails to send must not turn a tenant's request into a 500.
 */
export async function alertOperator(
  key: string,
  subject: string,
  html: string,
  dedupeMs = 6 * 60 * 60_000
): Promise<boolean> {
  try {
    if (!(await limit(`ops-alert:${key}`, 1, dedupeMs)).ok) return false;
    const to = await operatorEmail();
    if (!to) {
      console.error(`[ops-alert] ${key}: no operator email configured`);
      return false;
    }
    await sendEmail({ to, subject, html });
    return true;
  } catch (err) {
    console.error(`[ops-alert] ${key} failed:`, err);
    return false;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Telnyx refused something because the platform's prepaid balance is gone.
 * The tenant already got a calm "paused on our side" message; this is the
 * operator's side of it. `context` says what was refused and for whom.
 */
export async function alertTelnyxFunds(context: string): Promise<void> {
  console.error(`[telnyx] out of funds: ${context}`);
  await alertOperator(
    "telnyx-funds",
    "Telnyx account is out of funds — business-line actions are paused",
    `<p>Telnyx refused a request because the account balance is exhausted.</p>
<p><strong>What was refused:</strong> ${esc(context)}</p>
<p>Top up at <a href="${TELNYX_BILLING_URL}">${TELNYX_BILLING_URL}</a> and turn on auto-recharge there
(threshold + amount, $10 minimum) so this doesn't repeat.</p>
<p>What happens next on its own: queued texting registrations are re-filed by the hourly sweep once funds are
back; calls, number purchases and softphone setup work again immediately. Tenants saw a
"paused on our side" notice, not Telnyx's billing message.</p>
<p style="color:#6b7280;font-size:12px">You'll get this email at most once every six hours while the condition lasts.</p>`
  );
}
