import { reportError } from "@/lib/report-error";
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
  mediaUrls,
}: {
  to: string;
  text: string;
  /** Tenant to meter this send against (lib/usage.ts) — SMS bills per segment. */
  companyId?: string | null;
  /** The client being texted, when known — lets the inbound webhook route their reply. */
  contactId?: string | null;
  /**
   * Pictures/clips to send as MMS (public URLs Telnyx can fetch — lib/message-media.ts
   * publicMmsUrls). With any, the message goes as MMS, text optional, up to 10.
   */
  mediaUrls?: string[];
}): Promise<boolean> {
  if (!smsEnabled()) return false;
  const e164 = toE164(to);
  if (!e164) return false;
  const media = (mediaUrls ?? []).slice(0, 10);
  if (!text && media.length === 0) return false;
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
        ...(text ? { text } : {}),
        ...(media.length ? { media_urls: media } : {}),
        // The line's own profile once it has one (brand-named STOP/HELP replies), else the shared one
        messaging_profile_id: sender.profileId ?? MESSAGING_PROFILE_ID,
        type: media.length ? "MMS" : "SMS",
      }),
    });
    if (!res.ok) {
      reportError("[sms] telnyx send failed:", res.status, await res.text());
    } else {
      // An MMS is one message at roughly twice the per-segment rate (1.5¢ vs 0.7¢ in
      // lib/platform-costs.ts), so it is metered as two segments.
      recordSmsSent(companyId, media.length ? 2 : smsSegmentCount(text));
      await logSmsSend({ companyId, contactId, to: e164, from });
    }
    return res.ok;
  } catch (err) {
    reportError("[sms] telnyx send threw:", err);
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
    reportError("[sms] send log failed:", err);
  }
}

/* ---------------------------------------------------------------------------
 * Message templates. Kept terse on purpose — SMS bills per 160-char segment,
 * and carriers expect opt-out language on business-initiated texts (CTIA).
 * ------------------------------------------------------------------------ */

const OPT_OUT = "Reply STOP to opt out.";

/**
 * How the client and the business meet. Appointments carry their own type;
 * a job visit is always in person ("VISIT").
 */
export type MeetingKind = "PHONE_CALL" | "VIDEO_CALL" | "IN_PERSON" | "VISIT";

/** "call" / "video call" / "visit" — the noun after the service name. */
export function meetingNoun(kind: MeetingKind): string {
  return kind === "PHONE_CALL" ? "call" : kind === "VIDEO_CALL" ? "video call" : "visit";
}

/** "Estimate call", "Estimate video call", "Estimate visit" (no doubled word). */
export function meetingLabel(serviceName: string, kind: MeetingKind): string {
  const noun = meetingNoun(kind);
  const s = serviceName.trim();
  return new RegExp(`\\b${noun}\\b`, "i").test(s) ? s : `${s} ${noun}`;
}

export type MeetingTextArgs = {
  companyName: string;
  firstName: string;
  serviceName: string;
  kind: MeetingKind;
  /** Day stage / confirmations: "Tue, Oct 7, 3:00 PM" or "…, 3:00 PM – 5:00 PM". */
  windowLabel: string;
  /** Hour stage: the time alone — "3:00 PM" or "3:00 PM – 5:00 PM". */
  timeLabel?: string;
  address?: string | null;
  /** PHONE_CALL: the number the business will call. */
  phone?: string | null;
  /** VIDEO_CALL: the join link. */
  meetingLink?: string | null;
};

const RESCHEDULE_HINT = "Need a different time? Just reply.";

/**
 * Appointment / visit reminder: about a day ahead, and again about an hour
 * out. Calls say the business will CALL; video calls carry the link; only an
 * in-person visit says anyone will arrive (and promises the arrival window,
 * never the dispatch minute).
 */
export function appointmentReminderText(args: MeetingTextArgs & { stage: "day" | "hour" }): string {
  const { companyName, firstName, serviceName, kind, windowLabel, address, phone, meetingLink, stage } = args;
  const time = args.timeLabel ?? windowLabel;
  const what = meetingLabel(serviceName, kind);
  const where = address ? ` at ${address}` : "";
  const callAt = phone ? ` We'll call you at ${phone}.` : " We'll call you.";
  const join = meetingLink ? ` Join: ${meetingLink}` : "";

  if (stage === "day") {
    if (kind === "PHONE_CALL")
      return `Hi ${firstName}, reminder from ${companyName}: your ${what} is ${windowLabel}.${callAt} ${RESCHEDULE_HINT} ${OPT_OUT}`;
    if (kind === "VIDEO_CALL")
      return `Hi ${firstName}, reminder from ${companyName}: your ${what} is ${windowLabel}.${join} ${RESCHEDULE_HINT} ${OPT_OUT}`;
    return `Hi ${firstName}, reminder from ${companyName}: your ${what} is ${windowLabel}${where}. ${RESCHEDULE_HINT} ${OPT_OUT}`;
  }
  if (kind === "PHONE_CALL")
    return `Hi ${firstName}, ${companyName} will call you${phone ? ` at ${phone}` : ""} for your ${what} at ${time} today. ${OPT_OUT}`;
  if (kind === "VIDEO_CALL")
    return `Hi ${firstName}, your ${what} with ${companyName} starts at ${time} today.${join} ${OPT_OUT}`;
  const arrive = /–/.test(time) ? `between ${time.replace(" – ", " and ")}` : `at ${time}`;
  return `Hi ${firstName}, ${companyName} will arrive for your ${what} ${arrive} today${where}. ${OPT_OUT}`;
}

/**
 * Online-booking confirmations — the text counterpart of the booking emails
 * (lib/booking-submit.ts notifyBooking, lib/booking-checkout.ts). The filed
 * campaign promises "your appointment is confirmed" texts; this is that text.
 */
export function bookingConfirmationText(
  args: MeetingTextArgs & {
    event: "confirmed" | "received" | "rescheduled" | "cancelled";
    /** Self-serve reschedule/cancel page, when the booking type allows it. */
    manageUrl?: string | null;
    /** Cancelled: where to book again. */
    rebookUrl?: string | null;
  }
): string {
  const { companyName, firstName, serviceName, kind, windowLabel, address, phone, meetingLink, event } = args;
  const what = meetingLabel(serviceName, kind);
  const where = address ? ` at ${address}` : "";
  const how =
    kind === "PHONE_CALL" ? ` We'll call you${phone ? ` at ${phone}` : ""}.` : kind === "VIDEO_CALL" && meetingLink ? ` Join: ${meetingLink}` : "";
  const manage = args.manageUrl ? ` Reschedule or cancel: ${args.manageUrl}` : "";
  switch (event) {
    case "received":
      return `Hi ${firstName}, ${companyName} got your request for ${aOrAn(what)} on ${windowLabel}${where}. We'll confirm shortly. ${OPT_OUT}`;
    case "rescheduled":
      return `Hi ${firstName}, your ${what} with ${companyName} has moved to ${windowLabel}${where}.${how}${manage} ${OPT_OUT}`;
    case "cancelled":
      return `Hi ${firstName}, your ${what} with ${companyName} on ${windowLabel} has been cancelled.${args.rebookUrl ? ` Book again: ${args.rebookUrl}` : ""} ${OPT_OUT}`;
    default:
      return `Hi ${firstName}, your ${what} with ${companyName} is booked for ${windowLabel}${where}.${how}${manage} ${OPT_OUT}`;
  }
}

function aOrAn(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
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
