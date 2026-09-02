import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { sendEmail, bookingConfirmedEmail, bookingDeclinedEmail } from "@/lib/email";
import { slotLabel } from "@/lib/booking-engine";
import { resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { manageUrlFor } from "@/lib/booking-submit";
import { icsAttachment } from "@/lib/ics";
import { autoAdvance } from "@/lib/pipeline";

/**
 * Approve or decline a self-scheduled online booking.
 *
 * POST { action: "accept" }  — confirms the tentative appointment (it turns
 * solid on the schedule) and puts the request back in the normal NEW flow.
 * POST { action: "decline", message? } — archives the request and cancels
 * the tentative appointment, freeing the slot.
 *
 * Client emails ride lib/email.ts (confirmation / declined) — see the
 * booking email templates.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : null;
  if (!action) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const request = await prisma.request.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
    include: {
      contact: { select: { id: true, firstName: true, email: true, phone: true } },
      appointments: {
        where: { tentative: true, status: "SCHEDULED" },
        orderBy: { scheduledAt: "asc" },
        include: { assignedTo: { select: { name: true } } },
      },
      company: {
        select: {
          name: true,
          email: true,
          timezone: true,
          arrivalWindowMinutes: true,
          slug: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
        },
      },
    },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "NEEDS_APPROVAL") {
    return NextResponse.json(
      { error: "This request isn't awaiting booking approval." },
      { status: 400 }
    );
  }

  const tentative = request.appointments[0] ?? null;

  if (action === "accept") {
    await prisma.$transaction([
      prisma.request.update({ where: { id: request.id }, data: { status: "NEW" } }),
      ...(tentative
        ? [
            prisma.appointment.update({
              where: { id: tentative.id },
              data: { tentative: false },
            }),
          ]
        : []),
    ]);
    // Pipeline board: a confirmed estimate advances the lead's card
    if (tentative) {
      await autoAdvance(prisma, actor.companyId, request.contact.id, "APPOINTMENT_SCHEDULED");
    }
  } else {
    await prisma.$transaction([
      prisma.request.update({ where: { id: request.id }, data: { status: "ARCHIVED" } }),
      ...(tentative
        ? [
            prisma.appointment.update({
              where: { id: tentative.id },
              data: { status: "CANCELLED" },
            }),
          ]
        : []),
    ]);
  }

  // Tell the client what was decided (no-op until Resend is configured)
  if (request.contact.email) {
    // Calls promise the exact time; visits promise the arrival window
    const exactTime = tentative ? tentative.type !== "IN_PERSON" : false;
    const windowMinutes = tentative
      ? exactTime
        ? 0
        : resolveArrivalWindowMinutes(tentative.arrivalWindowMinutes, request.company.arrivalWindowMinutes)
      : 0;
    const windowEnd = tentative ? new Date(tentative.scheduledAt.getTime() + windowMinutes * 60000) : null;
    const windowLabel = tentative && windowEnd ? slotLabel(request.company.timezone, tentative.scheduledAt, windowEnd) : null;
    const { subject, html } =
      action === "accept" && windowLabel
        ? bookingConfirmedEmail({
            brand: request.company,
            companyName: request.company.name,
            companyEmail: request.company.email,
            contactFirstName: request.contact.firstName,
            serviceName: request.title,
            windowLabel,
            address: tentative?.address,
            extras: {
              exactTime,
              meetingLink: tentative?.type === "VIDEO_CALL" ? tentative.meetingLink : null,
              phone: tentative?.type === "PHONE_CALL" ? request.contact.phone : null,
              withName: tentative?.assignedTo?.name ?? null,
              manageUrl: manageUrlFor(request.company, tentative?.manageToken ?? null),
            },
          })
        : bookingDeclinedEmail({
            brand: request.company,
            companyName: request.company.name,
            companyEmail: request.company.email,
            contactFirstName: request.contact.firstName,
            serviceName: request.title,
            windowLabel,
          });
    // Accepting without a tentative appointment (edge: it was deleted) sends
    // nothing rather than a wrong "confirmed" email
    if (action === "decline" || windowLabel) {
      await sendEmail({
        companyId: request.companyId,
        to: request.contact.email,
        subject,
        html,
        replyTo: request.company.email || undefined,
        fromName: request.company.name,
        attachments:
          action === "accept" && tentative
            ? [
                icsAttachment({
                  uid: `${tentative.id}@workbenchfsm.com`,
                  start: tentative.scheduledAt,
                  end: tentative.scheduledEnd ?? new Date(tentative.scheduledAt.getTime() + 30 * 60000),
                  summary: `${request.title} — ${request.company.name}`,
                  location: tentative.address ?? tentative.meetingLink ?? null,
                  organizerName: request.company.name,
                  organizerEmail: request.company.email,
                }),
              ]
            : undefined,
      });
    }
  }

  return NextResponse.json({ success: true, action });
}
