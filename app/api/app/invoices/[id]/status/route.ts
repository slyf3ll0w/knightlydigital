import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["DRAFT", "AWAITING_PAYMENT", "PAID", "PAST_DUE"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({ where: { id, companyId } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  await prisma.invoice.update({
    where: { id },
    data: {
      status,
      ...(status === "AWAITING_PAYMENT" && !invoice.issuedAt && { issuedAt: new Date() }),
      ...(status === "PAID" ? { paidAt: new Date() } : { paidAt: null }),
    },
  });

  return NextResponse.json({ success: true });
}
