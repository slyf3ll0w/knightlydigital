import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  sendEmail,
  bookingConfirmedEmail,
  bookingReceivedEmail,
  bookingRescheduledEmail,
  bookingCancelledEmail,
  bookingTeamNoticeEmail,
  type BookingExtras,
} from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { companyManagerIds, notifyUsers } from "@/lib/push";
import { defaultLeadAssignee } from "@/lib/permissions";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { icsAttachment } from "@/lib/ics";
import { generateSlots, slotLabel, type EngineRules, type Slot } from "@/lib/booking-engine";
import {
  assignMemberForSlot,
  horizonEnd,
  loadPoolWithBusy,
  locateTarget,
  rulesFor,
  type BookingCompany,
  type LoadedBookingType,
} from "@/lib/booking-runtime";
import { KIND_META } from "@/lib/booking-types";

/**
 * The write side of online scheduling: turn a validated slot pick into a
 * contact + request + appointment (calls, estimates), record the rotation,
 * and send the confirmation / approval emails with an .ics attached.
 * SERVICE kinds (quote → job, optional payment) live in lib/booking-checkout.ts
 * and share the pieces below.
 */

export class SlotTakenError extends Error {}

export const APP_URL = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";

export type BookingCompanyRow = BookingCompany & {
  name: string;
  slug: string;
  email: string | null;
  serviceZips: string[];
  brandColor: string | null;
  brandColorSecondary: string | null;
  documentColor: string | null;
  logoUrl: string | null;
};

export type CustomerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  /** Client hub: the signed-in contact — no matching, no lead, source client_hub */
  contactId?: string | null;
};

/**
 * Validate the picked start against a fresh full sweep (not the sampled
 * subset the page showed — the display cap samples different slots as the
 * day's candidate count shifts). Returns the slot or null when it's gone.
 */
export async function verifySlotPick(
  type: LoadedBookingType,
  company: BookingCompany,
  opts: { address: string | null; durationMinutes?: number; start: Date; now: Date; excludeAppointmentId?: string | null }
): Promise<{ slot: Slot; rules: EngineRules } | null> {
  const meta = KIND_META[type.kind];
  const target = meta.needsAddress ? await locateTarget(opts.address, company.id) : null;
  const members = await loadPoolWithBusy(type, opts.now, horizonEnd(type, opts.now), {
    locate: Boolean(target),
    excludeAppointmentId: opts.excludeAppointmentId,
  });
  const rules = rulesFor(type, company, { target, durationMinutes: opts.durationMinutes, maxShownPerDay: null });
  const slot = generateSlots(rules, members, opts.now).find((s) => s.start.getTime() === opts.start.getTime());
  return slot ? { slot, rules } : null;
}

/** Match an existing contact by phone or email, else create a lead. */
export async function upsertBookingContact(
  tx: Prisma.TransactionClient,
  companyId: string,
  c: CustomerInput
) {
  // Client hub: the contact is known. Fill in anything they were asked for
  // because it was missing from their record.
  if (c.contactId) {
    const own = await tx.contact.findFirst({ where: { id: c.contactId, companyId } });
    if (own) {
      const fill = {
        ...(!own.email && c.email ? { email: c.email } : {}),
        ...(!own.phone && c.phone ? { phone: c.phone } : {}),
        ...(!own.address && c.address ? { address: c.address } : {}),
      };
      return Object.keys(fill).length > 0 ? tx.contact.update({ where: { id: own.id }, data: fill }) : own;
    }
  }
  const existing = await tx.contact.findFirst({
    where: {
      companyId,
      OR: [...(c.phone ? [{ phone: c.phone }] : []), ...(c.email ? [{ email: c.email }] : [])],
    },
  });
  if (existing) return existing;
  return tx.contact.create({
    data: {
      companyId,
      hubToken: randomBytes(24).toString("hex"),
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email || null,
      phone: c.phone || null,
      address: c.address || null,
      leadSource: "Online booking",
      assignedToId: await defaultLeadAssignee(companyId),
    },
  });
}

const APPT_TYPE = { PHONE_CALL: "PHONE_CALL", VIDEO_CALL: "VIDEO_CALL", IN_PERSON: "IN_PERSON", SERVICE: "IN_PERSON", MESSAGE: "IN_PERSON" } as const;

/**
 * Book an appointment-kind type (call / video / in-person estimate) in one
 * Serializable transaction. Throws SlotTakenError when nobody can take the
 * slot any more; the route maps that (and Postgres P2034) to a 409.
 */
