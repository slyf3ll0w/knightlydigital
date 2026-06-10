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

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const job = await prisma.job.findFirst({ where: { id, companyId } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const extra: Record<string, Date | null> = {};
  if (status === "REQUIRES_INVOICING") extra.completedAt = new Date();
  if (status === "ARCHIVED") extra.closedAt = new Date();
  if (status === "ACTIVE") {
    extra.completedAt = null;
    extra.closedAt = null;
  }

  await prisma.job.update({ where: { id }, data: { status, ...extra } });

  return NextResponse.json({ success: true });
}
