import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Serve an uploaded company logo. Public — logos appear on client-facing
 * pages (quotes, invoices, hub, booking forms). Cache-busted by the ?v=
 * query param baked into logoUrl at upload time.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { logoData: true, logoMime: true },
  });

  if (!company?.logoData || !company.logoMime) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Buffer.from(company.logoData), {
    headers: {
      "Content-Type": company.logoMime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
