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

  const valid = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"];
  if (!valid.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  await prisma.invoice.updateMany({
    where: { id, companyId },
    data: {
      status,
      ...(status === "PAID" && { paidAt: new Date() }),
    },
  });

  return NextResponse.json({ success: true });
}
