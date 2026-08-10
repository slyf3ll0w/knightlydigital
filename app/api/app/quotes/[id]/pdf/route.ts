import { NextRequest, NextResponse } from "next/server";
import { getActor, viaContactScope } from "@/lib/permissions";
import { quotePdf, pdfResponse } from "@/lib/pdf";

/** GET — download this quote as a branded PDF (staff side). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const scope = viaContactScope(actor);
  const pdf = await quotePdf({ id, companyId: actor.companyId, ...scope });
  if (!pdf) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  return pdfResponse(pdf);
}
