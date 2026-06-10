import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const allowedStatuses = [
  "DRAFT",
  "AWAITING_RESPONSE",
  "APPROVED",
  "CHANGES_REQUESTED",
  "ARCHIVED",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quote = await prisma.quote.findFirst({ where: { id, companyId } });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  const body = await req.json();

  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.status === "AWAITING_RESPONSE" && !quote.sentAt && { sentAt: new Date() }),
      ...(body.status === "APPROVED" && { approvedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quote = await prisma.quote.findFirst({ where: { id, companyId } });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.status === "CONVERTED") {
    return NextResponse.json({ error: "Converted quotes can't be deleted." }, { status: 400 });
  }

  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
