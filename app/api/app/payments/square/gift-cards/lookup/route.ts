import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { giftCardsOpenFor, GIFT_CARDS_CLOSED_MESSAGE } from "@/lib/gift-cards-preview";
import { GiftCardError, lookupGiftCard } from "@/lib/gift-cards";

/**
 * POST /api/app/payments/square/gift-cards/lookup { gan } — a card's state
 * and balance by its number. A POST body, not a query string: the number
 * spends the balance, so it stays out of access logs and browser history
 * (security audit 2026-11-01). The answer never echoes the number back.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await giftCardsOpenFor(actor.companyId))) return NextResponse.json({ error: GIFT_CARDS_CLOSED_MESSAGE }, { status: 404 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { gan?: unknown } | null;
  try {
    const card = await lookupGiftCard(actor.companyId, typeof body?.gan === "string" ? body.gan : "");
    return NextResponse.json({ giftCard: { id: card.id, tail: card.tail, state: card.state, balanceCents: card.balanceCents } });
  } catch (err) {
    if (err instanceof GiftCardError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
