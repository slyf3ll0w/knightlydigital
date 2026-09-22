import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { LISTING_STATUS } from "@/lib/estimator-library";

/**
 * Moderate a Library listing. "remove" takes it off the public Library
 * with a reason the owner sees on their tool page (copies other companies
 * already added are untouched — they're separate tools); "restore" puts it
 * back as LIVE. Never deletes.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; reason?: unknown };
  const row = await prisma.estimatorListing.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

  if (body.action === "remove") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) return NextResponse.json({ error: "Give the owner a reason." }, { status: 400 });
    const updated = await prisma.estimatorListing.update({ where: { id }, data: { status: LISTING_STATUS.removed, removedReason: reason, removedAt: new Date() }, select: { id: true, status: true, removedReason: true } });
    return NextResponse.json({ listing: updated });
  }
  if (body.action === "restore") {
    const updated = await prisma.estimatorListing.update({ where: { id }, data: { status: LISTING_STATUS.live, removedReason: null, removedAt: null }, select: { id: true, status: true } });
    return NextResponse.json({ listing: updated });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
