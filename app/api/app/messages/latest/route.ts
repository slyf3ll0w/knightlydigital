import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";

/**
 * Inbox heartbeat: when did this company's conversations last move? The
 * inbox page polls this (one indexed row) and re-renders itself when the
 * stamp changes, so a text that just arrived surfaces without a reload.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const last = await prisma.portalMessage.findFirst({
    where: { companyId: actor.companyId, ...viaContactScope(actor) },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return NextResponse.json({ stamp: last?.createdAt.toISOString() ?? null });
}
