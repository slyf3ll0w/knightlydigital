import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { listSquareDisputes, sellerFailureStatus } from "@/lib/square-seller-reports";

const STATES = new Set([
  "INQUIRY_EVIDENCE_REQUIRED",
  "INQUIRY_PROCESSING",
  "INQUIRY_CLOSED",
  "EVIDENCE_REQUIRED",
  "PROCESSING",
  "WON",
  "LOST",
  "ACCEPTED",
]);

/**
 * GET /api/app/payments/square/disputes?cursor=&states=EVIDENCE_REQUIRED,PROCESSING
 * The seller's disputes (ListDisputes, DISPUTES_READ). A grant from before
 * DISPUTES_READ answers 409 MISSING_SCOPES — reconnect Square.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const states = (sp.get("states") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (states.some((s) => !STATES.has(s))) {
    return NextResponse.json({ error: "Unknown dispute state." }, { status: 400 });
  }
  const read = await listSquareDisputes(actor.companyId, { states, cursor: sp.get("cursor") });
  if (!read.ok) {
    const { status, body } = sellerFailureStatus(read);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(read.data);
}
