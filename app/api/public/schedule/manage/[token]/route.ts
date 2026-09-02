import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import { groupSlotsByDay, slotLabel, checkSlot } from "@/lib/booking-engine";
import { assignMemberForSlot, bookingTypeInclude, loadPoolWithBusy, slotsForType, toPublicBookingType } from "@/lib/booking-runtime";
import { KIND_META } from "@/lib/booking-types";
import { isSlotRace, notifyBooking, SlotTakenError, verifySlotPick, withinCutoff } from "@/lib/booking-submit";
import { resolveArrivalWindowMinutes } from "@/lib/arrival-window";

/**
 * Customer self-serve for an online booking, keyed by the unguessable
 * manageToken from the confirmation email.
 *   GET  → the booking + what the customer may do + open times to move to
 *   POST { action: "cancel" } | { action: "reschedule", slotStart }
 * Policy (allowed actions, cutoff) is the booking type's; the assignee keeps
 * the booking when they're free at the new time, else the pool re-assigns.
 */

async function loadByToken(token: string) {
  const appt = await prisma.appointment.findUnique({
    where: { manageToken: token },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      bookingType: { include: bookingTypeInclude },
      company: {
        select: {
          id: true, name: true, slug: true, email: true, timezone: true, businessHours: true, serviceZips: true,
          arrivalWindowMinutes: true, bookingDriveLimitMinutes: true, lat: true, lng: true, suspendedAt: true,
          brandColor: true, brandColorSecondary: true, documentColor: true, logoUrl: true,
        },
      },
      assignedTo: { select: { name: true } },
    },
  });
  if (!appt || !appt.bookingType || appt.company.suspendedAt) return null;
  return appt;
}

