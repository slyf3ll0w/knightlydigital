import { NextRequest, NextResponse } from "next/server";
import type { RecurringInterval } from "@prisma/client";
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

  const job = await prisma.job.findFirst({
    where: { id, companyId: actor.companyId, ...jobScope(actor) },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  const data = {
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
  };
  // updateMany with an empty data object touches no rows — skip it when the
  // request only changes assignments
  if (Object.keys(data).length > 0) {
    await prisma.job.update({ where: { id: job.id }, data });
  }

  // Full-replace line items (quote-editor pattern). Unlike invoices, an empty
  // list is valid — jobs created directly often have no line items at all.
  if (fullEdit && Array.isArray(body.lineItems)) {
    const lineItems = (body.lineItems as {
      name?: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      unitCost?: number | null;
      recurringInterval?: RecurringInterval | null;
      sortOrder?: number;
    }[]).filter((li) => (li.name ?? "").trim());

    await prisma.$transaction([
      prisma.jobLineItem.deleteMany({ where: { jobId: job.id } }),
      prisma.jobLineItem.createMany({
        data: lineItems.map((li, i) => ({
          jobId: job.id,
          name: li.name!.trim(),
          description: li.description || null,
          quantity: li.quantity || 1,
          unitPrice: li.unitPrice || 0,
          unitCost: li.unitCost ?? null,
          total: (li.quantity || 1) * (li.unitPrice || 0),
          recurringInterval: li.recurringInterval ?? null,
          sortOrder: li.sortOrder ?? i,
        })),
      }),
    ]);
  }

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

/**
 * DELETE — permanently remove a job (managers only; for test entries and
 * mistakes). Assignments, notes, photos, and line items cascade. Money and
 * client documents never vanish implicitly: a linked invoice survives with
 * its job link cleared, and a converted quote reopens as APPROVED so it can
 * be converted again.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await prisma.$transaction([
      prisma.invoice.updateMany({ where: { jobId: job.id }, data: { jobId: null } }),
      prisma.quote.updateMany({
        where: { jobId: job.id },
        data: { jobId: null, status: "APPROVED" },
      }),
      prisma.job.delete({ where: { id: job.id } }),
    ]);
  } catch (e) {
    console.error("[job delete] failed", { jobId: job.id, error: e });
    return NextResponse.json(
      { error: "Couldn't delete this job. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
