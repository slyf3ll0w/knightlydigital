import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST — client signs a contract with a typed signature (same e-sign
 * approach as quote approval: typed name + timestamp + IP).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const signatureName =
    typeof body.signatureName === "string" ? body.signatureName.trim().slice(0, 120) : "";
  if (signatureName.length < 2) {
    return NextResponse.json({ error: "Type your full name to sign." }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({ where: { publicToken: token } });
  if (!contract || contract.status === "VOID") {
    return NextResponse.json({ error: "This contract is no longer available." }, { status: 404 });
  }
  if (contract.status === "SIGNED") {
    return NextResponse.json({ error: "This contract has already been signed." }, { status: 400 });
  }

  // Cloudflare sits in front — cf-connecting-ip is the real client
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "SIGNED", signatureName, signedAt: new Date(), signedFromIp: ip },
  });

  return NextResponse.json({ success: true });
}
