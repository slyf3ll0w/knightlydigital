import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { statementPdf, pdfResponse } from "@/lib/pdf";

/** GET — download this client's statement (open invoices + total due) as PDF. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const pdf = await statementPdf(id, actor.companyId);
  if (!pdf) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return pdfResponse(pdf);
}
