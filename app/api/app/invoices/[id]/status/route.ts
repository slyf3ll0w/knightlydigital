import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["DRAFT", "AWAITING_PAYMENT", "PAID", "PAST_DUE"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
  });
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
