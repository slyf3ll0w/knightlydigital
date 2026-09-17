import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { setPasswordForUser } from "@/lib/account";

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

  // Consume the token FIRST, atomically (the count settles a double submit),
  // then set the password. The other order left a live, reusable token for
  // the rest of its hour if anything failed between the two steps; this
  // order at worst burns a token the person can re-request.
  const consumed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }
  await prisma.passwordResetToken.deleteMany({
    where: { userId: record.userId, usedAt: null, id: { not: record.id } },
  });
  // The new password lands on the Account — one login across every company
  // this person belongs to (lib/account.ts).
  await setPasswordForUser(record.userId, password);

  return NextResponse.json({ success: true });
}
