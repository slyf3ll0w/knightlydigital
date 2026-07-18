import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail, passwordResetEmail } from "@/lib/email";

/**
 * POST { email } — start a password reset. Anti-enumeration: always responds
 * with success, whether or not the email matches an account. When it does, we
 * store a SHA-256 hash of a random token and email the raw token as a one-hour,
 * single-use link. Rate-limited by middleware (public bucket).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  // Always the same response — never reveal whether an account exists.
  const ok = NextResponse.json({ success: true });
  if (!email || email.length > 200) return ok;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) return ok;

  // Invalidate any still-live tokens for this user before issuing a new one.
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60_000), // 1 hour
    },
  });

  const base = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const resetUrl = `${base}/app/reset-password?token=${token}`;
  const { subject, html } = passwordResetEmail({ name: user.name, resetUrl });
  await sendEmail({ to: user.email, subject, html });

  return ok;
}
