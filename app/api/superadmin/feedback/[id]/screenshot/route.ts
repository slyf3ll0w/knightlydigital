import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { isBlobStorageConfigured, signedGetUrl } from "@/lib/blob-storage";
import { reportError } from "@/lib/report-error";

/**
 * The picture on a "Suggest a change" ticket, for /superadmin/feedback.
 * Console session only; answers a redirect to a short-lived R2 URL so the
 * bytes never pass through the app server (same shape as job photos).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const ticket = await prisma.feedbackTicket.findUnique({ where: { id }, select: { screenshotKey: true } });
  if (!ticket?.screenshotKey || !isBlobStorageConfigured()) return new NextResponse(null, { status: 404 });

  try {
    const url = await signedGetUrl(ticket.screenshotKey);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    reportError("[feedback/screenshot] signing failed", { id, error: err });
    return new NextResponse(null, { status: 502 });
  }
}
