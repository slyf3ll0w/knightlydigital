import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { listSquarePayouts, sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET /api/app/payments/square/payouts?cursor=&status=SENT|PAID|FAILED
 * The seller's payouts (Payouts API, PAYOUTS_READ), newest first, 100 per
 * page. A grant from before PAYOUTS_READ answers 409 MISSING_SCOPES —
 * reconnect Square. Square down = 424.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  if (status && !["SENT", "PAID", "FAILED"].includes(status)) {
    return NextResponse.json({ error: "status must be SENT, PAID or FAILED." }, { status: 400 });
  }
  const read = await listSquarePayouts(actor.companyId, { status: status ?? undefined, cursor: sp.get("cursor") });
  if (!read.ok) {
    const { status: code, body } = sellerFailureStatus(read);
    return NextResponse.json(body, { status: code });
  }
  return NextResponse.json(read.data);
}
