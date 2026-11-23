import { NextRequest, NextResponse } from "next/server";
import { invoicePdf, pdfResponse } from "@/lib/pdf";
import { publicInvoiceWithholdsClient } from "@/lib/public-doc-privacy";

/**
 * GET — the client-facing PDF of an invoice. The public token is the
 * credential, same trust model as the /pay/[token] page this sits under.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const pdf = await invoicePdf({ publicToken: token }, { hideClient: await publicInvoiceWithholdsClient(token) });
  if (!pdf) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return pdfResponse(pdf);
}
