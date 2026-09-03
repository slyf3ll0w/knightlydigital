import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newRequestEmail, quoteLinkEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { defaultLeadAssignee } from "@/lib/permissions";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { derivedQuoteDeposit } from "@/lib/statuses";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { listPublicBookingTypes, menuTypes, resolvePublicBookingType, toPublicBookingType } from "@/lib/booking-runtime";
import { validateAnswers } from "@/lib/booking-answers";
import { hubSubmitter } from "@/lib/hub-form";

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

/**
 * Public submit for "we'll follow up" items (request mode).
 *   POST /api/public/book/[companySlug]
 *   { item: <slug>, firstName, lastName, email?, phone?, address?, service?,
 *     preferredDate?, message?, custom?: {fieldId: answer},
 *     selectedServices?: [workItemId], captchaToken, website, elapsedMs }
 * Creates (or matches) a contact, files a Request, maps answers into client
 * custom fields, and — for SERVICE items — auto-creates a quote (draft, or
 * sent to the client for online approval). Scheduled items post to
 * /api/public/schedule/[slug]/[item] instead.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));

  // The item: by slug, or (old embeds that never sent one) the company's one visible request item
  const itemSlug = typeof body.item === "string" ? body.item.slice(0, 60) : typeof body.formSlug === "string" ? body.formSlug.slice(0, 60) : "";
  let resolved = itemSlug ? await resolvePublicBookingType(slug, itemSlug) : null;
  if (!resolved && !itemSlug) {
    const listed = await listPublicBookingTypes(slug);
    const only = listed ? menuTypes(listed.types).filter((t) => t.mode === "REQUEST") : [];
    if (listed && only.length === 1) resolved = await resolvePublicBookingType(slug, only[0].slug);
  }
  if (!resolved) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  const { company, type } = resolved;
  // Client hub: a token of this company's contact is the auth — no captcha
  const hubContact = await hubSubmitter(body.hubToken, company.id);
  if (!hubContact && !(await verifyCaptcha(body.captchaToken))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }
  const pub = toPublicBookingType(type, company);
  if (pub.mode !== "REQUEST" || !pub.bookable) {
    return NextResponse.json({ error: "This form isn't taking submissions right now." }, { status: 400 });
  }
  const intake = pub.intake;

  // Bot signals: filled honeypot, or the form was completed inhumanly fast.
  // Pretend success so the bot doesn't learn it was caught.
  const filledHoneypot = typeof body.website === "string" && body.website.trim() !== "";
  const tooFast = typeof body.elapsedMs === "number" && body.elapsedMs >= 0 && body.elapsedMs < 3000;
  if (!hubContact && (filledHoneypot || tooFast)) return NextResponse.json({ success: true }, { status: 201 });

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  // From the hub, whatever the form didn't ask for comes from the contact's record
  const firstName = str(body.firstName, 100) || hubContact?.firstName || "";
  const lastName = str(body.lastName, 100) || hubContact?.lastName || "";
  const email = (intake.fields.email.show ? str(body.email, 200) : "") || hubContact?.email || "";
  const phone = (intake.fields.phone.show ? str(body.phone, 40) : "") || hubContact?.phone || "";
  const address = (intake.fields.address.show ? str(body.address, 300) : "") || hubContact?.address || "";
  const preferredDate = intake.fields.date.show ? str(body.preferredDate, 10) : "";
  const message = intake.message.show ? str(body.message, 5000) : "";

  if (!firstName || !lastName) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (intake.fields.email.required && !email) return NextResponse.json({ error: `"${intake.fields.email.label}" is required.` }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  if (intake.fields.phone.required && !phone) return NextResponse.json({ error: `"${intake.fields.phone.label}" is required.` }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Enter an email or phone number so we can reach you." }, { status: 400 });
  if (intake.fields.address.required && !address) return NextResponse.json({ error: `"${intake.fields.address.label}" is required.` }, { status: 400 });
  if (intake.fields.date.required && !preferredDate) return NextResponse.json({ error: `"${intake.fields.date.label}" is required.` }, { status: 400 });
  if (intake.message.required && !message) return NextResponse.json({ error: `"${intake.message.label}" is required.` }, { status: 400 });

  // The service question + custom questions (shared with the scheduled path)
  const answers = validateAnswers(intake, body);
  if ("error" in answers) return NextResponse.json({ error: answers.error }, { status: 400 });
  const { serviceAnswer, customLines, mappedContactFields } = answers;

  // Picked services (SERVICE items): must be on the item
  let picked: typeof pub.services = [];
  if (type.kind === "SERVICE") {
    const ids: string[] = Array.isArray(body.selectedServices) ? body.selectedServices.filter((s: unknown): s is string => typeof s === "string").slice(0, 30) : [];
    picked = pub.services.filter((s) => ids.includes(s.id));
    if (picked.length === 0) return NextResponse.json({ error: "Pick a service." }, { status: 400 });
    if (!intake.allowMultiple && picked.length > 1) picked = picked.slice(0, 1);
  }

  const since = new Date(Date.now() - 86400000);
  const recent = await prisma.request.count({ where: { companyId: company.id, source: { not: "webhook" }, createdAt: { gte: since } } });
  if (recent >= MAX_REQUESTS_PER_COMPANY_PER_DAY) {
    return NextResponse.json({ error: "This business can't accept more requests right now. Please call instead." }, { status: 429 });
  }

  const fieldDefs = Object.keys(mappedContactFields).length > 0 ? await getActiveFieldDefs(company.id) : [];
  const sanitizedMapped = sanitizeCustomFields(mappedContactFields, fieldDefs);

  // Website leads go to the company's preset assignee, else the owner
  const assignedToId = await defaultLeadAssignee(company.id);
  const requestTitle = type.kind === "SERVICE" ? picked.map((s) => s.name).join(", ") : serviceAnswer || type.name;
  const preferred = /^\d{4}-\d{2}-\d{2}$/.test(preferredDate) ? new Date(`${preferredDate}T12:00:00`) : null;

  const result = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      // Match an existing contact by phone or email; otherwise create a lead
      let contact = hubContact
        ? await tx.contact.findUnique({ where: { id: hubContact.id } })
        : await tx.contact.findFirst({
            where: { companyId: company.id, OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
          });
      if (contact && hubContact) {
        // Keep the record current with anything the form asked for that was missing
        const fill = { ...(!contact.email && email ? { email } : {}), ...(!contact.phone && phone ? { phone } : {}), ...(!contact.address && address ? { address } : {}) };
        if (Object.keys(fill).length > 0) contact = await tx.contact.update({ where: { id: contact.id }, data: fill });
      }
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
          data: { customFields: { ...((contact.customFields as Record<string, string>) ?? {}), ...sanitizedMapped } },
        });
      }

      // SERVICE items auto-create a quote (draft, or sent for approval).
      // Recurring services start a subscription only on quote→job conversion.
      let quote: { id: string; quoteNumber: number; publicToken: string; total: number; deposit: number } | null = null;
      if (type.kind === "SERVICE") {
        const wi = await tx.workItem.findMany({
          where: { id: { in: picked.map((s) => s.id) }, companyId: company.id },
          select: { id: true, recurringInterval: true, depositType: true, depositValue: true, requiresAgreement: true },
        });
        const wiById = new Map(wi.map((w) => [w.id, w] as const));
        const subtotal = Math.round(picked.reduce((s, p) => s + p.price, 0) * 100) / 100;
        const deposit = derivedQuoteDeposit(
          picked.map((s) => ({
            total: s.price,
            deposit: { depositType: wiById.get(s.id)?.depositType ?? "NONE", depositValue: wiById.get(s.id)?.depositValue ?? null },
          })),
          subtotal,
          { depositType: company.defaultDepositType, depositValue: company.defaultDepositValue }
        );
        const lastQuote = await tx.quote.findFirst({ where: { companyId: company.id }, orderBy: { quoteNumber: "desc" } });
        const send = intake.quoteMode === "send";
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
            clientMessage: message || null,
            sentAt: send ? new Date() : null,
            lineItems: {
              create: picked.map((s, i) => ({
                name: s.name,
                description: "",
                quantity: 1,
                unitPrice: s.price,
                total: s.price,
                workItemId: s.id,
                recurringInterval: wiById.get(s.id)?.recurringInterval ?? null,
                requiresAgreement: wiById.get(s.id)?.requiresAgreement ?? false,
                sortOrder: i,
              })),
            },
          },
        });
        quote = { id: created.id, quoteNumber: created.quoteNumber, publicToken: created.publicToken, total: subtotal, deposit };
      }

      const last = await tx.request.findFirst({ where: { companyId: company.id }, orderBy: { requestNumber: "desc" } });
      const request = await tx.request.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          requestNumber: (last?.requestNumber ?? 0) + 1,
          title: requestTitle,
          preferredDate: preferred,
          bookingTypeId: type.id,
          details: [
            message,
            ...customLines,
            type.kind === "SERVICE" ? `Services: ${picked.map((s) => `${s.name} (${s.priceLabel})`).join(", ")}` : null,
            quote
              ? `Quote #${quote.quoteNumber} created automatically (${intake.quoteMode === "send" ? "sent for approval" : "draft"})${quote.deposit > 0 ? ` — deposit $${quote.deposit.toFixed(2)}` : ""}.`
              : null,
            preferred ? `Preferred date: ${preferredDate}` : null,
            address ? `Address: ${address}` : null,
            `Form: ${type.name}`,
          ]
            .filter(Boolean)
            .join("\n"),
          source: hubContact ? "client_hub" : "booking_form",
        },
      });
      if (quote) await tx.quote.update({ where: { id: quote.id }, data: { requestId: request.id } });

      // Pipeline board: new leads enter, existing clients re-enter as repeat
      // business, and stage triggers advance the card
      // Hub requests are repeat business, not leads — the board stays as it is
      if (!hubContact) {
        await enterPipeline(tx, company.id, contact.id);
        await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED");
        if (quote && intake.quoteMode === "send") await autoAdvance(tx, company.id, contact.id, "QUOTE_SENT");
      }

      return { contact, request, quote };
    })
  );

  // Push: the owner(s) + preset lead assignee, like the email
  await notifyUsers(await requestNotifyUserIds(company.id, hubContact?.assignedToId), {
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
      source: hubContact ? "client_hub" : "booking_form",
    });
    await sendEmail({ companyId: company.id, to: notifyTo, subject, html, replyTo: email || undefined });
  }

  // Auto-send mode: the client gets the quote approval link
  if (result.quote && intake.quoteMode === "send" && email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
    const { subject, html } = quoteLinkEmail({
      brand: company,
      companyName: company.name,
      quoteNumber: result.quote.quoteNumber,
      total: result.quote.total,
      viewUrl: `${baseUrl}/quote/${result.quote.publicToken}`,
      serviceNames: picked.map((s) => s.name),
      depositNote: result.quote.deposit > 0 ? `A deposit of $${result.quote.deposit.toFixed(2)} will be due on approval.` : undefined,
    });
    await sendEmail({ companyId: company.id, to: email, subject, html, replyTo: company.email || undefined, fromName: company.name });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
