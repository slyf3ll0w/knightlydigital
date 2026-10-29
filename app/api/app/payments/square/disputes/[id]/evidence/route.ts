import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, isManager } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { inPreview, previewBlockedError } from "@/lib/preview";
import {
  createSquareDisputeEvidenceFile,
  createSquareDisputeEvidenceText,
  isSquareEvidenceType,
  listSquareDisputeEvidence,
  OPEN_DISPUTE_STATES,
  retrieveSquareDispute,
  sellerFailureStatus,
  SQUARE_EVIDENCE_CONTENT_TYPES,
  SQUARE_EVIDENCE_MAX_BYTES,
  type SquareEvidenceType,
} from "@/lib/square-seller-reports";

/**
 * Dispute evidence on Square — the seller's answer to a chargeback.
 *   GET  lists what has been uploaded (DISPUTES_READ).
 *   POST adds one piece (DISPUTES_WRITE, managers): multipart `file`
 *        (PDF / JPG / PNG, ≤ 5 MB — Square's limit) with optional
 *        `evidenceType`, or JSON `{ text, evidenceType }` for a written
 *        explanation (≤ 500 chars). Files go straight through to Square;
 *        nothing is stored here.
 * The dispute id only resolves under this company's seller token.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  const read = await listSquareDisputeEvidence(actor.companyId, id, { cursor: req.nextUrl.searchParams.get("cursor") });
  if (!read.ok) {
    const { status, body } = sellerFailureStatus(read);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(read.data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Uploading dispute evidence"), { status: 403 });
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
    return NextResponse.json({ error: "Evidence can't be added any more — this dispute has been answered or decided." }, { status: 409 });
  }

  const idempotencyKey = randomUUID().replace(/-/g, "").slice(0, 45);
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { text?: unknown; evidenceType?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Write what you want the bank to know." }, { status: 400 });
    if (text.length > 500) return NextResponse.json({ error: "Keep the explanation under 500 characters." }, { status: 400 });
    const evidenceType: SquareEvidenceType = isSquareEvidenceType(body?.evidenceType) ? body.evidenceType : "REBUTTAL_EXPLANATION";
    const created = await createSquareDisputeEvidenceText(actor.companyId, id, { text, evidenceType, idempotencyKey });
    if (!created.ok) {
      const { status, body: err } = sellerFailureStatus(created);
      return NextResponse.json(err, { status });
    }
    return NextResponse.json({ evidence: created.data }, { status: 201 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (!SQUARE_EVIDENCE_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PDF, JPG, or PNG — banks only accept those formats." }, { status: 400 });
  }
  if (file.size > SQUARE_EVIDENCE_MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (5 MB max)." }, { status: 400 });
  }
  const typeRaw = formData?.get("evidenceType");
  const evidenceType: SquareEvidenceType = isSquareEvidenceType(typeRaw) ? typeRaw : "GENERIC_EVIDENCE";
  const created = await createSquareDisputeEvidenceFile(actor.companyId, id, {
    fileName: file.name,
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    evidenceType,
    idempotencyKey,
  });
  if (!created.ok) {
    const { status, body } = sellerFailureStatus(created);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json({ evidence: created.data }, { status: 201 });
}
