import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, isManager } from "@/lib/permissions";
import {
  getDispute,
  listDisputeEvidence,
  uploadDisputeEvidence,
  FinixError,
  type FinixDispute,
} from "@/lib/finix";

// Finix only accepts these (it sniffs file contents server-side too)
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Dispute evidence — the merchant's response to a chargeback. GET lists what's
 * been uploaded; POST uploads one file (pdf/jpg/png) straight through to Finix.
 * The dispute lives in Finix, not our DB, so ownership is checked against the
 * company's Finix identity/merchant before either direction.
 */
async function findOwnedDispute(
  disputeId: string,
  companyId: string
): Promise<FinixDispute | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { finixIdentityId: true, finixMerchantId: true },
  });
  if (!company?.finixIdentityId && !company?.finixMerchantId) return null;

  const dispute = await getDispute(disputeId).catch(() => null);
  if (!dispute) return null;
  const ours =
    (dispute.identity && dispute.identity === company.finixIdentityId) ||
    (dispute.merchant && dispute.merchant === company.finixMerchantId);
  return ours ? dispute : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const dispute = await findOwnedDispute(id, actor.companyId);
  if (!dispute) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  try {
    const evidence = await listDisputeEvidence(id);
    return NextResponse.json({
      evidence: evidence.map((e) => ({
        id: e.id,
        fileName: e.file_name ?? "file",
        state: e.state ?? "PENDING",
        createdAt: e.created_at ?? null,
      })),
    });
  } catch (err) {
    console.error("[payments] dispute evidence list failed", err);
    return NextResponse.json({ error: "Couldn't load evidence." }, { status: 502 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const dispute = await findOwnedDispute(id, actor.companyId);
  if (!dispute) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Use a PDF, JPG, or PNG — banks only accept those formats." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (8 MB max)." }, { status: 400 });
  }

  try {
    const uploaded = await uploadDisputeEvidence({
      disputeId: id,
      fileName: file.name.slice(0, 120) || "evidence",
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(
      {
        evidence: {
          id: uploaded.id,
          fileName: uploaded.file_name ?? file.name,
          state: uploaded.state ?? "PENDING",
          createdAt: uploaded.created_at ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[payments] dispute evidence upload failed", err);
    const message =
      err instanceof FinixError ? `Upload failed: ${err.message}` : "Upload failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
