import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, isManager } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { GiftCardError, giftCardsOverview, sellGiftCard } from "@/lib/gift-cards";
import { sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET  /api/app/payments/square/gift-cards?cursor=&customerId=
 *      The cards on the seller's Square account (ListGiftCards) + WorkBench's
 *      sale records. Square down = 424; grant without the scope = 409.
 * POST /api/app/payments/square/gift-cards
 *      { amountCents, contactId?, recipientName?, recipientEmail?, message? }
 *      Sell a gift card: a PENDING Square card + the invoice the buyer pays
 *      (lib/gift-cards.ts sellGiftCard). Managers only.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const { read, sales } = await giftCardsOverview(actor.companyId, { cursor: sp.get("cursor"), customerId: sp.get("customerId") });
  if (!read.ok) {
    const { status, body } = sellerFailureStatus(read);
    return NextResponse.json({ ...body, sales }, { status });
  }
  return NextResponse.json({ giftCards: read.data.giftCards, cursor: read.data.cursor, sales });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Only owners and admins can sell gift cards." }, { status: 403 });
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Gift cards"), { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const amountCents = Math.round(Number(body?.amountCents));
  try {
    const sale = await sellGiftCard({
      companyId: actor.companyId,
      actorId: actor.id,
      actorName: actor.name,
      amountCents,
      contactId: typeof body?.contactId === "string" ? body.contactId : null,
      recipientName: typeof body?.recipientName === "string" ? body.recipientName : null,
      recipientEmail: typeof body?.recipientEmail === "string" ? body.recipientEmail : null,
      message: typeof body?.message === "string" ? body.message : null,
    });
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
    return NextResponse.json({ ...sale, payUrl: `${baseUrl}/pay/${sale.publicToken}` }, { status: 201 });
  } catch (err) {
    if (err instanceof GiftCardError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
