import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";

/**
 * Stamps the one-shot paid-celebration flag (fired by PaidCelebration after
 * the confetti runs). updateMany doubles as the scope check — an invoice
 * outside the actor's company/contact scope simply matches zero rows.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await prisma.invoice.updateMany({
    where: {
      id,
      companyId: actor.companyId,
      ...viaContactScope(actor),
      status: "PAID",
      paidCelebratedAt: null,
    },
    data: { paidCelebratedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
