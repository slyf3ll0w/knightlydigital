import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { listSquarePayoutEntries, sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET /api/app/payments/square/payouts/[id]/entries?cursor=
 * What made up one payout: each charge, refund, dispute and fee with gross /
 * fee / net (ListPayoutEntries, PAYOUTS_READ). The payout id only resolves
 * under this company's seller token, so a foreign id is Square's 404.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Payout not found." }, { status: 404 });
  const read = await listSquarePayoutEntries(actor.companyId, id, { cursor: req.nextUrl.searchParams.get("cursor") });
  if (!read.ok) {
    const { status, body } = sellerFailureStatus(read);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(read.data);
}
