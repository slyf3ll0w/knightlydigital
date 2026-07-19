import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * PATCH — the signed-in user's own profile: name, phone, and password
 * (current password required to set a new one).
 */
export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    data.name = String(body.name).trim().slice(0, 100);
  }
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;

  if (body.newPassword !== undefined) {
    if (String(body.newPassword).length < 8 || String(body.newPassword).length > 72) {
      return NextResponse.json({ error: "New password must be 8–72 characters." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const valid = await bcrypt.compare(String(body.currentPassword ?? ""), user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.newPassword, 12);
  }

  await prisma.user.update({ where: { id: actor.id }, data });
  return NextResponse.json({ success: true });
}
