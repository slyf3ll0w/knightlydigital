import { NextRequest, NextResponse } from "next/server";
import { ESTIMATOR_LIBRARY_ENABLED } from "@/lib/estimator-library-flag";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { addListingToCompany, LISTING_SELECT } from "@/lib/estimator-library";

/**
 * POST /api/app/library/[id]/add — copy a LIVE listing into my company as
 * a tool of its own (managers). Every rate lands under "Rates to confirm";
 * pictures are duplicated; History starts with "Added from the Library".
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // The Library is archived (lib/estimator-library-flag.ts)
  if (!ESTIMATOR_LIBRARY_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const listing = await prisma.estimatorListing.findUnique({ where: { id }, select: LISTING_SELECT });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const out = await addListingToCompany(listing, actor);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out.tool, { status: 201 });
}
