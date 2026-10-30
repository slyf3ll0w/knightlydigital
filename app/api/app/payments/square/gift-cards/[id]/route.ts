import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, isManager } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { GiftCardError, removeGiftCard } from "@/lib/gift-cards";
import { listSquareGiftCardActivities, retrieveSquareGiftCard } from "@/lib/square-products";
import { sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET    /api/app/payments/square/gift-cards/[id] — one card and its activities (newest first).
 * DELETE /api/app/payments/square/gift-cards/[id] — deactivate it for good
 *        (lib/gift-cards.ts removeGiftCard; Square has no delete). Managers only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const [card, activities] = await Promise.all([
    retrieveSquareGiftCard(actor.companyId, id),
    listSquareGiftCardActivities(actor.companyId, id, { cursor: req.nextUrl.searchParams.get("cursor") }),
  ]);
  if (!card.ok) {
    const { status, body } = sellerFailureStatus(card);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json({ giftCard: card.data, activities: activities.ok ? activities.data.activities : [], cursor: activities.ok ? activities.data.cursor : null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Only owners and admins can deactivate gift cards." }, { status: 403 });
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Gift cards"), { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json(await removeGiftCard({ companyId: actor.companyId, giftCardId: id, actorId: actor.id, actorName: actor.name }));
  } catch (err) {
    if (err instanceof GiftCardError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
