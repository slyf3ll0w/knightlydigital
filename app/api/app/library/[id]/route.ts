import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { specFromJson } from "@/lib/estimator";
import { listingCard, listingMarks, loadVisibleListing } from "@/lib/estimator-library";

/** GET /api/app/library/[id] — one listing with its (portable) spec, for Preview. 404 unless LIVE or mine. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await loadVisibleListing(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const spec = specFromJson(row.spec);
  if (!spec) return NextResponse.json({ error: "This listing's rules no longer compile." }, { status: 409 });
  const [marks, company] = await Promise.all([listingMarks(actor.companyId, [row.id]), prisma.company.findUnique({ where: { id: actor.companyId }, select: { assistantName: true } })]);
  const card = listingCard(row, { companyId: actor.companyId, ...marks, atlasName: company?.assistantName || "Atlas" });
  return NextResponse.json({ ...card, status: row.status, spec });
}
