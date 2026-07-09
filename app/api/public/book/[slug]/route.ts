import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newRequestEmail, quoteLinkEmail, bookingReceivedEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { companyManagerIds, notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { defaultLeadAssignee } from "@/lib/permissions";
import { resolveWebForm } from "@/lib/web-forms";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { derivedQuoteDeposit } from "@/lib/statuses";
import { zipFromAddress } from "@/lib/business-hours";
import { generateSlots, pickUserForSlot } from "@/lib/booking-slots";
import {
  engineInputFor,
  getBookableUsersWithBusy,
  resolveBookableService,
  slotLabel,
} from "@/lib/booking-availability";
import { Prisma } from "@prisma/client";

// Submit-time double-booking race: thrown inside the transaction when the
// picked slot is no longer free, mapped to a 409 the form handles by
// refreshing its slot list.
class SlotTakenError extends Error {}

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

/**
 * Public web-form submission (inquiry / booking / service request).
 * Creates (or matches) a contact, files a Request, maps answers into client
 * custom fields, and — for service-request forms — auto-creates a quote (draft,
 * or sent to the client for online approval). Deposits derive from the picked
 * preset services and are collected via a deposit invoice once the quote is
 * approved (see lib/deposits.ts).
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
  // service picker, so its "required" rule doesn't apply to them
  const selfScheduling = form.type === "BOOKING" && config.selfSchedule.enabled;
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

  // Self-scheduling (BOOKING forms with the toggle on): validate the picked
  // service + slot against live data. Forms without the toggle never send
  // slotStart, so the classic flow below is untouched.
  let booking:
    | {
        service: { formServiceId: string; name: string; price: number; durationMinutes: number };
        start: Date;
        end: Date;
        windowEnd: Date;
      }
    | null = null;
  if (form.type === "BOOKING" && config.selfSchedule.enabled && body.slotStart !== undefined) {
    const service = await resolveBookableService(company.id, config, body.serviceId);
    if (!service) {
      return NextResponse.json({ error: "Pick a service to book." }, { status: 400 });
    }
    if (company.serviceZips.length > 0) {
      const zip = zipFromAddress(String(address ?? ""));
      if (!zip || !company.serviceZips.includes(zip)) {
        return NextResponse.json(
          { error: "That address looks outside our service area — send us a message instead and we'll see what we can do." },
          { status: 400 }
        );
      }
    }
    const start = new Date(String(body.slotStart));
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "Pick a time." }, { status: 400 });
    }
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + (config.selfSchedule.horizonDays + 1) * 86400000);
    const users = await getBookableUsersWithBusy(company.id, now, horizonEnd);
    const slots = generateSlots(engineInputFor(company, config, service.durationMinutes, users, now));
    const slot = slots.find((s) => s.start.getTime() === start.getTime());
    if (!slot) {
      return NextResponse.json(
        { error: "That time was just taken — please pick another.", slotTaken: true },
        { status: 409 }
      );
    }
    booking = { service, start: slot.start, end: slot.end, windowEnd: slot.windowEnd };
  }

  const since = new Date(Date.now() - 86400000);
  const recent = await prisma.request.count({
    where: { companyId: company.id, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_COMPANY_PER_DAY) {
    return NextResponse.json(
      { error: "This business can't accept more requests right now. Please call instead." },
      { status: 429 }
    );
  }

  // Website leads go to the company's preset assignee, else the owner
  const assignedToId = await defaultLeadAssignee(company.id);
  const fieldDefs =
    Object.keys(mappedContactFields).length > 0 ? await getActiveFieldDefs(company.id) : [];
  const sanitizedMapped = sanitizeCustomFields(mappedContactFields, fieldDefs);

  const requestTitle =
    form.type === "SERVICE_REQUEST"
      ? pickedServices.map((s) => s.name).join(", ")
      : booking
        ? booking.service.name
        : (serviceAsked && service) || form.name;

  const bookingWindow = booking
    ? slotLabel(company.timezone, booking.start, booking.windowEnd)
    : null;

  const preferred =
    config.fields.date.show && typeof preferredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
      ? new Date(`${preferredDate}T12:00:00`)
      : null;

  const result = await prisma.$transaction(async (tx) => {
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
        status: booking ? "NEEDS_APPROVAL" : undefined,
        preferredDate: booking ? booking.start : preferred,
        details: [
          message,
          ...customLines,
          form.type === "SERVICE_REQUEST"
            ? `Services: ${pickedServices.map((s) => `${s.name} ($${s.price.toFixed(2)})`).join(", ")}`
            : null,
          booking
            ? `Self-scheduled online: ${booking.service.name} ($${booking.service.price.toFixed(2)}) — requested arrival ${bookingWindow}`
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

    // Self-scheduled slot → tentative appointment. Availability re-checked
    // inside the transaction (serializable, see below) so two clients
    // grabbing the same window can't both win.
    if (booking) {
      const usersNow = await getBookableUsersWithBusy(
        company.id,
        booking.start,
        booking.end,
        tx
      );
      const userId = pickUserForSlot(booking.start, booking.end, usersNow);
      if (!userId) throw new SlotTakenError();
      await tx.appointment.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          requestId: request.id,
          assignedToId: userId,
          title: booking.service.name,
          type: "IN_PERSON",
          scheduledAt: booking.start,
          scheduledEnd: booking.end,
          address: address || null,
          tentative: true,
          notes: `Booked online — promised arrival window ${bookingWindow}.`,
        },
      });
    }

    return { contact, request, quote };
  },
  booking ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined
  ).catch((e) => {
    // Slot races: our explicit re-check, or Postgres aborting one of two
    // serializable transactions that raced. The form refreshes its slots.
    if (
      e instanceof SlotTakenError ||
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034")
    ) {
      return null;
    }
    throw e;
  });

  if (result === null) {
    return NextResponse.json(
      { error: "That time was just taken — please pick another.", slotTaken: true },
      { status: 409 }
    );
  }

  // Push: self-scheduled bookings need a manager's Accept/Decline; everything
  // else goes to the owner(s) + preset lead assignee like the email does
  await notifyUsers(
    booking ? await companyManagerIds(company.id) : await requestNotifyUserIds(company.id),
    booking
      ? {
          title: "Booking to approve",
          body: `${firstName} ${lastName} — ${booking.service.name}, ${bookingWindow}`,
          url: `/app/requests/${result.request.id}`,
          tag: `request-${result.request.id}`,
        }
      : {
          title: `New request from ${firstName} ${lastName}`,
          body: result.request.title,
          url: `/app/requests/${result.request.id}`,
          tag: `request-${result.request.id}`,
        }
  );

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
    await sendEmail({ to: notifyTo, subject, html, replyTo: email || undefined });
  }

  // Auto-send mode: the client gets the quote approval link
  if (result.quote && form.config.serviceRequest.quoteMode === "send" && email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
    const { subject, html } = quoteLinkEmail({
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
    await sendEmail({ to: email, subject, html, replyTo: company.email || undefined });
  }

  // Self-scheduled booking: the client gets a "received, awaiting
  // confirmation" email right away (confirm/decline emails follow the
  // owner's decision).
  if (booking && email && bookingWindow) {
    const { subject, html } = bookingReceivedEmail({
      companyName: company.name,
      contactFirstName: firstName,
      serviceName: booking.service.name,
      windowLabel: bookingWindow,
      address: address || null,
    });
    await sendEmail({ to: email, subject, html, replyTo: company.email || undefined });
  }

  return NextResponse.json(
    {
      success: true,
      ...(booking && {
        booking: {
          start: booking.start.toISOString(),
          windowEnd: booking.windowEnd.toISOString(),
          label: bookingWindow,
          service: booking.service.name,
        },
      }),
    },
    { status: 201 }
  );
}
