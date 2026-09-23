import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { quotePdf, pdfResponse } from "@/lib/pdf";

/** GET — download this quote as a branded PDF (staff side). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A quote is a seller document with full pricing — techs never see prices
  // (the quote pages need canSell too; the PDF must not be a back door).
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const scope = viaContactScope(actor);
  const pdf = await quotePdf({ id, companyId: actor.companyId, ...scope });
  if (!pdf) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  return pdfResponse(pdf);
}
