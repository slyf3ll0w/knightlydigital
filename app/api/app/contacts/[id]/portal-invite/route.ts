import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { sendEmail, hubAccessEmail } from "@/lib/email";

/** Email a client their portal link (company-initiated portal access). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    select: { email: true, firstName: true, hubToken: true, company: { select: { name: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!contact.email) {
    return NextResponse.json(
      { error: "This client has no email address on file — add one first." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
  const { subject, html } = hubAccessEmail({
    companyName: contact.company?.name ?? "",
    contactFirstName: contact.firstName,
    hubUrl: `${baseUrl}/hub/${contact.hubToken}`,
  });
  const sent = await sendEmail({ to: contact.email, subject, html });
  if (!sent) {
    return NextResponse.json(
      { error: "Email isn't configured yet — copy the portal link instead." },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
