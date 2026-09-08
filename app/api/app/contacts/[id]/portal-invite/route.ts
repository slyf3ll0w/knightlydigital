import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { sendEmail, hubAccessEmail } from "@/lib/email";
import { inPreview, previewBlockedError } from "@/lib/preview";

/** Email a client their portal link (company-initiated portal access). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Sends cost money (email/SMS) and land in a client's inbox — cap per
  // company so one compromised login can't mailbomb or run up the bill
  const sendRl = await limit(`send:${actor.companyId}`, 120, 60 * 60 * 1000);
  if (!sendRl.ok) {
    return NextResponse.json(
      { error: "Too many sends in the last hour — try again shortly." },
      { status: 429, headers: { "Retry-After": String(sendRl.retryAfterSeconds) } }
    );
  }
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Inviting clients to their portal"), { status: 403 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    select: {
      email: true,
      firstName: true,
      hubToken: true,
      company: {
        select: { name: true, brandColor: true, documentColor: true, brandColorSecondary: true, logoUrl: true },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!contact.email) {
    return NextResponse.json(
      { error: "This client has no email address on file — add one first." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const { subject, html } = hubAccessEmail({
    brand: contact.company ?? {},
    companyName: contact.company?.name ?? "",
    contactFirstName: contact.firstName,
    hubUrl: `${baseUrl}/hub/${contact.hubToken}`,
  });
  const sent = await sendEmail({
    companyId: actor.companyId,
    to: contact.email,
    subject,
    html,
    fromName: contact.company?.name,
  });
  if (!sent) {
    return NextResponse.json(
      { error: "Email isn't configured yet — copy the portal link instead." },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
