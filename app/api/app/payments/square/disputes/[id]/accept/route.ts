import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { acceptSquareDispute, OPEN_DISPUTE_STATES, retrieveSquareDispute, sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * POST /api/app/payments/square/disputes/[id]/accept — concede the dispute
 * (AcceptDispute, DISPUTES_WRITE): Square returns the money to the
 * cardholder and the state becomes ACCEPTED, which cannot be undone. Managers
 * only; the page asks for a confirm first. Refused when the dispute is no
 * longer open (already accepted, submitted, or decided).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Accepting disputes"), { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const current = await retrieveSquareDispute(actor.companyId, id);
  if (!current.ok) {
    const { status, body } = sellerFailureStatus(current);
    return NextResponse.json(body, { status });
  }
  if (!OPEN_DISPUTE_STATES.has(current.data.state)) {
    return NextResponse.json({ error: "This dispute can no longer be accepted — it's already been answered or decided." }, { status: 409 });
  }
  const accepted = await acceptSquareDispute(actor.companyId, id);
  if (!accepted.ok) {
    const { status, body } = sellerFailureStatus(accepted);
    return NextResponse.json(body, { status });
  }
  console.info(`[square] dispute ${id} accepted by user ${actor.id} (company ${actor.companyId})`);
  return NextResponse.json({ dispute: accepted.data });
}
