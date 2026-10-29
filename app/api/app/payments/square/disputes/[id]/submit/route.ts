import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { inPreview, previewBlockedError } from "@/lib/preview";
import {
  listSquareDisputeEvidence,
  OPEN_DISPUTE_STATES,
  retrieveSquareDispute,
  sellerFailureStatus,
  submitSquareDisputeEvidence,
} from "@/lib/square-seller-reports";

/**
 * POST /api/app/payments/square/disputes/[id]/submit — challenge the dispute
 * with the evidence uploaded so far (SubmitEvidence, DISPUTES_WRITE). After
 * this nothing can be added or removed. Square also challenges automatically
 * at the due date with whatever was uploaded, so this is "send it now".
 * Managers only; refused with nothing uploaded or once the dispute is closed.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Answering disputes"), { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const [current, evidence] = await Promise.all([retrieveSquareDispute(actor.companyId, id), listSquareDisputeEvidence(actor.companyId, id)]);
  if (!current.ok) {
    const { status, body } = sellerFailureStatus(current);
    return NextResponse.json(body, { status });
  }
  if (!OPEN_DISPUTE_STATES.has(current.data.state)) {
    return NextResponse.json({ error: "This dispute has already been answered or decided." }, { status: 409 });
  }
  if (evidence.ok && evidence.data.evidence.length === 0) {
    return NextResponse.json({ error: "Upload at least one piece of evidence first." }, { status: 400 });
  }
  const submitted = await submitSquareDisputeEvidence(actor.companyId, id);
  if (!submitted.ok) {
    const { status, body } = sellerFailureStatus(submitted);
    return NextResponse.json(body, { status });
  }
  console.info(`[square] dispute ${id} evidence submitted by user ${actor.id} (company ${actor.companyId})`);
  return NextResponse.json({ dispute: submitted.data });
}
