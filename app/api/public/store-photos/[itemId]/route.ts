import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBlobStorageConfigured, signedGetUrl } from "@/lib/blob-storage";
import { reportError } from "@/lib/report-error";

/**
 * GET /api/public/store-photos/[itemId] — a product's photo (the shop page
 * and the price book editor both show it). Public on purpose: a product
 * picture is what the shop is for. A product with no photo, or one that
 * was archived, is a bare 404.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const item = await prisma.workItem.findFirst({ where: { id: itemId, isActive: true }, select: { photoKey: true } });
  if (!item?.photoKey || !isBlobStorageConfigured()) return new NextResponse(null, { status: 404 });
  try {
    const url = await signedGetUrl(item.photoKey);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    reportError("[store-photos] signing failed", { itemId, error: err });
    return new NextResponse(null, { status: 404 });
  }
}