function windowEndFor(appt: { scheduledAt: Date; arrivalWindowMinutes: number | null; type: string }, company: { arrivalWindowMinutes: number }) {
  const minutes = appt.type === "IN_PERSON" ? resolveArrivalWindowMinutes(appt.arrivalWindowMinutes, company.arrivalWindowMinutes) : 0;
  return new Date(appt.scheduledAt.getTime() + minutes * 60000);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appt = await loadByToken(token);
  if (!appt) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const type = appt.bookingType!;
  const company = appt.company;
  const now = new Date();
  const windowEnd = windowEndFor(appt, company);
  const meta = KIND_META[type.kind];
  const active = appt.status === "SCHEDULED";
  const inCutoff = withinCutoff(type, appt.scheduledAt, now);
  const wantSlots = req.nextUrl.searchParams.get("slots") === "1" && active && type.clientCanReschedule && inCutoff;

  let days: ReturnType<typeof groupSlotsByDay> = [];
  if (wantSlots) {
    // Same sweep as the public page, minus this appointment's own hold
    const { slots } = await slotsForType(
      type,
      company,
      { address: meta.needsAddress ? appt.address : null, now }
    );
    days = groupSlotsByDay(company.timezone, slots.filter((s) => s.start.getTime() !== appt.scheduledAt.getTime()));
  }

  return NextResponse.json({
    status: appt.status,
    typeName: type.name,
    kind: type.kind,
    exactTime: meta.exactTime,
    timezone: company.timezone,
    companyName: company.name,
    companySlug: company.slug,
    typeSlug: type.slug,
    start: appt.scheduledAt.toISOString(),
    windowEnd: windowEnd.toISOString(),
    label: slotLabel(company.timezone, appt.scheduledAt, windowEnd),
    address: appt.address,
    meetingLink: appt.meetingLink,
    withName: appt.assignedTo?.name ?? null,
    tentative: appt.tentative,
    canReschedule: active && type.clientCanReschedule && inCutoff,
    canCancel: active && type.clientCanCancel && inCutoff,
    cutoffHours: type.cutoffHours,
    pastCutoff: active && !inCutoff,
    days,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req.headers);
  if (!limit(`booking-manage:${ip}`, 20, 3600000).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const appt = await loadByToken(token);
  if (!appt) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (appt.status !== "SCHEDULED") return NextResponse.json({ error: "This booking is no longer active." }, { status: 400 });
  const type = appt.bookingType!;
  const company = appt.company;
  const now = new Date();
  const body = await req.json().catch(() => ({}));
  const meta = KIND_META[type.kind];
  const pub = toPublicBookingType(type, company);

  if (!withinCutoff(type, appt.scheduledAt, now)) {
    return NextResponse.json(
      { error: `Changes need at least ${type.cutoffHours} hours' notice — please contact ${company.name} directly.` },
      { status: 400 }
    );
  }

  const prevStart = appt.scheduledAt;
  const prevWindowEnd = windowEndFor(appt, company);

  if (body.action === "cancel") {
    if (!type.clientCanCancel) return NextResponse.json({ error: "Cancelling online isn't available for this booking." }, { status: 400 });
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } }),
      ...(appt.requestId && appt.tentative
        ? [prisma.request.update({ where: { id: appt.requestId }, data: { status: "ARCHIVED" } })]
        : []),
    ]);
    await notifyBooking({
      type,
      company,
      contact: appt.contact,
      appointment: { ...appt, tentative: false },
      windowEnd: prevWindowEnd,
      event: "cancelled",
    });
    return NextResponse.json({ success: true, status: "CANCELLED" });
  }

  if (body.action === "reschedule") {
    if (!type.clientCanReschedule) return NextResponse.json({ error: "Rescheduling online isn't available for this booking." }, { status: 400 });
    if (!pub.bookable) return NextResponse.json({ error: "No open times right now — please contact us." }, { status: 400 });
    const start = new Date(String(body.slotStart ?? ""));
    if (isNaN(start.getTime())) return NextResponse.json({ error: "Pick a time." }, { status: 400 });
    const durationMinutes = appt.scheduledEnd ? Math.round((appt.scheduledEnd.getTime() - appt.scheduledAt.getTime()) / 60000) : type.durationMinutes;
    const verified = await verifySlotPick(type, company, {
      address: meta.needsAddress ? appt.address : null,
      durationMinutes,
      start,
      now,
      excludeAppointmentId: appt.id,
    });
    if (!verified) return NextResponse.json({ error: "That time was just taken — please pick another.", slotTaken: true }, { status: 409 });
    const { slot, rules } = verified;

    const updated = await prisma
      .$transaction(
        async (tx) => {
          // Keep the same person when they're free at the new time
          const dayLo = new Date(slot.start.getTime() - 86400000);
          const dayHi = new Date(slot.start.getTime() + 86400000);
          const pool = await loadPoolWithBusy(type, dayLo, dayHi, { locate: Boolean(rules.target), excludeAppointmentId: appt.id }, tx);
          const current = pool.find((m) => m.id === appt.assignedToId);
          let assignedToId = appt.assignedToId;
          let meetingLink = appt.meetingLink;
          if (!(current && checkSlot(rules, current, slot.start, now).ok)) {
            const assigned = await assignMemberForSlot(tx, type, company, rules, slot.start, now, { excludeAppointmentId: appt.id });
            if (!assigned) throw new SlotTakenError();
            assignedToId = assigned.userId;
            if (type.kind === "VIDEO_CALL") meetingLink = assigned.meetingLink;
          }
          return tx.appointment.update({
            where: { id: appt.id },
            data: {
              scheduledAt: slot.start,
              scheduledEnd: slot.end,
              assignedToId,
              meetingLink,
              // A moved booking gets fresh reminders
              reminderDaySentAt: null,
              reminderHourSentAt: null,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
      .catch((e) => {
        if (isSlotRace(e)) return null;
        throw e;
      });
    if (!updated) return NextResponse.json({ error: "That time was just taken — please pick another.", slotTaken: true }, { status: 409 });

    await notifyBooking({
      type,
      company,
      contact: appt.contact,
      appointment: { ...updated, manageToken: appt.manageToken },
      windowEnd: slot.windowEnd,
      event: "rescheduled",
      previousStart: prevStart,
      previousWindowEnd: prevWindowEnd,
    });
    return NextResponse.json({
      success: true,
      start: slot.start.toISOString(),
      windowEnd: slot.windowEnd.toISOString(),
      label: slotLabel(company.timezone, slot.start, slot.windowEnd),
    });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
