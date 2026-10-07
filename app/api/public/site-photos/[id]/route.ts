import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBlobStorageConfigured, signedGetUrl } from "@/lib/blob-storage";

/**
 * GET /api/public/site-photos/[id] — the bytes of a photo the owner put on
 * their website: a WebsitePhoto upload, or a JobPhoto flagged "Use on
 * website". Public on purpose (the site shows it); anything else is a bare
 * 404, so an unflagged job photo is as private as before.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo =
    (await prisma.websitePhoto.findUnique({
      where: { id },
      select: { data: true, mimeType: true, storageKey: true },
    })) ??
    (await prisma.jobPhoto.findFirst({
      where: { id, siteUse: true },
      select: { data: true, mimeType: true, storageKey: true },
    }));
  if (!photo) return new NextResponse(null, { status: 404 });

  if (photo.storageKey && isBlobStorageConfigured()) {
    try {
      const url = await signedGetUrl(photo.storageKey);
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
    } catch (err) {
      reportError("[site-photos] signing failed", { id, error: err });
    }
  }
  if (!photo.data || !photo.mimeType) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      // Short on purpose: un-flagging a job photo must make it private again
      // soon, and a year of `immutable` would keep serving it from caches
      // (audit 2026-10-06, F6). Same window as the R2 redirect above.
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
