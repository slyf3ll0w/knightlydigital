import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifySuperadminLoginCode } from "@/lib/superadmin-otp";
import {
  SUPERADMIN_COOKIE,
  SUPERADMIN_SESSION_TTL_MS,
  createSuperadminSessionToken,
} from "@/lib/superadmin-session";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/**
 * Step 2 of /superadmin/login: re-verify email + password, consume the emailed
 * code, and set the console's own session cookie (lib/superadmin-session.ts) —
 * deliberately NOT a NextAuth session, so a tenant login in the same browser
 * survives. Failures stay generic except "code", which the login page maps to
 * "that code isn't right" (by then the password already checked out at
 * /api/superadmin/login-code, so nothing new is revealed).
 * Rate-limited in middleware.ts (superadmin-otp bucket, POST only).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password, code } = body ?? {};

  const invalid = NextResponse.json({ error: "invalid" }, { status: 401 });
  if (typeof email !== "string" || typeof password !== "string" || typeof code !== "string")
    return invalid;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.role !== "SUPERADMIN") return invalid;
  if (!(await bcrypt.compare(password, user.passwordHash))) return invalid;
  if (!(await verifySuperadminLoginCode(user.id, code)))
    return NextResponse.json({ error: "code" }, { status: 401 });

  const res = NextResponse.json({ success: true });
  res.cookies.set(SUPERADMIN_COOKIE, await createSuperadminSessionToken(user.id), {
    ...cookieOptions,
    maxAge: Math.floor(SUPERADMIN_SESSION_TTL_MS / 1000),
  });
  return res;
}

/** Sign out of the console (tenant NextAuth session, if any, is untouched). */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SUPERADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
