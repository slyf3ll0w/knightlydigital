import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBlobStorageConfigured, signedGetUrl } from "@/lib/blob-storage";

/**
 * Serve a picture used on an estimate tool. Public on purpose — these
 * pictures are the option/question illustrations on the company's public
 * estimate form, so anyone with the form can already see them. Bytes in R2
 * answer with a redirect to a short-lived presigned URL; bytes still in
 * Postgres stream from the row.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return new NextResponse(null, { status: 404 });
  const img = await prisma.estimatorImage.findUnique({ where: { id }, select: { data: true, mimeType: true, storageKey: true } });
  if (!img) return new NextResponse(null, { status: 404 });

  if (img.storageKey && isBlobStorageConfigured()) {
    try {
      const url = await signedGetUrl(img.storageKey);
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
    } catch (err) {
      console.error("[estimate-images] signing failed", { id, error: err });
    }
  }
  if (!img.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(img.data), {
    headers: {
      "Content-Type": img.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
