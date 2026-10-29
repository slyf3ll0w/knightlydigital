import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { retrieveSquareDispute, sellerFailureStatus } from "@/lib/square-seller-reports";

/** GET /api/app/payments/square/disputes/[id] — one dispute, live from Square (DISPUTES_READ). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  const read = await retrieveSquareDispute(actor.companyId, id);
  if (!read.ok) {
    const { status, body } = sellerFailureStatus(read);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json({ dispute: read.data });
}