export async function createAppointmentBooking(params: {
  type: LoadedBookingType;
  company: BookingCompanyRow;
  customer: CustomerInput;
  slot: Slot;
  rules: EngineRules;
  now: Date;
}) {
  const { type, company, customer, slot, rules, now } = params;
  const meta = KIND_META[type.kind];
  const approval = type.confirmation === "APPROVAL";
  const label = slotLabel(company.timezone, slot.start, slot.windowEnd);

  return withDocNumberRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const contact = await upsertBookingContact(tx, company.id, customer);

        const assigned = await assignMemberForSlot(tx, type, company, rules, slot.start, now);
        if (!assigned) throw new SlotTakenError();

        const lastReq = await tx.request.findFirst({ where: { companyId: company.id }, orderBy: { requestNumber: "desc" }, select: { requestNumber: true } });
        const request = await tx.request.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            requestNumber: (lastReq?.requestNumber ?? 0) + 1,
            title: type.name,
            status: approval ? "NEEDS_APPROVAL" : "NEW",
            preferredDate: slot.start,
            source: customer.contactId ? "client_hub" : "booking_form",
            bookingTypeId: type.id,
            details: [
              `Booked online: ${type.name} — ${meta.exactTime ? "" : "requested arrival "}${label}`,
              customer.notes ? `Notes: ${customer.notes}` : null,
              customer.address ? `Address: ${customer.address}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        });

        // Hub bookings are repeat business, not leads — the board stays as it is
        if (!customer.contactId) {
          await enterPipeline(tx, company.id, contact.id);
          await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED");
          if (!approval) await autoAdvance(tx, company.id, contact.id, "APPOINTMENT_SCHEDULED");
        }

        const lastAppt = await tx.appointment.findFirst({ where: { companyId: company.id }, orderBy: { appointmentNumber: "desc" }, select: { appointmentNumber: true } });
        const selfServe = type.clientCanReschedule || type.clientCanCancel;
        const appointment = await tx.appointment.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            requestId: request.id,
            assignedToId: assigned.userId,
            appointmentNumber: (lastAppt?.appointmentNumber ?? 0) + 1,
            title: type.name,
            type: APPT_TYPE[type.kind],
            scheduledAt: slot.start,
            scheduledEnd: slot.end,
            address: meta.needsAddress ? customer.address : null,
            meetingLink: type.kind === "VIDEO_CALL" ? assigned.meetingLink : null,
            tentative: approval,
            bookingTypeId: type.id,
            bookedOnlineAt: now,
            manageToken: selfServe ? randomBytes(24).toString("hex") : null,
            arrivalWindowMinutes: meta.exactTime ? 0 : type.arrivalWindowMinutes,
            notes: [`Booked online${approval ? " — awaiting approval" : ""}.`, customer.notes ? `Customer notes: ${customer.notes}` : null]
              .filter(Boolean)
              .join("\n"),
          },
        });
        return { contact, request, appointment, assignedUserId: assigned.userId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

/** Is `e` the "slot lost" race (our check or a Postgres serialization abort)? */
export function isSlotRace(e: unknown): boolean {
  return e instanceof SlotTakenError || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034");
}

export type BookingNoticeInput = {
  type: LoadedBookingType;
  company: BookingCompanyRow;
  contact: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };
  appointment: {
    id: string;
    scheduledAt: Date;
    scheduledEnd: Date | null;
    address: string | null;
    meetingLink: string | null;
    manageToken: string | null;
    assignedToId: string | null;
    tentative: boolean;
    requestId: string | null;
  };
  windowEnd: Date;
  event: "booked" | "rescheduled" | "cancelled";
  previousStart?: Date | null;
  previousWindowEnd?: Date | null;
  paidNote?: string | null;
};

export function manageUrlFor(company: { slug: string }, token: string | null): string | null {
  return token ? `${APP_URL}/book/${company.slug}/schedule/manage/${token}` : null;
}

/**
 * Everything that happens after a booking commits: push to the people who
 * need to act, the company inbox email, and the customer's email with an
 * .ics attached. Never throws — a failed notification must not fail a
 * booking that already exists.
 */
export async function notifyBooking(input: BookingNoticeInput): Promise<void> {
  const { type, company, contact, appointment, windowEnd, event } = input;
  const meta = KIND_META[type.kind];
  const label = slotLabel(company.timezone, appointment.scheduledAt, windowEnd);
  const previousLabel =
    input.previousStart && input.previousWindowEnd ? slotLabel(company.timezone, input.previousStart, input.previousWindowEnd) : null;
  const approval = appointment.tentative;
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();
  const assignee = appointment.assignedToId
    ? await prisma.user.findUnique({ where: { id: appointment.assignedToId }, select: { id: true, name: true } }).catch(() => null)
    : null;
  const detailUrl = appointment.requestId && approval ? `${APP_URL}/app/requests/${appointment.requestId}` : `${APP_URL}/app/appointments/${appointment.id}`;

  try {
    // Push: approvals go to managers; instant bookings to the assignee + managers
    const managerIds = await companyManagerIds(company.id);
    const targets = new Set(managerIds);
    if (assignee) targets.add(assignee.id);
    const title =
      event === "cancelled" ? "Booking cancelled" : event === "rescheduled" ? "Booking moved" : approval ? "Booking to approve" : "New booking";
    await notifyUsers([...targets], {
      title,
      body: `${contactName} — ${type.name}, ${label}`,
      url: detailUrl.replace(APP_URL, ""),
      tag: `appointment-${appointment.id}`,
    });
  } catch (err) {
    console.error("[booking] push failed:", err);
  }

  try {
    const notifyTo = await companyNotifyAddress(company.id, company.email);
    if (notifyTo) {
      const { subject, html } = bookingTeamNoticeEmail({
        companyName: company.name,
        event: event === "booked" && approval ? "needs_approval" : event,
        serviceName: type.name,
        contactName,
        windowLabel: label,
        previousLabel,
        assigneeName: assignee?.name ?? null,
        detailUrl,
        paidNote: input.paidNote ?? null,
      });
      await sendEmail({ companyId: company.id, to: notifyTo, subject, html, replyTo: contact.email || undefined });
    }
  } catch (err) {
    console.error("[booking] team email failed:", err);
  }

  if (!contact.email) return;
  try {
    const extras: BookingExtras = {
      exactTime: meta.exactTime,
      meetingLink: type.kind === "VIDEO_CALL" ? appointment.meetingLink : null,
      phone: type.kind === "PHONE_CALL" ? contact.phone : null,
      withName: assignee?.name ?? null,
      manageUrl: manageUrlFor(company, appointment.manageToken),
      paidNote: input.paidNote ?? null,
    };
    const base = {
      brand: company,
      companyName: company.name,
      companyEmail: company.email,
      contactFirstName: contact.firstName,
      serviceName: type.name,
      windowLabel: label,
      address: appointment.address,
    };
    const end = appointment.scheduledEnd ?? new Date(appointment.scheduledAt.getTime() + type.durationMinutes * 60000);
    const ics = icsAttachment({
      uid: `${appointment.id}@workbenchfsm.com`,
      start: appointment.scheduledAt,
      end,
      summary: `${type.name} — ${company.name}`,
      description: [
        meta.exactTime ? null : `Arrival window: ${label}`,
        extras.meetingLink ? `Join: ${extras.meetingLink}` : null,
        extras.phone ? `We'll call you at ${extras.phone}` : null,
        extras.manageUrl ? `Reschedule or cancel: ${extras.manageUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      location: appointment.address ?? extras.meetingLink ?? null,
      organizerName: company.name,
      organizerEmail: company.email,
      status: event === "cancelled" ? "CANCELLED" : approval ? "TENTATIVE" : "CONFIRMED",
      sequence: event === "rescheduled" ? 1 : event === "cancelled" ? 2 : 0,
    });
    const mail =
      event === "cancelled"
        ? bookingCancelledEmail({ ...base, rebookUrl: `${APP_URL}/book/${company.slug}/${type.slug}` })
        : event === "rescheduled"
          ? bookingRescheduledEmail({ ...base, previousLabel, extras })
          : approval
            ? bookingReceivedEmail({ ...base, extras })
            : bookingConfirmedEmail({ ...base, extras });
    await sendEmail({
      companyId: company.id,
      to: contact.email,
      subject: mail.subject,
      html: mail.html,
      replyTo: company.email || undefined,
      fromName: company.name,
      attachments: [ics],
    });
  } catch (err) {
    console.error("[booking] client email failed:", err);
  }
}

/** Can the customer still self-serve this booking under the type's cutoff? */
export function withinCutoff(type: { cutoffHours: number }, scheduledAt: Date, now = new Date()): boolean {
  return scheduledAt.getTime() - now.getTime() >= type.cutoffHours * 3600000;
}
