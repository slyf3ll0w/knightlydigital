import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { deleteCompanyCascade, PROTECTED_EMAILS } from "@/lib/company-delete";

/**
 * POST — permanently delete the company account and every record under it.
 * Deliberately hard to reach: OWNER role only, the exact company name must be
 * retyped, and the owner's password re-verified. There is no soft-delete and
 * no recovery — this exists so test accounts can be removed cleanly.
 * (Cascade lives in lib/company-delete.ts, shared with the superadmin console.)
 */

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner can delete the account." }, { status: 403 });
  }
  const companyId = actor.companyId;

  // brute-forcing the password through this endpoint should be impossible
  const rl = limit(`company-delete:${actor.id}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const confirmName = typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const [company, user] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, users: { select: { email: true } } },
    }),
    prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } }),
  ]);
  if (!company || !user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (company.users.some((u) => PROTECTED_EMAILS.includes(u.email.toLowerCase()))) {
    return NextResponse.json({ error: "This demo account can't be deleted." }, { status: 403 });
  }
  if (confirmName !== company.name) {
    return NextResponse.json(
      { error: "The name you typed doesn't match the company name exactly." },
      { status: 400 }
    );
  }
  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  await deleteCompanyCascade(companyId);

  console.warn(`Company account deleted: "${company.name}" (${companyId}) by user ${actor.id}`);
  return NextResponse.json({ success: true });
}
