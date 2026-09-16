import { prisma } from "@/lib/db";
import { sendEmail, bookingDeclinedEmail } from "@/lib/email";
import { slotLabel } from "@/lib/booking-engine";
import { resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { companyManagerIds, notifyUsers } from "@/lib/push";

/**
 * "Hold for approval" bookings that nobody answered.
 *
 * A self-scheduled booking on an APPROVAL item parks a tentative appointment
 * on the schedule (the slot is held) and a NEEDS_APPROVAL request that the
 * team accepts or declines. Until now nothing happened if they did neither:
 * the slot stayed blocked, the client's hub said "Awaiting confirmation"
 * forever, no reminders went out. Two sweeps, both from the hourly cron:
 *
 *  1. Expire — EXPIRE_HOURS before the slot starts, an unanswered booking is
 *     declined the same way a person declining it would be: appointment
 *     cancelled, request archived, client emailed "we couldn't fit this in",
 *     owners pushed so they know it went unanswered.
 *  2. Nudge — once a morning (company-local NUDGE_HOUR) while any booking is
 *     still waiting, owners get a push with the count. The push tag replaces
 *     an earlier one on the device, so a cron that ticks twice in that hour
 *     doesn't stack notifications.
 *
 * Idempotent: expiry claims rows by flipping the request status inside the
 * transaction; a request already moved on is skipped.
 */
export const EXPIRE_HOURS = 2;
export const NUDGE_HOUR = 8;

export async function expireApprovalBookings(now: Date): Promise<{ expired: number; nudged: number }> {
  let expired = 0;
  let nudged = 0;

  // ── 1. Expire ─────────────────────────────────────────────────────────
  const cutoff = new Date(now.getTime() + EXPIRE_HOURS * 3600_000);
  const stale = await prisma.appointment.findMany({
    where: {
      tentative: true,
      status: "SCHEDULED",
      scheduledAt: { lte: cutoff },
      request: { status: "NEEDS_APPROVAL" },
      company: { suspendedAt: null },
    },
    include: {
      request: { select: { id: true, title: true, contactId: true } },
      contact: { select: { id: true, firstName: true, email: true } },
      company: {
        select: {
          id: true,
          name: true,
          email: true,
          timezone: true,
          arrivalWindowMinutes: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  for (const appt of stale) {
    if (!appt.request) continue;
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        // The claim: only the request still waiting flips. A staff accept or
        // decline that lands in the same second wins and we do nothing.
        const r = await tx.request.updateMany({
          where: { id: appt.request!.id, status: "NEEDS_APPROVAL" },
          data: { status: "ARCHIVED" },
        });
        if (r.count === 0) return false;
        await tx.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } });
        return true;
      });
      if (!claimed) continue;
      expired += 1;

      const exactTime = appt.type !== "IN_PERSON";
      const windowMinutes = exactTime ? 0 : resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, appt.company.arrivalWindowMinutes);
      const windowLabel = slotLabel(appt.company.timezone, appt.scheduledAt, new Date(appt.scheduledAt.getTime() + windowMinutes * 60000));

      if (appt.contact.email) {
        const { subject, html } = bookingDeclinedEmail({
          brand: appt.company,
          companyName: appt.company.name,
          companyEmail: appt.company.email,
          contactFirstName: appt.contact.firstName,
          serviceName: appt.request.title,
          windowLabel,
        });
        await sendEmail({
          companyId: appt.company.id,
          to: appt.contact.email,
          subject,
          html,
          replyTo: appt.company.email || undefined,
          fromName: appt.company.name,
        });
      }

      const targets = new Set(await companyManagerIds(appt.company.id));
      if (appt.assignedToId) targets.add(appt.assignedToId);
      await notifyUsers([...targets], {
        title: "Booking expired unanswered",
        body: `${appt.contact.firstName}'s ${appt.request.title} (${windowLabel}) was never accepted — the time was released and they were told.`,
        url: `/app/requests/${appt.request.id}`,
        tag: `request-${appt.request.id}`,
      });
    } catch (err) {
      console.error("[approval-bookings] expire failed for appointment", appt.id, err);
    }
  }

  // ── 2. Morning nudge ──────────────────────────────────────────────────
  const waiting = await prisma.request.groupBy({
    by: ["companyId"],
    where: { status: "NEEDS_APPROVAL", company: { suspendedAt: null } },
    _count: { _all: true },
  });
  if (waiting.length > 0) {
    const companies = await prisma.company.findMany({
      where: { id: { in: waiting.map((w) => w.companyId) } },
      select: { id: true, timezone: true },
    });
    for (const company of companies) {
      if (localHour(company.timezone, now) !== NUDGE_HOUR) continue;
      const count = waiting.find((w) => w.companyId === company.id)?._count._all ?? 0;
      if (count === 0) continue;
      try {
        await notifyUsers(await companyManagerIds(company.id), {
          title: count === 1 ? "1 booking awaiting approval" : `${count} bookings awaiting approval`,
          body:
            count === 1
              ? "A client picked a time and is waiting to hear back. Accept or decline it from the request."
              : "Clients picked times and are waiting to hear back. Accept or decline them from their requests.",
          url: "/app/requests",
          tag: `approvals-${company.id}`,
        });
        nudged += 1;
      } catch (err) {
        console.error("[approval-bookings] nudge failed for company", company.id, err);
      }
    }
  }

  return { expired, nudged };
}

function localHour(tz: string, at: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at));
  } catch {
    return at.getUTCHours();
  }
}
