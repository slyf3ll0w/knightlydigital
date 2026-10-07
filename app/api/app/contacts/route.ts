import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { enterPipeline } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";
import { linkCallsToContact } from "@/lib/voice";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Picker feed (new job/request forms) — archived clients stay out. An
  // explicit select: the whole row carried hubToken (the client-portal login
  // secret) and the processor identity to every seller's browser.
  const contacts = await prisma.contact.findMany({
    where: {
      companyId: actor.companyId,
      ...contactScope(actor),
      status: { in: ["LEAD", "ACTIVE"] },
      placeholder: false, // an unsaved texted number is not someone to book a job for
    },
    // First name first: a lead saved with only a first name has lastName ""
    // which sorts ahead of everyone (ContactPicker re-sorts by display name;
    // this keeps the raw feed sane for the save-contact card too)
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      // The New-message picker searches company and phone too, and tells a
      // business connection apart from a client.
      companyName: true,
      phone: true,
      kind: true,
      status: true, // the Call / Message pickers say "Lead"
      address: true,
      city: true,
      state: true,
      zip: true,
      addresses: {
        select: { id: true, label: true, address: true, city: true, state: true, zip: true },
        orderBy: { createdAt: "asc" },
      },
    },
    // A picker, not an export: the searchable dropdown filters client-side,
    // and a client book past this size needs a search endpoint, not a bigger
    // payload.
    take: 2000,
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // One cap covers clients AND leads — leads are contacts on the pipeline
  if (await inPreview(actor.companyId)) {
    const n = await prisma.contact.count({ where: { companyId: actor.companyId } });
    if (n >= PREVIEW_CAP)
      return NextResponse.json(previewCapError("clients and leads"), { status: 403 });
  }

  const body = await req.json();
  const { firstName, lastName, companyName, email, phone, address, city, state, zip, notes, leadSource } = body;

  // Last name is optional (a caller who only gave "Mike" is still a lead)
  if (!String(firstName ?? "").trim()) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }

  let paymentTermsDays: number | undefined;
  if (body.paymentTermsDays !== undefined) {
    const n = Number(body.paymentTermsDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return NextResponse.json(
        { error: "Payment terms must be between 0 and 365 days." },
        { status: 400 }
      );
    }
    paymentTermsDays = n;
  }

  // Managers may assign to anyone in the company; sales/user always own
  // the leads they create.
  let assignedToId = actor.id;
  if (isManager(actor.role) && body.assignedToId) {
    const target = await prisma.user.findFirst({
      where: { id: body.assignedToId, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (target) assignedToId = target.id;
  }

  // A business connection (a sub, a supplier, a referral partner) is kept in
  // the same book but is never a lead: ACTIVE, off the board, listed under
  // Clients → Contacts until their first job makes them a client.
  const kind = body.kind === "CONTACT" ? ("CONTACT" as const) : ("CLIENT" as const);
  // Leads land on the pipeline board; clients created directly (status
  // ACTIVE) skip it — they're already won business, not a lead to work.
  const status = kind === "CONTACT" || body.status === "ACTIVE" ? ("ACTIVE" as const) : ("LEAD" as const);

  const contact = await prisma.contact.create({
    data: {
      companyId: actor.companyId,
      hubToken: randomBytes(24).toString("hex"),
      status,
      kind,
      firstName: String(firstName).trim(),
      lastName: String(lastName ?? "").trim(),
      companyName: companyName || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      notes: notes || null,
      leadSource: leadSource || null,
      ...(paymentTermsDays !== undefined && { paymentTermsDays }),
      // Texts are on by default; the form's "Texts allowed" box unticked = off.
      // The optional note records how the client agreed, when staff know.
      smsDisabled: body.smsConsent === false,
      ...(typeof body.smsConsentNote === "string" && body.smsConsentNote.trim()
        ? { smsConsentNote: body.smsConsentNote.trim().slice(0, 300) }
        : {}),
      assignedToId,
      // Typed in by the team: the bell's "New lead" is for leads that came
      // in on their own (forms, calls, webhooks), not ones you just added.
      createdById: actor.id,
      customFields:
        body.customFields !== undefined
          ? sanitizeCustomFields(body.customFields, await getActiveFieldDefs(actor.companyId))
          : undefined,
    },
  });

  // New leads go straight onto the pipeline board. A business connection is
  // neither a lead nor a client yet, so no automation hears about it.
  if (kind === "CLIENT") fireAutomations(actor.companyId, status === "LEAD" ? "lead.created" : "client.created", contact.id);
  if (status === "LEAD") await enterPipeline(prisma, actor.companyId, contact.id);
  // Calls from this number that never matched anyone are theirs now (the call log shows the name).
  await linkCallsToContact(actor.companyId, contact.id, contact.phone).catch(() => 0);

  return NextResponse.json(contact, { status: 201 });
}
