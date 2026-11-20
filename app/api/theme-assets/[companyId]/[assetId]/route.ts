import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getObjectBytes, isBlobStorageConfigured } from "@/lib/blob-storage";
import { isThemeAssetId } from "@/lib/client-theme-assets";
import { reportError } from "@/lib/report-error";

/**
 * A page-designer photo (lib/client-theme-assets.ts; the URL is
 * themeAssetUrl in lib/client-theme-load.ts). Public: the photos sit on
 * client-facing pages. Scoped: the id must belong to that company, anything
 * else is a bare 404. The bytes are streamed (not a redirect to a
 * short-lived signed URL) so the response can be cached for a year: an id
 * never changes its picture, a new upload is a new id.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ companyId: string; assetId: string }> }) {
  const { companyId, assetId } = await params;
  const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!isThemeAssetId(assetId) || !/^[A-Za-z0-9_-]{1,64}$/.test(companyId) || !isBlobStorageConfigured()) return notFound();

  const row = await prisma.themeAsset.findFirst({ where: { id: assetId, companyId }, select: { key: true } });
  if (!row) return notFound();

  let bytes: Uint8Array<ArrayBuffer> | null;
  try {
    bytes = await getObjectBytes(row.key);
  } catch (err) {
    reportError("[theme-assets] read failed:", err);
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  if (!bytes) return notFound();

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
