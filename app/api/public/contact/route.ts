import { reportError } from "@/lib/report-error";
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { clientIp, limit } from "@/lib/rate-limit";
import { newContactSubmissionEmail, sendEmail } from "@/lib/email";

// Same inbox as new applications and feedback (a person reads every one).
const CONTACT_INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * The marketing site's "Contact us" form (components/wb/WBContactForm.tsx):
 * stores a ContactSubmission for /superadmin/contact and emails the inbox.
 * Captcha-gated (action "contact"), 5 per hour per IP on top of the public
 * middleware bucket, and a hidden `website` honeypot that answers OK and
 * stores nothing.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = await limit(`contact:post:${ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many messages from here. Try again in a bit, or give us a call." }, { status: 429 });
  }

  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (typeof data.website === "string" && data.website) return NextResponse.json({ ok: true }); // honeypot

  if (!(await verifyCaptcha(data.captchaToken, "contact"))) {
    return NextResponse.json({ error: "Captcha check failed. Please try again." }, { status: 400 });
  }

  const name = str(data.name, 120);
  const email = str(data.email, 254).toLowerCase();
  const phone = str(data.phone, 30) || null;
  const businessName = str(data.businessName, 120) || null;
  const message = str(data.message, 4000);
  const pageUrl = str(data.pageUrl, 300) || null;

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email and how we can help are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (phone && phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "Please enter a full phone number, or leave it blank." }, { status: 400 });
  }

  await prisma.contactSubmission.create({
    data: { name, email, phone, businessName, message, pageUrl, ip },
  });

  after(async () => {
    try {
      const mail = newContactSubmissionEmail({ name, email, phone, businessName, message });
      await sendEmail({ to: CONTACT_INBOX, replyTo: email, ...mail });
    } catch (err) {
      reportError("[contact] notification email failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
