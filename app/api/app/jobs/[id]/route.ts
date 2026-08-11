import { NextRequest, NextResponse } from "next/server";
import type { RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, isManager, jobScope } from "@/lib/permissions";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";

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
    select: { id: true, contactId: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Saved service address link: "" clears it, an id must be one of this
  // contact's saved addresses (else the link is silently dropped)
  let propertyPatch: { propertyId: string | null } | null = null;
  if (fullEdit && body.propertyId !== undefined) {
    if (typeof body.propertyId === "string" && body.propertyId) {
      const property = await prisma.contactAddress.findFirst({
        where: { id: body.propertyId, contactId: job.contactId },
        select: { id: true },
      });
      propertyPatch = { propertyId: property?.id ?? null };
    } else {
      propertyPatch = { propertyId: null };
    }
  }

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  const data = {
    ...(fullEdit && {
      ...(body.title && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status && validStatuses.includes(body.status) && { status: body.status }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.leadSource !== undefined && { leadSource: body.leadSource || null }),
      ...(propertyPatch ?? {}),
    }),
    ...(body.scheduledAt !== undefined && {
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      // A moved visit reminds again at its new time (stamps are per-schedule)
      reminderDaySentAt: null,
      reminderHourSentAt: null,
    }),
    ...(body.scheduledEnd !== undefined && { scheduledEnd: body.scheduledEnd ? new Date(body.scheduledEnd) : null }),
    ...(body.scheduledAnytime !== undefined && { scheduledAnytime: Boolean(body.scheduledAnytime) }),
    // Arrival window override: null = company default, 0 = exact time
    ...(body.arrivalWindowMinutes !== undefined && {
      arrivalWindowMinutes:
        body.arrivalWindowMinutes === null
          ? null
          : Number.isInteger(Number(body.arrivalWindowMinutes)) &&
              Number(body.arrivalWindowMinutes) >= 0 &&
              Number(body.arrivalWindowMinutes) <= 480
            ? Number(body.arrivalWindowMinutes)
            : undefined,
    }),
    ...(body.remindClient !== undefined && { remindClient: Boolean(body.remindClient) }),
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

  // Non-blocking double-booking check when the schedule (or crew) changed —
  // the save already happened; the UI shows these as a heads-up.
  let conflicts: string[] = [];
  if (
    body.scheduledAt !== undefined ||
    body.scheduledEnd !== undefined ||
    Array.isArray(body.assigneeIds)
  ) {
    const fresh = await prisma.job.findUnique({
      where: { id: job.id },
      select: {
        scheduledAt: true,
        scheduledEnd: true,
        scheduledAnytime: true,
        assignments: { select: { userId: true } },
      },
    });
    if (fresh?.scheduledAt && !fresh.scheduledAnytime) {
      conflicts = await findScheduleConflicts({
        companyId: actor.companyId,
        start: fresh.scheduledAt,
        end: fresh.scheduledEnd ?? new Date(fresh.scheduledAt.getTime() + 3600_000),
        userIds: fresh.assignments.map((a) => a.userId),
        excludeJobId: job.id,
      }).catch(() => []);
    }
  }

  return NextResponse.json({ success: true, conflicts });
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
