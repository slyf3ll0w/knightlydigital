import { reportError } from "@/lib/report-error";
import { prisma } from "@/lib/db";
import { sendEmail, emailEnabled, bookingConfirmedEmail, type BookingExtras } from "@/lib/email";
import { sendSms, smsEnabled, canText, bookingConfirmationText, type MeetingKind } from "@/lib/sms";
import { icsAttachment } from "@/lib/ics";
import { arrivalSlotLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";

/**
 * "Your appointment is booked" for an appointment STAFF created — the
 * counterpart of lib/booking-submit.ts notifyBooking, which only online
 * bookings get. Optional per appointment (the form's "Send the client a
 * confirmation" box); without it a client booked over the phone heard
 * nothing until the hour-before reminder. Same copy and the same .ics the
 * online path sends, minus the self-serve manage link (there is no booking
 * type behind a manual appointment — "reply to change the time" instead).
 *
 * Text and email both go when the client has them; either one counts, and
 * Appointment.confirmationSentAt is stamped once so a retry can't double
 * send. Never throws — the appointment already exists.
 */
export async function sendAppointmentConfirmation(
  appointmentId: string,
  companyId: string
): Promise<{ text: boolean; email: boolean }> {
  const out = { text: false, email: false };
  try {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, companyId, confirmationSentAt: null },
      select: {
        id: true,
        title: true,
        type: true,
        scheduledAt: true,
        scheduledEnd: true,
        scheduledAnytime: true,
        address: true,
        meetingLink: true,
        arrivalWindowMinutes: true,
        contact: { select: { id: true, firstName: true, email: true, phone: true, smsOptOut: true, smsDisabled: true } },
        assignedTo: { select: { name: true } },
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            timezone: true,
            arrivalWindowMinutes: true,
            brandColor: true,
            brandColorSecondary: true,
            documentColor: true,
            logoUrl: true,
          },
        },
      },
    });
    if (!appt) return out;
    const { contact, company } = appt;
    if (!contact.email && !contact.phone) return out;

    const kind = appt.type as MeetingKind;
    const inPerson = kind === "IN_PERSON";
    // In-person visits promise the arrival window, calls the exact time —
    // the same labels the reminders use, so the two never disagree.
    const windowMinutes = inPerson ? resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, company.arrivalWindowMinutes) : 0;
    const windowLabel = appt.scheduledAnytime
      ? `${appt.scheduledAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: company.timezone })}, anytime that day`
      : arrivalSlotLabel(company.timezone, appt.scheduledAt, windowMinutes);
    const address = inPerson ? appt.address : null;
    const phone = kind === "PHONE_CALL" ? contact.phone : null;
    const meetingLink = kind === "VIDEO_CALL" ? appt.meetingLink : null;

    if (contact.phone && smsEnabled() && canText(contact)) {
      try {
        out.text = await sendSms({
          companyId: company.id,
          contactId: contact.id,
          to: contact.phone,
          text: bookingConfirmationText({
            companyName: company.name,
            firstName: contact.firstName,
            serviceName: appt.title,
            kind,
            windowLabel,
            address,
            phone,
            meetingLink,
            event: "confirmed",
          }),
        });
      } catch (err) {
        reportError("[appointment-confirm] text failed", appt.id, err);
      }
    }

    if (contact.email && emailEnabled()) {
      try {
        const extras: BookingExtras = {
          exactTime: !inPerson || windowMinutes === 0,
          meetingLink,
          phone,
          withName: appt.assignedTo?.name ?? null,
          manageUrl: null,
        };
        const { subject, html } = bookingConfirmedEmail({
          brand: company,
          companyName: company.name,
          companyEmail: company.email,
          contactFirstName: contact.firstName,
          serviceName: appt.title,
          windowLabel,
          address,
          extras,
        });
        const end = appt.scheduledEnd ?? new Date(appt.scheduledAt.getTime() + (inPerson ? 60 : 30) * 60000);
        const ics = icsAttachment({
          uid: `${appt.id}@workbenchfsm.com`,
          start: appt.scheduledAt,
          end,
          summary: `${appt.title} — ${company.name}`,
          description: [
            inPerson && windowMinutes > 0 ? `Arrival window: ${windowLabel}` : null,
            meetingLink ? `Join: ${meetingLink}` : null,
            phone ? `We'll call you at ${phone}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          location: address ?? meetingLink ?? null,
          organizerName: company.name,
          organizerEmail: company.email,
          status: "CONFIRMED",
          sequence: 0,
        });
        out.email = await sendEmail({
          companyId: company.id,
          to: contact.email,
          subject,
          html,
          replyTo: company.email || undefined,
          fromName: company.name,
          attachments: [ics],
        });
      } catch (err) {
        reportError("[appointment-confirm] email failed", appt.id, err);
      }
    }

    if (out.text || out.email) {
      await prisma.appointment.updateMany({
        where: { id: appt.id, confirmationSentAt: null },
        data: { confirmationSentAt: new Date() },
      });
    } else {
      console.warn(`[appointment-confirm] nothing went out for appointment ${appt.id} (company ${company.id})`);
    }
  } catch (err) {
    reportError("[appointment-confirm] failed", appointmentId, err);
  }
  return out;
}
