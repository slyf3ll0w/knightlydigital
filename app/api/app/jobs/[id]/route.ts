import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, jobScope } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // Techs may move their own jobs around the schedule but not rewrite them
  const fullEdit = isManager(actor.role) || actor.role === "USER";

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  const updated = await prisma.job.updateMany({
    where: { id, companyId: actor.companyId, ...jobScope(actor) },
    data: {
      ...(fullEdit && {
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status && validStatuses.includes(body.status) && { status: body.status }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.leadSource !== undefined && { leadSource: body.leadSource || null }),
      }),
      ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }),
      ...(body.scheduledEnd !== undefined && { scheduledEnd: body.scheduledEnd ? new Date(body.scheduledEnd) : null }),
      ...(body.scheduledAnytime !== undefined && { scheduledAnytime: Boolean(body.scheduledAnytime) }),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Replace team assignments (managers + Sales/Tech combo only)
  if (fullEdit && Array.isArray(body.assigneeIds)) {
    const users = await prisma.user.findMany({
      where: { id: { in: body.assigneeIds }, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.jobAssignment.deleteMany({ where: { jobId: id } }),
      prisma.jobAssignment.createMany({
        data: users.map((u) => ({ jobId: id, userId: u.id })),
      }),
    ]);
  }

  return NextResponse.json({ success: true });
}
