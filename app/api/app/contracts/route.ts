import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { sendEmail, contractSignEmail } from "@/lib/email";

/**
 * POST — issue a contract to a client. Body text comes from a saved
 * template (with {{client_name}} / {{company_name}} / {{date}} filled at
 * creation) or is written from scratch; either way it's snapshotted here so
 * later template edits don't change what was sent.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { contactId, templateId } = body;
  if (!contactId) return NextResponse.json({ error: "Pick a client." }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  let title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  let text = typeof body.body === "string" ? body.body.trim().slice(0, 50000) : "";

  if (templateId) {
    const template = await prisma.contractTemplate.findFirst({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    if (!title) title = template.name;
    if (!text) text = template.body;
  }
  if (!title || !text) {
    return NextResponse.json({ error: "A title and contract text are required." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  text = text
    .replaceAll("{{client_name}}", `${contact.firstName} ${contact.lastName}`.trim())
    .replaceAll("{{company_name}}", company?.name ?? "")
    .replaceAll("{{date}}", today);

  const contract = await prisma.contract.create({
    data: {
      companyId,
      contactId,
      templateId: templateId || null,
      title,
      body: text,
      status: "SENT",
      sentAt: new Date(),
    },
  });

  // Deliver the signing link to the client's inbox — ties the eventual
  // signature to their email address (and they don't need anyone to text
  // them a link)
  if (contact.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
    const { subject, html } = contractSignEmail({
      companyName: company?.name ?? "",
      contactFirstName: contact.firstName,
      title,
      signUrl: `${baseUrl}/contract/${contract.publicToken}`,
    });
    await sendEmail({ to: contact.email, subject, html });
  }

  return NextResponse.json(contract, { status: 201 });
}
