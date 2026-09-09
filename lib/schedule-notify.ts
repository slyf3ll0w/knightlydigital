import { prisma } from "@/lib/db";
import { bookingRescheduledEmail, emailEnabled, sendEmail } from "@/lib/email";
import { sendSms, smsEnabled } from "@/lib/sms";
import { arrivalSlotLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { notifyContact } from "@/lib/push";

/**
 * "Tell the client their visit moved" — the one place the calendar's
 * Undo toast, the day-shift action, and the route optimizer's Apply all
 * send from.
 *
 * The message always lands in the client's portal thread (the same
 * two-way thread the Messages inbox uses), with a push to their hub if
 * they've enabled it — so it's on the record and reachable even when the
 * tenant has no SMS provider. On top of that: a text when SMS is live and
 * the client hasn't opted out, and the branded email when they have one.
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

const contactSelect = { id: true, firstName: true, email: true, phone: true, smsOptOut: true, hubToken: true } as const;

export type MoveNoticeResult = { sent: boolean; via: ("portal" | "sms" | "email")[]; reason?: string };

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
  /** Team member the portal message shows as the sender (null = the company). */
  senderId?: string | null;
}): Promise<MoveNoticeResult> {
  const { companyId, kind, id } = params;

  let contact: { id: string; firstName: string; email: string | null; phone: string | null; smsOptOut: boolean; hubToken: string };
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

  const via: ("portal" | "sms" | "email")[] = [];
  const where = address ? ` at ${address}` : "";
  const line = `Hi ${contact.firstName}, ${company.name} has moved your ${title} to ${windowLabel}${where}${
    previousLabel ? ` (was ${previousLabel})` : ""
  }. Reply here if that doesn't work.`;

  // 1. The portal thread — always. It's the record, and the hub shows it
  //    the next time they open a link from the company.
  try {
    await prisma.portalMessage.create({
      data: {
        companyId,
        contactId: contact.id,
        direction: "OUTBOUND",
        senderId: params.senderId ?? null,
        body: line,
        via: "portal",
      },
    });
    via.push("portal");
    await notifyContact(contact.id, {
      title: company.name,
      body: line.length > 140 ? `${line.slice(0, 139)}…` : line,
      url: `/hub/${contact.hubToken}/messages`,
      tag: `portal-thread-${contact.id}`,
    }).catch(() => {});
  } catch (err) {
    console.error("[schedule-notify] portal post failed:", err);
  }

  const canEmail = emailEnabled() && Boolean(contact.email);
  const canSms = smsEnabled() && Boolean(contact.phone) && !contact.smsOptOut;

  if (canSms && contact.phone) {
    const text = `${line} Reply STOP to opt out.`;
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

  if (via.length === 0) {
    return { sent: false, via, reason: contact.smsOptOut && !contact.email ? "opted_out" : "send_failed" };
  }
  return { sent: true, via };
}
