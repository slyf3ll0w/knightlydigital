import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { enterPipeline } from "@/lib/pipeline";
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
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
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

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
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

  // Leads land on the pipeline board; clients created directly (status
  // ACTIVE) skip it — they're already won business, not a lead to work.
  const status = body.status === "ACTIVE" ? ("ACTIVE" as const) : ("LEAD" as const);

  const contact = await prisma.contact.create({
    data: {
      companyId: actor.companyId,
      hubToken: randomBytes(24).toString("hex"),
      status,
      firstName,
      lastName,
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
      customFields:
        body.customFields !== undefined
          ? sanitizeCustomFields(body.customFields, await getActiveFieldDefs(actor.companyId))
          : undefined,
    },
  });

  // New leads go straight onto the pipeline board
  if (status === "LEAD") await enterPipeline(prisma, actor.companyId, contact.id);
  // Calls from this number that never matched anyone are theirs now (the call log shows the name).
  await linkCallsToContact(actor.companyId, contact.id, contact.phone).catch(() => 0);

  return NextResponse.json(contact, { status: 201 });
}
