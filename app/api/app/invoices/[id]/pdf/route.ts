import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { invoicePdf, pdfResponse } from "@/lib/pdf";

/** GET — download this invoice as a branded PDF (staff side). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const pdf = await invoicePdf({ id, companyId: actor.companyId, ...viaContactScope(actor) });
  if (!pdf) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  return pdfResponse(pdf);
}
