import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { isIndustry, LISTING_PAGE, LISTING_SELECT, LISTING_STATUS, listingCard, listingMarks } from "@/lib/estimator-library";

/**
 * GET /api/app/library?industry=&q=&sort=likes|new&cursor= — browse the
 * Library (docs/plans/ai-estimators-2026-09-19.md, Batch 10). LIVE listings
 * only, most liked first (newest breaks ties) or newest first. Each card
 * says whether my company liked it, already copied it, or owns it.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const industry = sp.get("industry");
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const sort = sp.get("sort") === "new" ? "new" : "likes";
  const cursor = (sp.get("cursor") ?? "").trim().slice(0, 40);

  const where = {
    status: LISTING_STATUS.live,
    ...(isIndustry(industry) ? { industry } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const rows = await prisma.estimatorListing.findMany({
    where,
    select: LISTING_SELECT,
    orderBy: sort === "new" ? [{ createdAt: "desc" }, { id: "desc" }] : [{ likes: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: LISTING_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, LISTING_PAGE);
  const nextCursor = rows.length > LISTING_PAGE ? page[page.length - 1].id : null;
  const [marks, company] = await Promise.all([
    listingMarks(actor.companyId, page.map((r) => r.id)),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { assistantName: true } }),
  ]);
  const atlasName = company?.assistantName || "Atlas";
  const listings = page.map((r) => listingCard(r, { companyId: actor.companyId, ...marks, atlasName })).filter(Boolean);
  return NextResponse.json({ listings, nextCursor });
}
