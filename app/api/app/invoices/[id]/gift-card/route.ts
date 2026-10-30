import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { GiftCardError, redeemGiftCardOnInvoice } from "@/lib/gift-cards";

/**
 * POST /api/app/invoices/[id]/gift-card { gan, amount? (dollars) }
 * Staff redeem a Square gift card on the invoice: min(card balance, invoice
 * balance, amount) is charged to the card through Square and recorded as a
 * GIFT_CARD payment (lib/gift-cards.ts redeemGiftCardOnInvoice).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const amount = Number(body?.amount);
  try {
    const r = await redeemGiftCardOnInvoice({
      companyId: actor.companyId,
      invoiceId: id,
      gan: String(body?.gan ?? ""),
      amountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
      recordedById: actor.id,
      recordedByName: actor.name,
    });
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    if (err instanceof GiftCardError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
