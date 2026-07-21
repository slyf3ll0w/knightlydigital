import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";

/** Revoke an unused invite code — it stays listed for the audit trail. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const invite = await prisma.inviteCode.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  if (invite.usedAt) {
    return NextResponse.json(
      { error: "This code was already used — deactivate the company's users instead." },
      { status: 400 }
    );
  }
  if (invite.revokedAt) return NextResponse.json({ success: true });

  await prisma.inviteCode.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ success: true });
}
