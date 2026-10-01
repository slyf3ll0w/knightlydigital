import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { mediaResponse } from "@/lib/message-media";

/**
 * The body of an outbound MMS, for Telnyx to fetch while it sends (and for
 * the recipient's handset, which some carriers point straight at the source).
 * Only media on an OUTBOUND message is reachable here; the cuid is the key,
 * the same trust Telnyx's own media links carry. Inbound pictures never
 * leave the signed-in doors.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.portalMessageMedia.findUnique({
    where: { id },
    select: { message: { select: { direction: true } } },
  });
  if (!row || row.message.direction !== "OUTBOUND") return new Response(null, { status: 404 });
  return mediaResponse(id, "public");
}
