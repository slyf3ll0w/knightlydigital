import { prisma } from "@/lib/db";
import { bookingRescheduledEmail, emailEnabled, sendEmail } from "@/lib/email";
import { sendSms, smsEnabled } from "@/lib/sms";
import { arrivalSlotLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";

/**
 * "Tell the client their visit moved" — the one place the calendar's
 * Undo toast, the day-shift action, and the route optimizer's Apply all
 * send from. Text first (when the tenant has SMS and the client hasn't
 * opted out), email otherwise; both when both are possible so the client
 * has a written record either way.
 *
 * Jobs speak in arrival windows (the promise the company makes); phone and
 * video appointments are exact times. Anytime visits say "during the day".
 */

const companySelect = {
  id: true,
  name: true,
  email: true,
  timezone: true,
  arrivalWindowMinutes: true,
  brandColor: true,
  documentColor: true,
  brandColorSecondary: true,
  logoUrl: true,
} as const;

const contactSelect = { firstName: true, email: true, phone: true, smsOptOut: true } as const;

export type MoveNoticeResult = { sent: boolean; via: ("sms" | "email")[]; reason?: string };

function dayLabel(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(d);
}

export async function notifyClientOfMove(params: {
  companyId: string;
  kind: "job" | "appointment";
  id: string;
  /** Where it was before the move, for the "moved from" line. */
  previousStart?: Date | null;
  previousAnytime?: boolean;
}): Promise<MoveNoticeResult> {
  const { companyId, kind, id } = params;

  let contact: { firstName: string; email: string | null; phone: string | null; smsOptOut: boolean };
  let company: {
    id: string; name: string; email: string | null; timezone: string; arrivalWindowMinutes: number;
    brandColor: string | null; documentColor: string | null; brandColorSecondary: string | null; logoUrl: string | null;
  };
  let title: string;
  let address: string | null;
  let start: Date | null;
  let anytime: boolean;
  let windowMinutes: number;
  let exact = false;

  if (kind === "job") {
    const job = await prisma.job.findFirst({
      where: { id, companyId },
      select: {
        title: true,
        address: true,
        scheduledAt: true,
        scheduledAnytime: true,
        arrivalWindowMinutes: true,
        contact: { select: contactSelect },
        company: { select: companySelect },
      },
    });
    if (!job) return { sent: false, via: [], reason: "not_found" };
    contact = job.contact;
    company = job.company;
    title = job.title;
    address = job.address;
    start = job.scheduledAt;
    anytime = job.scheduledAnytime;
    windowMinutes = resolveArrivalWindowMinutes(job.arrivalWindowMinutes, job.company.arrivalWindowMinutes);
  } else {
    const appt = await prisma.appointment.findFirst({
      where: { id, companyId },
      select: {
        title: true,
        type: true,
        address: true,
        scheduledAt: true,
        scheduledAnytime: true,
        arrivalWindowMinutes: true,
        contact: { select: contactSelect },
        company: { select: companySelect },
      },
    });
    if (!appt) return { sent: false, via: [], reason: "not_found" };
    contact = appt.contact;
    company = appt.company;
    title = appt.title;
    address = appt.type === "IN_PERSON" ? appt.address : null;
    start = appt.scheduledAt;
    anytime = appt.scheduledAnytime;
    exact = appt.type !== "IN_PERSON";
    windowMinutes = exact ? 0 : resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, appt.company.arrivalWindowMinutes);
  }

  if (!start) return { sent: false, via: [], reason: "unscheduled" };

  const tz = company.timezone || "America/Chicago";
  const windowLabel = anytime
    ? `${dayLabel(tz, start)}, during the day`
    : arrivalSlotLabel(tz, start, windowMinutes);
  const previousLabel = params.previousStart
    ? params.previousAnytime
      ? `${dayLabel(tz, params.previousStart)}`
      : arrivalSlotLabel(tz, params.previousStart, windowMinutes)
    : null;

  const canEmail = emailEnabled() && Boolean(contact.email);
  const canSms = smsEnabled() && Boolean(contact.phone) && !contact.smsOptOut;
  if (!canEmail && !canSms) {
    return { sent: false, via: [], reason: contact.smsOptOut && !contact.email ? "opted_out" : "no_contact_method" };
  }

  const via: ("sms" | "email")[] = [];

  if (canSms && contact.phone) {
    const where = address ? ` at ${address}` : "";
    const text = `Hi ${contact.firstName}, ${company.name} has moved your ${title} to ${windowLabel}${where}. Reply if that doesn't work. Reply STOP to opt out.`;
    if (await sendSms({ companyId, to: contact.phone, text })) via.push("sms");
  }

  if (canEmail && contact.email) {
    const { subject, html } = bookingRescheduledEmail({
      brand: company,
      companyName: company.name,
      companyEmail: company.email,
      contactFirstName: contact.firstName,
      serviceName: title,
      windowLabel,
      previousLabel,
      address,
      extras: { exactTime: exact || anytime },
    });
    const ok = await sendEmail({
      companyId,
      to: contact.email,
      subject,
      html,
      replyTo: company.email || undefined,
      fromName: company.name,
    });
    if (ok) via.push("email");
  }

  return { sent: via.length > 0, via, reason: via.length ? undefined : "send_failed" };
}
