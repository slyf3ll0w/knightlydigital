/**
 * Provider-sent (automated) SMS via Telnyx — the paid counterpart to the free
 * sms: deep links in lib/messaging.ts. Env-gated like Resend in lib/email.ts:
 * without TELNYX_API_KEY + TELNYX_MESSAGING_PROFILE_ID every send is a silent
 * no-op, so the code ships dark and lights up when the keys land.
 *
 * Sends go out via the messaging profile's number pool (sticky sender), not a
 * hardcoded from-number — adding numbers to the pool needs no code changes.
 * Telnyx auto-handles STOP/HELP at their edge; our own record of opt-outs
 * lives on Contact.smsOptOut (flipped by the inbound webhook). Consent lives
 * on Contact.smsConsentAt. Every sender is expected to gate on canText()
 * (lib/sms-consent.ts) before calling sendSms.
 *
 * Every template opens with "WorkBench:" — the toll-free number is verified
 * under the WorkBench brand, so that is the name the recipient opted in to;
 * the business they hired is named right after.
 */

import { prisma } from "@/lib/db";
import { recordSmsSent, smsSegmentCount, usageDay } from "@/lib/usage";

export { canText, smsConsentLabel, SMS_TERMS_URL } from "@/lib/sms-consent";

// Per-company daily send ceiling. Usage is metered per segment already; this
// turns the meter into a cap so a runaway loop or a hijacked login can't run
// up the Telnyx bill. Generous for a 1–8 tech shop; raise per-tenant later.
const SMS_DAILY_CAP = Math.max(1, parseInt(process.env.SMS_DAILY_CAP ?? "500", 10) || 500);

async function underDailyCap(companyId: string): Promise<boolean> {
  try {
    const row = await prisma.companyUsageDaily.findUnique({
      where: { companyId_day: { companyId, day: usageDay() } },
      select: { smsSent: true },
    });
    if ((row?.smsSent ?? 0) < SMS_DAILY_CAP) return true;
    console.warn(`[sms] daily cap (${SMS_DAILY_CAP}) reached for company ${companyId}`);
    return false;
  } catch {
    return true; // metering must never block a send on its own failure
  }
}

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;

export function smsEnabled(): boolean {
  return Boolean(TELNYX_API_KEY && MESSAGING_PROFILE_ID);
}

/**
 * Freeform phone (contacts store whatever was typed) → E.164, US-defaulted.
 * Returns null when the number can't be made dialable — callers should just
 * skip the text.
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return digits.length >= 8 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms({
  to,
  text,
  companyId,
}: {
  to: string;
  text: string;
  /** Tenant to meter this send against (lib/usage.ts) — SMS bills per segment. */
  companyId?: string | null;
}): Promise<boolean> {
  if (!smsEnabled()) return false;
  const e164 = toE164(to);
  if (!e164) return false;
  if (companyId && !(await underDailyCap(companyId))) return false;
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      // Same rule as email: an awaited send must be bounded
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        to: e164,
        text,
        messaging_profile_id: MESSAGING_PROFILE_ID,
        type: "SMS",
      }),
    });
    if (!res.ok) {
      console.error("[sms] telnyx send failed:", res.status, await res.text());
    } else {
      recordSmsSent(companyId, smsSegmentCount(text));
    }
    return res.ok;
  } catch (err) {
    console.error("[sms] telnyx send threw:", err);
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Message templates. Kept terse on purpose — SMS bills per 160-char segment,
 * and carriers expect opt-out language on business-initiated texts (CTIA).
 * ------------------------------------------------------------------------ */

const OPT_OUT = "Reply STOP to opt out.";
const BRAND = "WorkBench:";

/** Appointment reminder: the day before, and again about an hour out. */
export function appointmentReminderText({
  companyName,
  firstName,
  serviceName,
  windowLabel,
  address,
  stage,
}: {
  companyName: string;
  firstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
  stage: "day" | "hour";
}): string {
  const where = address ? ` at ${address}` : "";
  return stage === "day"
    ? `${BRAND} Hi ${firstName}, a reminder from ${companyName}: ${serviceName}, ${windowLabel}${where}. ${OPT_OUT}`
    : `${BRAND} Hi ${firstName}, ${companyName} will arrive soon for ${serviceName} (${windowLabel}). ${OPT_OUT}`;
}

/** Quote link — texted alongside the email when a quote is sent. */
export function quoteLinkText({
  companyName,
  firstName,
  quoteNumber,
  total,
  viewUrl,
}: {
  companyName: string;
  firstName: string;
  quoteNumber: number;
  total: number;
  viewUrl: string;
}): string {
  return `${BRAND} Hi ${firstName}, ${companyName} sent you quote #${quoteNumber} for $${total.toFixed(2)}. View & approve: ${viewUrl} ${OPT_OUT}`;
}

/** Invoice pay link — texted alongside the email when an invoice is sent. */
export function invoiceLinkText({
  companyName,
  firstName,
  invoiceNumber,
  total,
  payUrl,
}: {
  companyName: string;
  firstName: string;
  invoiceNumber: number;
  total: number;
  payUrl: string;
}): string {
  return `${BRAND} Hi ${firstName}, ${companyName} sent you invoice #${invoiceNumber} for $${total.toFixed(2)}. View & pay: ${payUrl} ${OPT_OUT}`;
}
