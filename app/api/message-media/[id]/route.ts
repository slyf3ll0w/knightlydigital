import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { resolveChannel } from "@/lib/chat";
import { mediaResponse } from "@/lib/message-media";

/**
 * A thread attachment for the signed-in team: the row must belong to the
 * actor's company AND to a thread they can open (audit 2026-10-06 C6) —
 * a client thread needs the Messages role and the contact in their lead
 * scope (the same gate as the thread page and /api/app/messages); a team
 * chat photo needs membership of its channel (lib/chat.ts resolveChannel).
 * Redirects to a signed R2 URL or streams the bytes (lib/message-media.ts).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const { id } = await params;
  const row = await prisma.portalMessageMedia.findUnique({
    where: { id },
    select: { companyId: true, messageId: true, teamMessageId: true },
  });
  if (!row || row.companyId !== actor.companyId) return new Response(null, { status: 404 });
  if (row.messageId) {
    if (!canSell(actor.role)) return new Response(null, { status: 404 });
    const message = await prisma.portalMessage.findFirst({
      where: { id: row.messageId, companyId: actor.companyId, contact: { ...contactScope(actor) } },
      select: { id: true },
    });
    if (!message) return new Response(null, { status: 404 });
  } else if (row.teamMessageId) {
    const message = await prisma.teamMessage.findFirst({
      where: { id: row.teamMessageId, companyId: actor.companyId },
      select: { channelId: true, userId: true, recipientId: true },
    });
    if (!message) return new Response(null, { status: 404 });
    if (message.channelId) {
      if (!(await resolveChannel(actor, message.channelId))) return new Response(null, { status: 404 });
    } else if (message.recipientId && message.userId !== actor.id && message.recipientId !== actor.id) {
      // A pre-channels direct message: only its two people.
      return new Response(null, { status: 404 });
    }
  }
  return mediaResponse(id, "private", { download: req.nextUrl.searchParams.get("download") === "1" });
}
