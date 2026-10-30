import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { grantLoyaltyReward, LoyaltyError } from "@/lib/loyalty";

/**
 * POST /api/app/invoices/[id]/loyalty-reward { tierId }
 * Spend one of the client's rewards on this invoice: the tier's discount
 * goes on the invoice and the reward is redeemed at Square
 * (lib/loyalty.ts grantLoyaltyReward).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const grant = await grantLoyaltyReward({ companyId: actor.companyId, invoiceId: id, tierId: String(body?.tierId ?? ""), actorId: actor.id, actorName: actor.name });
    return NextResponse.json({ success: true, ...grant });
  } catch (err) {
    if (err instanceof LoyaltyError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
