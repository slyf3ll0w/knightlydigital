import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { LISTING_STATUS, toggleLike } from "@/lib/estimator-library";

/** POST /api/app/library/[id]/like — toggle my company's like on a LIVE listing. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`library-like:${actor.companyId}`, 120, 10 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Too many likes at once — try again in a few minutes." }, { status: 429 });
  }
  const { id } = await params;
  const row = await prisma.estimatorListing.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row || row.status !== LISTING_STATUS.live) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await toggleLike(row.id, actor.companyId));
}
