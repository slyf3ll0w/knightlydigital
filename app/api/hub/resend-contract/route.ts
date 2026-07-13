import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, contractSignEmail } from "@/lib/email";

/**
 * Public (hub-token auth): re-send a pending agreement's signing link to the
 * client's email. The portal deliberately doesn't embed e-sign documents —
 * it points at the inbox instead.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, contractId } = body ?? {};
  if (!token || !contractId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      id: true,
      email: true,
      firstName: true,
      company: {
        select: { name: true, brandColor: true, brandColorSecondary: true, logoUrl: true },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });
  if (!contact.email) {
    return NextResponse.json({ error: "No email address on file." }, { status: 400 });
  }

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, contactId: contact.id, status: "SENT" },
    select: { id: true, title: true, publicToken: true },
  });
  if (!contract) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });

  // Refresh the link's expiry window — resending renews an aged or expired link
  await prisma.contract.update({
    where: { id: contract.id },
    data: { sentAt: new Date() },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
  const { subject, html } = contractSignEmail({
    companyName: contact.company?.name ?? "",
    contactFirstName: contact.firstName,
    title: contract.title,
    signUrl: `${baseUrl}/contract/${contract.publicToken}`,
  });
  const sent = await sendEmail({
    to: contact.email,
    subject,
    html,
    fromName: contact.company?.name,
    brand: contact.company,
  });
  if (!sent) {
    return NextResponse.json({ error: "Couldn't send the email right now." }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
