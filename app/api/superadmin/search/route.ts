import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";

/**
 * Console search box: accounts by name, slug, company email or any team
 * member's email. Eight hits, alphabetical — small enough to read at a
 * glance, and the box narrows as you type.
 */
export async function GET(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) return NextResponse.json({ hits: [] });

  const contains = { contains: q, mode: "insensitive" as const };
  const rows = await prisma.company.findMany({
    where: {
      OR: [
        { name: contains },
        { slug: contains },
        { email: contains },
        { users: { some: { email: contains } } },
      ],
    },
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, name: true, slug: true, industry: true, isTest: true, suspendedAt: true, accessPendingAt: true },
  });

  return NextResponse.json({
    hits: rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      isTest: c.isTest,
      suspended: Boolean(c.suspendedAt),
      pending: Boolean(c.accessPendingAt),
    })),
  });
}
