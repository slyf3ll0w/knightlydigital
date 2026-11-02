import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, isManager } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { prisma } from "@/lib/db";
import { activateGiftCardForInvoice, GiftCardError, removeGiftCard } from "@/lib/gift-cards";
import { listSquareGiftCardActivities, retrieveSquareGiftCard } from "@/lib/square-products";
import { sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET    /api/app/payments/square/gift-cards/[id] — one card and its activities (newest first).
 *        The full card number is a bearer credential: owners and admins see it,
 *        other money roles get the card without it.
 * POST   /api/app/payments/square/gift-cards/[id] { action: "activate" } — the
 *        OWNER stands behind a typed-in (cash / check) payment and loads the card
 *        (lib/gift-cards.ts activateGiftCardForInvoice). Owners only.
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
  const giftCard = isManager(actor.role) ? card.data : { ...card.data, gan: null };
  return NextResponse.json({ giftCard, activities: activities.ok ? activities.data.activities : [], cursor: activities.ok ? activities.data.cursor : null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") return NextResponse.json({ error: "Only the account owner can load a card paid for by hand." }, { status: 403 });
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Gift cards"), { status: 403 });
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "activate") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const { id } = await params;
  const sale = await prisma.giftCardSale.findFirst({ where: { companyId: actor.companyId, squareGiftCardId: id }, select: { invoiceId: true } });
  if (!sale) return NextResponse.json({ error: "No WorkBench sale for this card." }, { status: 404 });
  const result = await activateGiftCardForInvoice(sale.invoiceId, { approvedByUserId: actor.id });
  if (result === "activated") return NextResponse.json({ ok: true, state: "ACTIVE" });
  if (result === "skipped") return NextResponse.json({ error: "This card can't be loaded yet — its invoice isn't paid, a bank transfer is still clearing, or it is already loaded." }, { status: 409 });
  if (result === "held") return NextResponse.json({ error: "Still waiting on an owner's OK." }, { status: 409 });
  return NextResponse.json({ error: "Square refused to load the card — it will be retried." }, { status: 424 });
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
