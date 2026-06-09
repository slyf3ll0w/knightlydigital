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

  const validStatuses = ["LEAD", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "INVOICED", "PAID"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const extra: Record<string, Date | null> = {};
  if (status === "COMPLETE") extra.completedAt = new Date();
  if (status !== "COMPLETE") extra.completedAt = null;

  await prisma.job.updateMany({
    where: { id, companyId },
    data: { status, ...extra },
  });

  return NextResponse.json({ success: true });
}
