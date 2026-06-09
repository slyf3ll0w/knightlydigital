import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = await req.json();

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  if (quote.status !== "SENT") {
    return NextResponse.json({ error: "Quote is not in a reviewable state." }, { status: 400 });
  }

  await prisma.quote.update({
    where: { id },
    data: {
      status: action === "accept" ? "ACCEPTED" : "DECLINED",
      ...(action === "accept" && { acceptedAt: new Date() }),
    },
  });

  return NextResponse.json({ success: true });
}
