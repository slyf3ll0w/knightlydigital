import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, hubAccessEmail } from "@/lib/email";

/**
 * Public: client requests a portal sign-in link from /portal/[slug].
 * Magic-link style — we email their hub link rather than reveal it (or
 * whether the email exists at all). Always answers success; middleware
 * rate-limits per IP.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  // Same response either way — this endpoint never confirms whether an
  // email is a client of the company.
  const ok = NextResponse.json({ success: true });
  if (!slug || !email || email.length > 200) return ok;

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, brandColor: true, documentColor: true, brandColorSecondary: true, logoUrl: true, suspendedAt: true },
  });
  if (!company) return ok;
  // Suspended companies: same silent response as an unknown email — no
  // portal links go out while the account is paused.
  if (company.suspendedAt) return ok;

  const contact = await prisma.contact.findFirst({
    where: { companyId: company.id, email: { equals: email, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { hubToken: true, firstName: true, email: true },
  });
  if (!contact?.email) return ok;

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const { subject, html } = hubAccessEmail({
    companyName: company.name,
    contactFirstName: contact.firstName,
    hubUrl: `${baseUrl}/hub/${contact.hubToken}`,
  });
  await sendEmail({ companyId: company.id, to: contact.email, subject, html, fromName: company.name, brand: company });

  return ok;
}
