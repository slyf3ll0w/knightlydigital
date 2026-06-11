import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Techs complete their assigned jobs; sales can't change job status
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const job = await prisma.job.findFirst({ where: { id, companyId, ...jobScope(actor) } });
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
