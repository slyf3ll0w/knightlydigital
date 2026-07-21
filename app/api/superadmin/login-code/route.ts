import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { issueSuperadminLoginCode } from "@/lib/superadmin-otp";
import { emailEnabled, sendEmail, superadminLoginCodeEmail } from "@/lib/email";

/**
 * Step 1 of /superadmin/login: verify email + password, then email a 6-digit
 * code. The session itself is only minted by NextAuth once the code checks
 * out (lib/auth-options.ts). Failures are all the same generic 401 so this
 * endpoint never confirms which addresses are superadmins.
 * Rate-limited in middleware.ts (superadmin-otp bucket).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password, captchaToken } = body ?? {};

  if (!(await verifyCaptcha(captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  const invalid = NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  if (typeof email !== "string" || typeof password !== "string") return invalid;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.role !== "SUPERADMIN") return invalid;
  if (!(await bcrypt.compare(password, user.passwordHash))) return invalid;

  const code = await issueSuperadminLoginCode(user.id);

  if (!emailEnabled()) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Email delivery isn't configured (RESEND_API_KEY), so a sign-in code can't be sent." },
        { status: 503 }
      );
    }
    // Local dev has no Resend — the server console is the inbox.
    console.log(`[superadmin-login] code for ${email}: ${code}`);
    return NextResponse.json({ success: true });
  }

  const sent = await sendEmail({
    to: user.email,
    ...superadminLoginCodeEmail({ code }),
  });
  if (!sent) {
    return NextResponse.json(
      { error: "Couldn't send the sign-in code email. Try again in a minute." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
