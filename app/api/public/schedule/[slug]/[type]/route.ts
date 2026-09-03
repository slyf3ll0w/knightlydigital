import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { zipFromAddress } from "@/lib/business-hours";
import { slotLabel } from "@/lib/booking-engine";
import { resolvePublicBookingType, toPublicBookingType } from "@/lib/booking-runtime";
import { KIND_META } from "@/lib/booking-types";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { validateAnswers } from "@/lib/booking-answers";
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
import { hubSubmitter } from "@/lib/hub-form";

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

const SLOT_TAKEN = { error: "That time was just taken — please pick another.", slotTaken: true };

/**
 * Public booking submit for a scheduled item.
 *   POST /api/public/schedule/[companySlug]/[itemSlug]
 *   { firstName, lastName, email, phone, address?, notes?, service?,
 *     custom?: {fieldId: answer}, slotStart, services?: string[],
 *     paymentToken?, fraudSessionId?, captchaToken, website (honeypot), elapsedMs }
 * Calls / visits → Request + Appointment (instant or awaiting approval).
 * SERVICE → approved quote → scheduled job (+ deposit invoice + charge).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type: typeSlug } = await params;
  const body = await req.json().catch(() => ({}));

  const resolved = await resolvePublicBookingType(slug, typeSlug);
  if (!resolved) return NextResponse.json({ error: "This booking page isn't available." }, { status: 404 });
  const { company, type } = resolved;
  // Client hub: a token of this company's contact is the auth — no captcha
  const hubContact = await hubSubmitter(body.hubToken, company.id);
  if (!hubContact && !(await verifyCaptcha(body.captchaToken, "booking"))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }
  const pub = toPublicBookingType(type, company);
  if (pub.mode !== "SCHEDULE") return NextResponse.json({ error: "This form doesn't take bookings — send a request instead." }, { status: 400 });
  if (!pub.bookable) return NextResponse.json({ error: "This booking type isn't taking bookings right now." }, { status: 400 });
  const intake = pub.intake;

  // Bot signals: filled honeypot, or the form was completed inhumanly fast.
  // Pretend success so the bot doesn't learn it was caught.
  const filledHoneypot = typeof body.website === "string" && body.website.trim() !== "";
  const tooFast = typeof body.elapsedMs === "number" && body.elapsedMs >= 0 && body.elapsedMs < 3000;
  if (!hubContact && (filledHoneypot || tooFast)) return NextResponse.json({ success: true }, { status: 201 });

  const meta = KIND_META[type.kind];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const message = intake.message.show ? str(body.notes, 2000) : "";
  if (intake.message.required && !message) return NextResponse.json({ error: `"${intake.message.label}" is required.` }, { status: 400 });
  const answers = validateAnswers(intake, body);
  if ("error" in answers) return NextResponse.json({ error: answers.error }, { status: 400 });
  const { serviceAnswer, customLines, mappedContactFields } = answers;
  // Calls may still ask for an address as a plain question
  const plainAddress = !meta.needsAddress && intake.fields.address.show ? str(body.address, 300) : "";
  if (!meta.needsAddress && intake.fields.address.required && !plainAddress) {
    return NextResponse.json({ error: `"${intake.fields.address.label}" is required.` }, { status: 400 });
  }

  // From the hub, whatever the form didn't ask for comes from the contact's record
  const customer: CustomerInput = {
    firstName: str(body.firstName, 100) || hubContact?.firstName || "",
    lastName: str(body.lastName, 100) || hubContact?.lastName || "",
    email: str(body.email, 200) || hubContact?.email || "",
    phone: (intake.fields.phone.show ? str(body.phone, 40) : "") || hubContact?.phone || null,
    address: meta.needsAddress ? str(body.address, 300) || null : plainAddress || null,
    contactId: hubContact?.id ?? null,
    notes:
      [message, serviceAnswer ? `${intake.serviceQuestion.label}: ${serviceAnswer}` : null, ...customLines].filter(Boolean).join("\n") || null,
  };
  if (!customer.firstName || !customer.lastName) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return NextResponse.json({ error: "A valid email is required for your confirmation." }, { status: 400 });
  }
  if (intake.fields.phone.required && !customer.phone) {
    return NextResponse.json({ error: type.kind === "PHONE_CALL" ? "Enter the phone number we should call." : `"${intake.fields.phone.label}" is required.` }, { status: 400 });
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
    address: meta.needsAddress ? customer.address : null,
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
  const fieldDefs = Object.keys(mappedContactFields).length > 0 ? await getActiveFieldDefs(company.id) : [];
  const sanitizedMapped = sanitizeCustomFields(mappedContactFields, fieldDefs);
  const saveMapped = async (contactId: string | null | undefined) => {
    if (!contactId || Object.keys(sanitizedMapped).length === 0) return;
    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { customFields: true } });
    await prisma.contact
      .update({ where: { id: contactId }, data: { customFields: { ...((contact?.customFields as Record<string, string>) ?? {}), ...sanitizedMapped } } })
      .catch(() => {});
  };

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
    await saveMapped(hubContact?.id ?? (await prisma.contact.findFirst({ where: { companyId: company.id, email: customer.email }, select: { id: true } }))?.id);
    return NextResponse.json({ success: true, booking: out.booking }, { status: 201 });
  }

  // ── Calls / visits: appointment ───────────────────────────────────────────
  const result = await createAppointmentBooking({ type, company, customer, slot, rules, now }).catch((e) => {
    if (isSlotRace(e)) return null;
    throw e;
  });
  if (!result) return NextResponse.json(SLOT_TAKEN, { status: 409 });
  await saveMapped(result.contact.id);

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
