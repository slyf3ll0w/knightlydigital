import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newRequestEmail, quoteLinkEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { defaultLeadAssignee } from "@/lib/permissions";
import { resolveWebForm } from "@/lib/web-forms";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { derivedQuoteDeposit } from "@/lib/statuses";
import { zipFromAddress } from "@/lib/business-hours";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { bookingTypeInclude, toPublicBookingType } from "@/lib/booking-runtime";
import { KIND_META } from "@/lib/booking-types";
import { slotLabel } from "@/lib/booking-engine";
import { createAppointmentBooking, isSlotRace, manageUrlFor, notifyBooking, verifySlotPick, type CustomerInput } from "@/lib/booking-submit";
import { serviceSelection } from "@/lib/booking-services";
import { createServiceBooking } from "@/lib/booking-checkout";

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

const SLOT_TAKEN = { error: "That time was just taken — please pick another.", slotTaken: true };

/**
 * Public web-form submission (inquiry / booking / service request).
 * Creates (or matches) a contact, files a Request, maps answers into client
 * custom fields, and — for service-request forms — auto-creates a quote (draft,
 * or sent to the client for online approval). Deposits derive from the picked
 * preset services and are collected via a deposit invoice once the quote is
 * approved (see lib/deposits.ts).
 *
 * BOOKING forms with online scheduling on hand a picked booking type + slot
 * to the booking engine (lib/booking-submit.ts / booking-checkout.ts) — the
 * same path the hosted /book/[slug]/schedule pages use — and fold the form's
 * custom answers into the booking's notes and the contact's custom fields.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();

  if (!(await verifyCaptcha(body.captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  const resolved = await resolveWebForm(
    slug,
    typeof body.formSlug === "string" ? body.formSlug.slice(0, 60) : undefined
  );
  if (!resolved) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  const { company, form } = resolved;
  const config = form.config;

  // Bot signals: filled honeypot, or the form was completed inhumanly fast.
  // Pretend success so the bot doesn't learn it was caught.
  const filledHoneypot = typeof body.website === "string" && body.website.trim() !== "";
  const tooFast =
    typeof body.elapsedMs === "number" && body.elapsedMs >= 0 && body.elapsedMs < 3000;
  if (filledHoneypot || tooFast) {
    return NextResponse.json({ success: true }, { status: 201 });
  }

  const { firstName, lastName, email, phone, address, service, preferredDate, message } = body;

  // Validation follows the form's own config
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (config.fields.email.show && config.fields.email.required && !email) {
    return NextResponse.json({ error: `"${config.fields.email.label}" is required.` }, { status: 400 });
  }
  if (config.fields.phone.show && config.fields.phone.required && !phone) {
    return NextResponse.json({ error: `"${config.fields.phone.label}" is required.` }, { status: 400 });
  }
  if (config.fields.address.show && config.fields.address.required && !address) {
    return NextResponse.json({ error: `"${config.fields.address.label}" is required.` }, { status: 400 });
  }
  if (config.fields.date.show && config.fields.date.required && !preferredDate) {
    return NextResponse.json({ error: `"${config.fields.date.label}" is required.` }, { status: 400 });
  }
  // Self-scheduling forms replace the free-text service question with the
  // booking-type picker, so its "required" rule doesn't apply to them
  const selfScheduling =
    form.type === "BOOKING" && config.selfSchedule.enabled && config.selfSchedule.bookingTypeIds.length > 0;
  const serviceAsked = form.type !== "SERVICE_REQUEST" && config.service.show && !selfScheduling;
  if (serviceAsked && config.service.required && !service) {
    return NextResponse.json({ error: `"${config.service.label}" is required.` }, { status: 400 });
  }
  if (config.message.show && config.message.required && !message) {
    return NextResponse.json({ error: `"${config.message.label}" is required.` }, { status: 400 });
  }
  const tooLong = [firstName, lastName, email, phone, address, service].some(
    (v) => v && String(v).length > 200
  );
  if (tooLong || (message && String(message).length > 5000)) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  // Selected services (service-request forms): ids must exist on the form
  let pickedServices: { id: string; name: string; price: number; workItemId?: string }[] = [];
  if (form.type === "SERVICE_REQUEST") {
    const ids: string[] = Array.isArray(body.selectedServices)
      ? body.selectedServices.filter((s: unknown): s is string => typeof s === "string").slice(0, 30)
      : [];
    pickedServices = config.services.filter((s) => ids.includes(s.id));
    if (pickedServices.length === 0) {
      return NextResponse.json({ error: "Pick a service." }, { status: 400 });
    }
    if (!config.serviceRequest.allowMultiple && pickedServices.length > 1) {
      pickedServices = pickedServices.slice(0, 1);
    }
  }

  // Custom fields: validate against the form config; mapped answers land on
  // the contact's custom fields, everything rides along in request details
  const rawCustom = (body.custom ?? {}) as Record<string, unknown>;
  const customLines: string[] = [];
  const mappedContactFields: Record<string, string> = {};
  for (const field of config.customFields) {
    const value = typeof rawCustom[field.id] === "string" ? (rawCustom[field.id] as string).trim() : "";
    if (!value) {
      if (field.required) {
        return NextResponse.json({ error: `"${field.label}" is required.` }, { status: 400 });
      }
      continue;
    }
    if (value.length > 1000) {
      return NextResponse.json({ error: "Input too long." }, { status: 400 });
    }
    if (
      (field.type === "select" || field.type === "radio") &&
      !(field.options ?? []).some((o) => o.label === value)
    ) {
      return NextResponse.json({ error: `Invalid value for "${field.label}".` }, { status: 400 });
    }
    customLines.push(`${field.label} - ${value}`);
    if (field.contactFieldId) mappedContactFields[field.contactFieldId] = value;
  }

  const since = new Date(Date.now() - 86400000);
  const recent = await prisma.request.count({
    where: { companyId: company.id, source: { not: "webhook" }, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_COMPANY_PER_DAY) {
    return NextResponse.json(
      { error: "This business can't accept more requests right now. Please call instead." },
      { status: 429 }
    );
  }

  const fieldDefs =
    Object.keys(mappedContactFields).length > 0 ? await getActiveFieldDefs(company.id) : [];
  const sanitizedMapped = sanitizeCustomFields(mappedContactFields, fieldDefs);

  // ── Online scheduling: a booking type + slot → the booking engine ─────────
  if (selfScheduling && typeof body.bookingTypeId === "string" && body.slotStart !== undefined) {
    if (!config.selfSchedule.bookingTypeIds.includes(body.bookingTypeId)) {
      return NextResponse.json({ error: "Pick what you'd like to book." }, { status: 400 });
    }
    const type = await prisma.bookingType.findFirst({
      where: { id: body.bookingTypeId, companyId: company.id, isActive: true, paymentMode: "NONE" },
      include: bookingTypeInclude,
    });
    if (!type || !toPublicBookingType(type, company).bookable) {
      return NextResponse.json({ error: "That option isn't taking bookings right now." }, { status: 400 });
    }
    const meta = KIND_META[type.kind];
    const customer: CustomerInput = {
      firstName: String(firstName).trim().slice(0, 100),
      lastName: String(lastName).trim().slice(0, 100),
      email: typeof email === "string" ? email.trim().slice(0, 200) : "",
      phone: typeof phone === "string" && phone.trim() ? phone.trim().slice(0, 40) : null,
      address: meta.needsAddress && typeof address === "string" && address.trim() ? address.trim().slice(0, 300) : null,
      notes: [typeof message === "string" && message.trim() ? message.trim().slice(0, 2000) : null, ...customLines].filter(Boolean).join("\n") || null,
    };
    if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      return NextResponse.json({ error: "A valid email is required for your confirmation." }, { status: 400 });
    }
    if (type.kind === "PHONE_CALL" && !customer.phone) {
      return NextResponse.json({ error: "Enter the phone number we should call." }, { status: 400 });
    }
    if (meta.needsAddress) {
      const zip = customer.address ? zipFromAddress(customer.address) : null;
      if (!customer.address || !zip) {
        return NextResponse.json({ error: "Enter your full address, including ZIP code." }, { status: 400 });
      }
      if (company.serviceZips.length > 0 && !company.serviceZips.includes(zip)) {
        return NextResponse.json(
          { error: "That address looks outside our service area — send us a message instead and we'll see what we can do." },
          { status: 400 }
        );
      }
    }
    const start = new Date(String(body.slotStart));
    if (isNaN(start.getTime())) return NextResponse.json({ error: "Pick a time." }, { status: 400 });
    const selection = type.kind === "SERVICE" ? serviceSelection(type, body.services) : null;
    if (type.kind === "SERVICE" && !selection) return NextResponse.json({ error: "Pick a service to book." }, { status: 400 });

    const now = new Date();
    const verified = await verifySlotPick(type, company, { address: customer.address, durationMinutes: selection?.durationMinutes, start, now });
    if (!verified) return NextResponse.json(SLOT_TAKEN, { status: 409 });
    const { slot, rules } = verified;

    let contactId: string;
    let booking: Record<string, unknown>;
    if (type.kind === "SERVICE" && selection) {
      const out = await createServiceBooking({ type, company, customer, slot, rules, now, selection, paymentToken: null, fraudSessionId: null }).catch((e) => {
        if (isSlotRace(e)) return { slotTaken: true as const };
        throw e;
      });
      if ("slotTaken" in out) return NextResponse.json(SLOT_TAKEN, { status: 409 });
      if ("declined" in out || "error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
      booking = out.booking;
      contactId = (await prisma.contact.findFirst({ where: { companyId: company.id, email: customer.email }, select: { id: true } }))?.id ?? "";
    } else {
      const result = await createAppointmentBooking({ type, company, customer, slot, rules, now }).catch((e) => {
        if (isSlotRace(e)) return null;
        throw e;
      });
      if (!result) return NextResponse.json(SLOT_TAKEN, { status: 409 });
      await notifyBooking({ type, company, contact: result.contact, appointment: result.appointment, windowEnd: slot.windowEnd, event: "booked" });
      contactId = result.contact.id;
      const assignee = await prisma.user.findUnique({ where: { id: result.assignedUserId }, select: { name: true } });
      booking = {
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
      };
    }
    // Mapped custom answers land on the contact's custom fields
    if (contactId && Object.keys(sanitizedMapped).length > 0) {
      const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { customFields: true } });
      await prisma.contact
        .update({
          where: { id: contactId },
          data: { customFields: { ...((contact?.customFields as Record<string, string>) ?? {}), ...sanitizedMapped } },
        })
        .catch(() => {});
    }
    return NextResponse.json({ success: true, booking: { service: (booking.typeName as string) ?? "", ...booking } }, { status: 201 });
  }

  // ── Classic flow: request (+ quote for service-request forms) ─────────────

  // Website leads go to the company's preset assignee, else the owner
  const assignedToId = await defaultLeadAssignee(company.id);

  const requestTitle =
    form.type === "SERVICE_REQUEST"
      ? pickedServices.map((s) => s.name).join(", ")
      : (serviceAsked && service) || form.name;

  const preferred =
    config.fields.date.show && typeof preferredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
      ? new Date(`${preferredDate}T12:00:00`)
      : null;

  const result = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      // Match an existing contact by phone or email; otherwise create a lead
      let contact = await tx.contact.findFirst({
        where: {
          companyId: company.id,
          OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
        },
      });
      if (!contact) {
        contact = await tx.contact.create({
          data: {
            companyId: company.id,
            hubToken: randomBytes(24).toString("hex"),
            firstName,
            lastName,
            email: email || null,
            phone: phone || null,
            address: address || null,
            leadSource: "Online booking",
            assignedToId,
            customFields: sanitizedMapped,
          },
        });
      } else if (Object.keys(sanitizedMapped).length > 0) {
        await tx.contact.update({
          where: { id: contact.id },
          data: {
            customFields: {
              ...((contact.customFields as Record<string, string>) ?? {}),
              ...sanitizedMapped,
            },
          },
        });
      }

      // Service-request forms auto-create a quote (draft, or sent for approval).
      // Recurring services start a subscription only on quote→job conversion.
      let quote:
        | { id: string; quoteNumber: number; publicToken: string; total: number; deposit: number }
        | null = null;
      if (form.type === "SERVICE_REQUEST") {
        // Pull price-book config (recurring, deposit, agreement) for picked services
        const pickedWorkItemIds = pickedServices
          .map((s) => s.workItemId)
          .filter((id): id is string => !!id);
        const wi =
          pickedWorkItemIds.length > 0
            ? await tx.workItem.findMany({
                where: { id: { in: pickedWorkItemIds }, companyId: company.id },
                select: {
                  id: true,
                  recurringInterval: true,
                  depositType: true,
                  depositValue: true,
                  requiresAgreement: true,
                },
              })
            : [];
        const wiById = new Map(wi.map((w) => [w.id, w] as const));

        const subtotal = Math.round(pickedServices.reduce((s, p) => s + p.price, 0) * 100) / 100;
        // Deposit = sum of each preset service's rule, falling back to the company
        // default; custom (non-price-book) picks contribute nothing automatically.
        const deposit = derivedQuoteDeposit(
          pickedServices.map((s) => ({
            total: s.price,
            deposit: s.workItemId
              ? {
                  depositType: wiById.get(s.workItemId)?.depositType ?? "NONE",
                  depositValue: wiById.get(s.workItemId)?.depositValue ?? null,
                }
              : null,
          })),
          subtotal,
          { depositType: company.defaultDepositType, depositValue: company.defaultDepositValue }
        );

        const lastQuote = await tx.quote.findFirst({
          where: { companyId: company.id },
          orderBy: { quoteNumber: "desc" },
        });
        const send = config.serviceRequest.quoteMode === "send";
        const created = await tx.quote.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            publicToken: randomBytes(24).toString("hex"),
            quoteNumber: (lastQuote?.quoteNumber ?? 0) + 1,
            title: requestTitle,
            status: send ? "AWAITING_RESPONSE" : "DRAFT",
            subtotal,
            total: subtotal,
            depositType: deposit > 0 ? "FIXED" : "NONE",
            depositValue: deposit > 0 ? deposit : null,
            clientMessage:
              typeof message === "string" && message.trim() ? message.trim().slice(0, 5000) : null,
            sentAt: send ? new Date() : null,
            lineItems: {
              create: pickedServices.map((s, i) => ({
                name: s.name,
                description: "",
                quantity: 1,
                unitPrice: s.price,
                total: s.price,
                workItemId: s.workItemId ?? null,
                recurringInterval: (s.workItemId && wiById.get(s.workItemId)?.recurringInterval) || null,
                requiresAgreement: (s.workItemId && wiById.get(s.workItemId)?.requiresAgreement) || false,
                sortOrder: i,
              })),
            },
          },
        });
        quote = {
          id: created.id,
          quoteNumber: created.quoteNumber,
          publicToken: created.publicToken,
          total: subtotal,
          deposit,
        };
      }

      const last = await tx.request.findFirst({
        where: { companyId: company.id },
        orderBy: { requestNumber: "desc" },
      });

      const request = await tx.request.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          requestNumber: (last?.requestNumber ?? 0) + 1,
          title: requestTitle,
          preferredDate: preferred,
          details: [
            message,
            ...customLines,
            form.type === "SERVICE_REQUEST"
              ? `Services: ${pickedServices.map((s) => `${s.name} ($${s.price.toFixed(2)})`).join(", ")}`
              : null,
            quote
              ? `Quote #${quote.quoteNumber} created automatically (${config.serviceRequest.quoteMode === "send" ? "sent for approval" : "draft"})${quote.deposit > 0 ? ` — deposit $${quote.deposit.toFixed(2)}` : ""}.`
              : null,
            preferred ? `Preferred date: ${preferredDate}` : null,
            address ? `Address: ${address}` : null,
            `Form: ${form.name}`,
          ]
            .filter(Boolean)
            .join("\n"),
          source: "booking_form",
        },
      });

      // Link the auto-created quote back to its request
      if (quote) {
        await tx.quote.update({ where: { id: quote.id }, data: { requestId: request.id } });
      }

      // Pipeline board: new leads enter, existing clients re-enter as repeat
      // business, and stage triggers advance the card
      await enterPipeline(tx, company.id, contact.id);
      await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED");
      if (quote && config.serviceRequest.quoteMode === "send") {
        await autoAdvance(tx, company.id, contact.id, "QUOTE_SENT");
      }

      return { contact, request, quote };
    })
  );

  // Push: the owner(s) + preset lead assignee, like the email
  await notifyUsers(await requestNotifyUserIds(company.id), {
    title: `New request from ${firstName} ${lastName}`,
    body: result.request.title,
    url: `/app/requests/${result.request.id}`,
    tag: `request-${result.request.id}`,
  });

  // Notify the company inbox; reply goes straight to the customer
  const notifyTo = await companyNotifyAddress(company.id, company.email);
  if (notifyTo) {
    const { subject, html } = newRequestEmail({
      companyName: company.name,
      requestId: result.request.id,
      requestNumber: result.request.requestNumber,
      title: result.request.title,
      details: result.request.details,
      contactName: `${firstName} ${lastName}`,
      contactPhone: phone || null,
      contactEmail: email || null,
      source: "booking_form",
    });
    await sendEmail({ companyId: company.id, to: notifyTo, subject, html, replyTo: email || undefined });
  }

  // Auto-send mode: the client gets the quote approval link
  if (result.quote && form.config.serviceRequest.quoteMode === "send" && email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
    const { subject, html } = quoteLinkEmail({
      brand: company,
      companyName: company.name,
      quoteNumber: result.quote.quoteNumber,
      total: result.quote.total,
      viewUrl: `${baseUrl}/quote/${result.quote.publicToken}`,
      serviceNames: pickedServices.map((s) => s.name),
      depositNote:
        result.quote.deposit > 0
          ? `A deposit of $${result.quote.deposit.toFixed(2)} will be due on approval.`
          : undefined,
    });
    await sendEmail({
      companyId: company.id,
      to: email,
      subject,
      html,
      replyTo: company.email || undefined,
      fromName: company.name,
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
