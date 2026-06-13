import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newRequestEmail, invoiceLinkEmail } from "@/lib/email";
import { defaultLeadAssignee } from "@/lib/permissions";
import { resolveWebForm } from "@/lib/web-forms";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { ensureSubscriptionsForContact } from "@/lib/subscriptions";

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

/**
 * Public web-form submission (inquiry / booking / service request).
 * Creates (or matches) a contact, files a Request, maps answers into client
 * custom fields, and — for service-request forms — auto-creates an invoice
 * (draft, or sent with a payment-link email).
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
  const serviceAsked = form.type !== "SERVICE_REQUEST" && config.service.show;
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
      : (serviceAsked && service) || form.name;

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

    // Service-request forms auto-create the invoice
    let invoice: { id: string; invoiceNumber: number; publicToken: string; total: number } | null = null;
    if (form.type === "SERVICE_REQUEST") {
      // Pull recurring config for any picked services that map to the price book
      const pickedWorkItemIds = pickedServices
        .map((s) => s.workItemId)
        .filter((id): id is string => !!id);
      const recurringById = new Map<string, "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL">();
      if (pickedWorkItemIds.length > 0) {
        const wi = await tx.workItem.findMany({
          where: { id: { in: pickedWorkItemIds }, companyId: company.id, recurringInterval: { not: null } },
          select: { id: true, recurringInterval: true },
        });
        for (const w of wi) if (w.recurringInterval) recurringById.set(w.id, w.recurringInterval);
      }

      const lastInv = await tx.invoice.findFirst({
        where: { companyId: company.id },
        orderBy: { invoiceNumber: "desc" },
      });
      const subtotal = pickedServices.reduce((s, p) => s + p.price, 0);
      const send = config.serviceRequest.invoiceMode === "send";
      const created = await tx.invoice.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          invoiceNumber: (lastInv?.invoiceNumber ?? 0) + 1,
          subject: form.name,
          status: send ? "AWAITING_PAYMENT" : "DRAFT",
          subtotal,
          total: subtotal,
          issuedAt: send ? new Date() : null,
          dueDate: send ? new Date(Date.now() + contact.paymentTermsDays * 86400000) : null,
          lineItems: {
            create: pickedServices.map((s, i) => ({
              name: s.name,
              description: "",
              quantity: 1,
              unitPrice: s.price,
              total: s.price,
              workItemId: s.workItemId ?? null,
              recurringInterval: (s.workItemId && recurringById.get(s.workItemId)) || null,
              sortOrder: i,
            })),
          },
        },
      });
      invoice = {
        id: created.id,
        invoiceNumber: created.invoiceNumber,
        publicToken: created.publicToken,
        total: subtotal,
      };

      // Recurring picks start a subscription on the client
      await ensureSubscriptionsForContact(
        tx,
        company.id,
        contact.id,
        pickedServices.map((s) => ({ workItemId: s.workItemId, quantity: 1 }))
      );
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
          invoice
            ? `Invoice #${invoice.invoiceNumber} created automatically (${config.serviceRequest.invoiceMode === "send" ? "sent" : "draft"}).`
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

    return { contact, request, invoice };
  });

  // Notify the company inbox; reply goes straight to the customer
  if (company.email) {
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
    await sendEmail({ to: company.email, subject, html, replyTo: email || undefined });
  }

  // Auto-send mode: the client gets the payment link
  if (result.invoice && form.config.serviceRequest.invoiceMode === "send" && email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
    const { subject, html } = invoiceLinkEmail({
      companyName: company.name,
      invoiceNumber: result.invoice.invoiceNumber,
      total: result.invoice.total,
      payUrl: `${baseUrl}/pay/${result.invoice.publicToken}`,
      serviceNames: pickedServices.map((s) => s.name),
    });
    await sendEmail({ to: email, subject, html, replyTo: company.email || undefined });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
