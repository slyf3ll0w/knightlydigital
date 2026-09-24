import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { sendEmail, contractSignEmail } from "@/lib/email";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { fireAutomations } from "@/lib/automations-server";

/**
 * POST — email the client their signing link again (the same email the
 * create route sends). Bumps `sentAt`, which is what the 30-day link expiry
 * in lib/agreements.ts is measured from, so a resend also refreshes a stale
 * link. A DRAFT becomes SENT; signed and void agreements have nothing to send.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Sends land in a client's inbox — same per-company cap as quote/invoice sends
  const sendRl = await limit(`send:${actor.companyId}`, 120, 60 * 60 * 1000);
  if (!sendRl.ok) {
    return NextResponse.json(
      { error: "Too many sends in the last hour — try again shortly." },
      { status: 429, headers: { "Retry-After": String(sendRl.retryAfterSeconds) } }
    );
  }
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Sending agreements to clients"), { status: 403 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: { contact: { select: { email: true, firstName: true } } },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (contract.status === "SIGNED" || contract.status === "VOID") {
    return NextResponse.json(
      { error: "This agreement is already signed or void — nothing to send." },
      { status: 400 }
    );
  }
  if (!contract.contact.email) {
    return NextResponse.json(
      { error: "This client has no email on file — add one, or share the signing link instead." },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, brandColor: true, documentColor: true, brandColorSecondary: true, logoUrl: true },
  });
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const { subject, html } = contractSignEmail({
    brand: company ?? {},
    companyName: company?.name ?? "",
    contactFirstName: contract.contact.firstName,
    title: contract.title,
    signUrl: `${baseUrl}/contract/${contract.publicToken}`,
  });
  const emailed = await sendEmail({
    companyId,
    to: contract.contact.email,
    subject,
    html,
    fromName: company?.name,
  });
  if (!emailed) {
    return NextResponse.json(
      { error: "Email isn't set up on this server yet — share the signing link instead." },
      { status: 424 }
    );
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "SENT", sentAt: new Date() },
  });
  fireAutomations(contract.companyId, "contract.sent", contract.id);

  return NextResponse.json({ emailed: true, to: contract.contact.email });
}
