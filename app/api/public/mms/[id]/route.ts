import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { mediaResponse } from "@/lib/message-media";
import { canText } from "@/lib/sms-consent";

/**
 * How long after a text goes out its picture stays fetchable here. Telnyx
 * pulls the body within minutes; a handset that a carrier points straight at
 * the source does so when the text lands. Nothing legitimate asks days later.
 */
export const PUBLIC_MMS_WINDOW_MS = 48 * 3_600_000;

/**
 * The body of an outbound MMS, for Telnyx to fetch while it sends (and for
 * the recipient's handset, which some carriers point straight at the source).
 * The cuid is the key — the same trust Telnyx's own media links carry — so
 * the door is as narrow as the need: only media on an OUTBOUND client-thread
 * message, only for a client the text could actually go to (a number, no
 * STOP), and only for PUBLIC_MMS_WINDOW_MS after the send. A photo sent on a
 * portal-only thread was never texted and is never served here. Inbound
 * pictures never leave the signed-in doors.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.portalMessageMedia.findUnique({
    where: { id },
    select: {
      createdAt: true,
      message: { select: { direction: true, contact: { select: { phone: true, smsOptOut: true, smsDisabled: true } } } },
    },
  });
  if (!row?.message || row.message.direction !== "OUTBOUND") return new Response(null, { status: 404 });
  if (!canText(row.message.contact)) return new Response(null, { status: 404 });
  if (Date.now() - row.createdAt.getTime() > PUBLIC_MMS_WINDOW_MS) return new Response(null, { status: 404 });
  return mediaResponse(id, "public");
}
