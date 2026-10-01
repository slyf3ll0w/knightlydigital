import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { mediaResponse } from "@/lib/message-media";

/**
 * A thread attachment for the signed-in team: the row must belong to the
 * actor's company. Redirects to a signed R2 URL or streams the bytes
 * (lib/message-media.ts).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const { id } = await params;
  const row = await prisma.portalMessageMedia.findUnique({ where: { id }, select: { companyId: true } });
  if (!row || row.companyId !== actor.companyId) return new Response(null, { status: 404 });
  return mediaResponse(id);
}
