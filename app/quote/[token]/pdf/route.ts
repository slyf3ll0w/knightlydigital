import { NextRequest, NextResponse } from "next/server";
import { quotePdf, pdfResponse } from "@/lib/pdf";

/**
 * GET — the client-facing PDF of a quote. The public token is the credential,
 * same trust model as the /quote/[token] approval page this sits under.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const pdf = await quotePdf({ publicToken: token });
  if (!pdf) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return pdfResponse(pdf);
}
