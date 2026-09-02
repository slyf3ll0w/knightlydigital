import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { zipFromAddress } from "@/lib/business-hours";
import { slotLabel } from "@/lib/booking-engine";
import { resolvePublicBookingType, toPublicBookingType } from "@/lib/booking-runtime";
import { KIND_META } from "@/lib/booking-types";
import {
  createAppointmentBooking,
  isSlotRace,
  manageUrlFor,
  notifyBooking,
  verifySlotPick,
  type CustomerInput,
} from "@/lib/booking-submit";
import { serviceSelection } from "@/lib/booking-services";
import { createServiceBooking } from "@/lib/booking-checkout";

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

const SLOT_TAKEN = { error: "That time was just taken — please pick another.", slotTaken: true };

/**
 * Public booking submit for a booking type.
 *   POST /api/public/schedule/[companySlug]/[typeSlug]
 *   { firstName, lastName, email, phone, address?, notes?, slotStart,
 *     services?: string[], paymentToken?, fraudSessionId?,
 *     captchaToken, website (honeypot), elapsedMs }
 * Calls / estimates → Request + Appointment (instant or awaiting approval).
 * SERVICE → approved quote → scheduled job (+ deposit invoice + charge).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type: typeSlug } = await params;
  const body = await req.json().catch(() => ({}));

  if (!(await verifyCaptcha(body.captchaToken, "booking"))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }
  const resolved = await resolvePublicBookingType(slug, typeSlug);
  if (!resolved) return NextResponse.json({ error: "This booking page isn't available." }, { status: 404 });
  const { company, type } = resolved;
  const pub = toPublicBookingType(type, company);
  if (!pub.bookable) return NextResponse.json({ error: "This booking type isn't taking bookings right now." }, { status: 400 });

  // Bot signals: filled honeypot, or the form was completed inhumanly fast.
  // Pretend success so the bot doesn't learn it was caught.
  const filledHoneypot = typeof body.website === "string" && body.website.trim() !== "";
  const tooFast = typeof body.elapsedMs === "number" && body.elapsedMs >= 0 && body.elapsedMs < 3000;
  if (filledHoneypot || tooFast) return NextResponse.json({ success: true }, { status: 201 });

  const meta = KIND_META[type.kind];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const customer: CustomerInput = {
    firstName: str(body.firstName, 100),
    lastName: str(body.lastName, 100),
    email: str(body.email, 200),
    phone: str(body.phone, 40) || null,
    address: meta.needsAddress ? str(body.address, 300) || null : null,
    notes: str(body.notes, 2000) || null,
  };
  if (!customer.firstName || !customer.lastName) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return NextResponse.json({ error: "A valid email is required for your confirmation." }, { status: 400 });
  }
  if (type.kind === "PHONE_CALL" && !customer.phone) {
    return NextResponse.json({ error: "Enter the phone number we should call." }, { status: 400 });
  }
  if (meta.needsAddress) {
    const zip = customer.address ? zipFromAddress(customer.address) : null;
    if (!customer.address || !zip) return NextResponse.json({ error: "Enter your full address, including ZIP code." }, { status: 400 });
    if (company.serviceZips.length > 0 && !company.serviceZips.includes(zip)) {
      return NextResponse.json(
        { error: "That address looks outside our service area — send us a message instead and we'll see what we can do." },
        { status: 400 }
      );
    }
  }
  const start = new Date(String(body.slotStart ?? ""));
  if (isNaN(start.getTime())) return NextResponse.json({ error: "Pick a time." }, { status: 400 });

  // SERVICE: the picked services set duration + price
  const selection = type.kind === "SERVICE" ? serviceSelection(type, body.services) : null;
  if (type.kind === "SERVICE" && !selection) return NextResponse.json({ error: "Pick a service to book." }, { status: 400 });

  const now = new Date();
  const verified = await verifySlotPick(type, company, {
    address: customer.address,
    durationMinutes: selection?.durationMinutes,
    start,
    now,
  });
  if (!verified) return NextResponse.json(SLOT_TAKEN, { status: 409 });

  const since = new Date(now.getTime() - 86400000);
  const recent = await prisma.request.count({ where: { companyId: company.id, source: { not: "webhook" }, createdAt: { gte: since } } });
  if (recent >= MAX_REQUESTS_PER_COMPANY_PER_DAY) {
    return NextResponse.json({ error: "This business can't accept more bookings right now. Please call instead." }, { status: 429 });
  }

  const { slot, rules } = verified;

  // ── SERVICE kinds: quote → job (+ payment) ────────────────────────────────
  if (type.kind === "SERVICE" && selection) {
    const out = await createServiceBooking({
      type,
      company,
      customer,
      slot,
      rules,
      now,
      selection,
      paymentToken: typeof body.paymentToken === "string" ? body.paymentToken.slice(0, 200) : null,
      fraudSessionId: typeof body.fraudSessionId === "string" ? body.fraudSessionId.slice(0, 200) : null,
    }).catch((e) => {
      if (isSlotRace(e)) return { slotTaken: true as const };
      throw e;
    });
    if ("slotTaken" in out) return NextResponse.json(SLOT_TAKEN, { status: 409 });
    if ("declined" in out) return NextResponse.json({ error: out.error, declined: true }, { status: 402 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status ?? 400 });
    return NextResponse.json({ success: true, booking: out.booking }, { status: 201 });
  }

  // ── Calls / estimates: appointment ────────────────────────────────────────
  const result = await createAppointmentBooking({ type, company, customer, slot, rules, now }).catch((e) => {
    if (isSlotRace(e)) return null;
    throw e;
  });
  if (!result) return NextResponse.json(SLOT_TAKEN, { status: 409 });

  await notifyBooking({
    type,
    company,
    contact: result.contact,
    appointment: result.appointment,
    windowEnd: slot.windowEnd,
    event: "booked",
  });

  const assignee = await prisma.user.findUnique({ where: { id: result.assignedUserId }, select: { name: true } });
  return NextResponse.json(
    {
      success: true,
      booking: {
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        windowEnd: slot.windowEnd.toISOString(),
        label: slotLabel(company.timezone, slot.start, slot.windowEnd),
        typeName: type.name,
        exactTime: meta.exactTime,
        tentative: result.appointment.tentative,
        withName: assignee?.name ?? null,
        meetingLink: result.appointment.meetingLink,
        manageUrl: manageUrlFor(company, result.appointment.manageToken),
        address: result.appointment.address,
      },
    },
    { status: 201 }
  );
}
