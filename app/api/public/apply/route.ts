import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newApplicationEmail } from "@/lib/email";

// Where new-application notifications land (a person reads every one).
const APPLICATION_INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";

/**
 * Public access-application intake from /apply. Creates a PENDING
 * AccessApplication for review at /superadmin/applications and pings the
 * admin inbox. Captcha-gated here, rate-limited (10/hr/IP) in middleware
 * under the /api/public/ bucket.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, email, phone, companyName, industry, teamSize, website, message, captchaToken } =
    body;

  if (!(await verifyCaptcha(captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  if (!name || !email || !companyName) {
    return NextResponse.json({ error: "Name, email, and business name are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (
    String(name).length > 120 ||
    String(email).length > 254 ||
    String(phone ?? "").length > 30 ||
    String(companyName).length > 120 ||
    String(industry ?? "").length > 80 ||
    String(teamSize ?? "").length > 40 ||
    String(website ?? "").length > 200 ||
    String(message ?? "").length > 2000
  ) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  // Re-applying while a decision is pending just acks the existing one —
  // no duplicate rows to wade through in the review queue.
  const pending = await prisma.accessApplication.findFirst({
    where: { email, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json({ success: true });
  }

  const application = await prisma.accessApplication.create({
    data: {
      name,
      email,
      phone: phone || null,
      companyName,
      industry: industry || null,
      teamSize: teamSize || null,
      website: website || null,
      message: message || null,
    },
  });

  // Best-effort notify — the application is saved either way.
  const notification = newApplicationEmail({
    name: application.name,
    email: application.email,
    phone: application.phone,
    companyName: application.companyName,
    industry: application.industry,
    teamSize: application.teamSize,
    website: application.website,
    message: application.message,
  });
  await sendEmail({ to: APPLICATION_INBOX, ...notification });

  return NextResponse.json({ success: true });
}
