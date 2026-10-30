import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { GiftCardError, lookupGiftCard } from "@/lib/gift-cards";

/** GET /api/app/payments/square/gift-cards/lookup?gan= — a card's state and balance by its number. */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const card = await lookupGiftCard(actor.companyId, req.nextUrl.searchParams.get("gan") ?? "");
    return NextResponse.json({ giftCard: { id: card.id, tail: card.tail, state: card.state, balanceCents: card.balanceCents } });
  } catch (err) {
    if (err instanceof GiftCardError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
