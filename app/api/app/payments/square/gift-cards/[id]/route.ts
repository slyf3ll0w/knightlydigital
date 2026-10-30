import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { listSquareGiftCardActivities, retrieveSquareGiftCard } from "@/lib/square-products";
import { sellerFailureStatus } from "@/lib/square-seller-reports";

/** GET /api/app/payments/square/gift-cards/[id] — one card and its activities (newest first). */
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
