import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, roleLabel } from "@/lib/permissions";

/**
 * GET — the signed-in person's company memberships, for the switcher.
 * One entry per active User row on the account; the session's row is marked
 * current. Suspended companies still list (switching into one lands on the
 * contact-support screen, which is the honest answer).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { accountId: true },
  });

  const rows = me?.accountId
    ? await prisma.user.findMany({
        where: {
          accountId: me.accountId,
          isActive: true,
          role: { not: "SUPERADMIN" },
          companyId: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          company: { select: { id: true, name: true, logoUrl: true } },
        },
      })
    : [];

  const companies = rows
    .filter((r) => r.company)
    .map((r) => ({
      userId: r.id,
      companyId: r.company!.id,
      companyName: r.company!.name,
      companyLogoUrl: r.company!.logoUrl,
      role: r.role,
      roleLabel: roleLabel[r.role] ?? r.role,
      current: r.id === actor.id,
    }));

  // Pre-backfill rows (no account yet) still get a well-formed answer.
  if (companies.length === 0) {
    const company = await prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { id: true, name: true, logoUrl: true },
    });
    if (company) {
      companies.push({
        userId: actor.id,
        companyId: company.id,
        companyName: company.name,
        companyLogoUrl: company.logoUrl,
        role: actor.role,
        roleLabel: roleLabel[actor.role] ?? actor.role,
        current: true,
      });
    }
  }

  return NextResponse.json({ companies });
}
