import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, contractSignedCopyEmail } from "@/lib/email";
import { isContractLinkExpired } from "@/lib/agreements";

/**
 * POST — client signs a contract with a typed signature (same e-sign
 * approach as quote approval: typed name + timestamp + IP).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const signatureName =
    typeof body.signatureName === "string" ? body.signatureName.trim().slice(0, 120) : "";
  if (signatureName.length < 2) {
    return NextResponse.json({ error: "Type your full name to sign." }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({ where: { publicToken: token } });
  if (!contract || contract.status === "VOID") {
    return NextResponse.json({ error: "This contract is no longer available." }, { status: 404 });
  }
  if (contract.status === "SIGNED") {
    return NextResponse.json({ error: "This contract has already been signed." }, { status: 400 });
  }
  if (isContractLinkExpired(contract)) {
    return NextResponse.json(
      { error: "This signing link has expired. Please ask for a new one to be sent." },
      { status: 410 }
    );
  }

  // Cloudflare sits in front — cf-connecting-ip is the real client
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  const signedAt = new Date();
  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "SIGNED", signatureName, signedAt, signedFromIp: ip },
  });

  // Copy to the signer (their record of the agreement) + heads-up to the company
  const [contact, company] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contract.contactId },
      select: { firstName: true, lastName: true, email: true },
    }),
    prisma.company.findUnique({
      where: { id: contract.companyId },
      select: {
        name: true,
        email: true,
        brandColor: true,
        brandColorSecondary: true,
        logoUrl: true,
      },
    }),
  ]);
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
  const signUrl = `${baseUrl}/contract/${contract.publicToken}`;
  if (contact?.email && company) {
    const { subject, html } = contractSignedCopyEmail({
      companyName: company.name,
      contactFirstName: contact.firstName,
      title: contract.title,
      body: contract.body,
      signatureName,
      signedAt,
      signUrl,
    });
    await sendEmail({
      to: contact.email,
      subject,
      html,
      replyTo: company.email || undefined,
      fromName: company.name,
      brand: company,
    });
  }
  if (company?.email) {
    await sendEmail({
      to: company.email,
      subject: `Contract signed: ${contract.title}`,
      html: `<p style="font-family:sans-serif;font-size:14px;color:#374151;">
        <strong>${contact ? `${contact.firstName} ${contact.lastName}` : "Your client"}</strong>
        signed "<strong>${contract.title.replace(/</g, "&lt;")}</strong>"
        on ${signedAt.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}.
        <a href="${baseUrl}/app/contracts/${contract.id}">View it in Streamflaire Hub</a>.
      </p>`,
      replyTo: contact?.email ?? undefined,
    });
  }

  return NextResponse.json({ success: true });
}
