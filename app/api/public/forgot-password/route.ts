import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { emailWhere, normalizeEmail } from "@/lib/user-email";

/**
 * POST { email } — start a password reset. Anti-enumeration: always responds
 * with success, whether or not the email matches an account. When it does, we
 * store a SHA-256 hash of a random token and email the raw token as a one-hour,
 * single-use link. Rate-limited by middleware (public bucket).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);

  // Always the same response — never reveal whether an account exists.
  const ok = NextResponse.json({ success: true });
  if (!email || email.length > 200) return ok;

  // Case-insensitive so accounts stored with the casing the owner typed at
  // signup can still be reset (see lib/user-email.ts).
  const user = await prisma.user.findFirst({
    where: emailWhere(email),
    orderBy: { createdAt: "asc" },
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
  // The email rides along so the reset form can name the account in its hidden
  // username field — password managers need an identifier to file the new
  // password under. It grants nothing on its own; the token is the credential,
  // and the link only ever lands in this address's own inbox.
  const resetUrl = `${base}/app/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
  const { subject, html } = passwordResetEmail({ name: user.name, resetUrl });
  await sendEmail({ to: user.email, subject, html });

  return ok;
}
