import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * POST { token, password } — complete a password reset. Validates the token by
 * its SHA-256 hash, checks it's unused and unexpired, then sets the new password
 * and marks the token used (single-use). Rate-limited by middleware (public bucket).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token || !password) {
    return NextResponse.json({ error: "Missing token or password." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // Set the password and consume the token together; also drop any other
  // outstanding reset tokens for this user.
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
    }),
  ]);

  return NextResponse.json({ success: true });
}
