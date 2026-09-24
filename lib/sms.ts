/**
 * Provider-sent (automated) SMS via Telnyx — the paid counterpart to the free
 * sms: deep links in lib/messaging.ts. Env-gated like Resend in lib/email.ts:
 * without TELNYX_API_KEY + TELNYX_MESSAGING_PROFILE_ID every send is a silent
 * no-op, so the code ships dark and lights up when the keys land.
 *
 * Every text goes out FROM THE COMPANY'S OWN NUMBER (Company.lineNumber,
 * lib/business-line.ts) — carriers register A2P texting per business,
 * two-party, so a shared WorkBench sender was never going to clear (Telnyx
 * rejected it 2026-09-14). sendSms therefore refuses until the tenant has a
 * number AND its 10DLC registration is ACTIVE, on top of the two older gates:
 * canText() (lib/sms-consent.ts — per-client) which every sender checks
 * first, and Company.smsAcknowledgedAt (the one-time consent attestation a
 * manager makes in Settings). Telnyx auto-handles STOP/HELP at their edge;
 * our own record of opt-outs lives on Contact.smsOptOut (flipped by the
 * inbound webhook). Texts are on by default; Contact.smsDisabled is the
 * per-client off switch.
 *
 * Templates name the business, never WorkBench: the number is registered
 * under the business's brand, so that is who the recipient opted in to.
 *
 * TELNYX_ALLOW_UNREGISTERED=1 (staging only) lets a provisioned-but-not-yet-
 * registered number send — Telnyx delivers those to the account's verified
 * test numbers, which is how the line is smoke-tested before TCR clears.
 */

import { prisma } from "@/lib/db";
import { phoneDigits } from "@/lib/phone";
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

// The company-level gates, resolved to the number a text may go out from:
//  - smsAcknowledgedAt: a manager turned text notifications on once in
//    Settings, acknowledging that their clients gave them their numbers;
//  - lineNumber + an ACTIVE MessagingRegistration: the business has its own
//    registered number (lib/business-line.ts).
// Null = nothing goes out for that tenant, whatever the contact row says.
// Fails closed — the attestation and the registration are what make the
// send legitimate.
async function companySender(companyId: string): Promise<{ from: string; profileId: string | null } | null> {
  try {
    const row = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        smsAcknowledgedAt: true,
        lineNumber: true,
        lineMessagingProfileId: true,
        messagingRegistration: { select: { status: true } },
      },
    });
    if (!row?.smsAcknowledgedAt) return null;
    const number = row.lineNumber;
    if (!number || number.startsWith("pending:")) return null;
    const registered = row.messagingRegistration?.status === "ACTIVE";
    if (!registered && process.env.TELNYX_ALLOW_UNREGISTERED !== "1") return null;
    return { from: number, profileId: row.lineMessagingProfileId };
  } catch {
    return null;
  }
}

/** Can this company send provider texts right now? (UI hint; sendSms re-checks.) */
export async function companyCanSendSms(companyId: string): Promise<boolean> {
  return smsEnabled() && Boolean(await companySender(companyId));
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
  contactId,
}: {
  to: string;
  text: string;
  /** Tenant to meter this send against (lib/usage.ts) — SMS bills per segment. */
  companyId?: string | null;
  /** The client being texted, when known — lets the inbound webhook route their reply. */
  contactId?: string | null;
}): Promise<boolean> {
  if (!smsEnabled()) return false;
  const e164 = toE164(to);
  if (!e164) return false;
  // Every text belongs to a business; there is no platform sender any more.
  if (!companyId) return false;
  const sender = await companySender(companyId);
  if (!sender) return false;
  const { from } = sender;
  if (!(await underDailyCap(companyId))) return false;
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
        from,
        to: e164,
        text,
        // The line's own profile once it has one (brand-named STOP/HELP replies), else the shared one
        messaging_profile_id: sender.profileId ?? MESSAGING_PROFILE_ID,
        type: "SMS",
      }),
    });
    if (!res.ok) {
      console.error("[sms] telnyx send failed:", res.status, await res.text());
    } else {
      recordSmsSent(companyId, smsSegmentCount(text));
      await logSmsSend({ companyId, contactId, to: e164, from });
    }
    return res.ok;
  } catch (err) {
    console.error("[sms] telnyx send threw:", err);
    return false;
  }
}

/**
 * Remember who texted this number (SmsSend): the inbound webhook scopes a
 * STOP to the companies that actually texted it, and it's the audit trail
 * behind "Texted Maria". Best-effort — a failed log must not turn a
 * delivered text into a reported failure.
 */
async function logSmsSend({
  companyId,
  contactId,
  to,
  from,
}: {
  companyId: string;
  contactId?: string | null;
  to: string;
  from: string;
}): Promise<void> {
  const toDigits = phoneDigits(to);
  if (!toDigits) return;
  try {
    await prisma.smsSend.create({ data: { companyId, contactId: contactId ?? null, toDigits, fromNumber: from } });
  } catch (err) {
    console.error("[sms] send log failed:", err);
  }
}

/* ---------------------------------------------------------------------------
 * Message templates. Kept terse on purpose — SMS bills per 160-char segment,
 * and carriers expect opt-out language on business-initiated texts (CTIA).
 * ------------------------------------------------------------------------ */

const OPT_OUT = "Reply STOP to opt out.";

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
    ? `Hi ${firstName}, a reminder from ${companyName}: ${serviceName}, ${windowLabel}${where}. ${OPT_OUT}`
    : `Hi ${firstName}, ${companyName} will arrive soon for ${serviceName} (${windowLabel}). ${OPT_OUT}`;
}

/** Invoice pay link — texted alongside the email when an invoice is sent. */
export function invoiceLinkText({
  companyName,
  firstName,
  invoiceNumber,
  total,
  payUrl,
  payable = true,
}: {
  companyName: string;
  firstName: string;
  invoiceNumber: number;
  total: number;
  payUrl: string;
  /** False when the company can't take online payments — "View" not "View & pay". */
  payable?: boolean;
}): string {
  return `Hi ${firstName}, ${companyName} sent you invoice #${invoiceNumber} for $${total.toFixed(2)}. ${payable ? "View & pay" : "View"}: ${payUrl} ${OPT_OUT}`;
}
