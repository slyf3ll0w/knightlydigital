import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";

/**
 * Stamps this user's one-shot quote-approved celebration row (fired by
 * Celebration after the confetti runs). Per-user: each teammate sees the
 * moment once. The scoped findFirst doubles as the access check.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const quote = await prisma.quote.findFirst({
    where: {
      id,
      companyId: actor.companyId,
      ...viaContactScope(actor),
      status: { in: ["APPROVED", "CONVERTED"] },
    },
    select: { id: true },
  });
  if (quote) {
    await prisma.celebrationSeen.upsert({
      where: {
        userId_kind_entityId: {
          userId: actor.id,
          kind: "QUOTE_APPROVED",
          entityId: quote.id,
        },
      },
      create: { userId: actor.id, kind: "QUOTE_APPROVED", entityId: quote.id },
      update: {},
    });
  }

  return NextResponse.json({ success: true });
}
