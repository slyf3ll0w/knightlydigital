import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, jobScope, contactScope } from "@/lib/permissions";
import { recordLeadWin } from "@/lib/pipeline";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.job.findMany({
    where: { companyId: actor.companyId, ...jobScope(actor) },
    include: { contact: true, assignments: { include: { user: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Creating jobs is for managers + Sales/Tech combo; pure sales converts
  // quotes instead, pure techs only work assigned jobs.
  if (!isManager(actor.role) && actor.role !== "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = actor.companyId;

  const body = await req.json();
  const { contactId, requestId, title, description, scheduledAt, scheduledEnd, scheduledAnytime, address, leadSource } = body;
  // Optional up-front crew assignment — only users in this company count
  const assigneeIds: string[] = Array.isArray(body.assigneeIds)
    ? body.assigneeIds.filter((v: unknown): v is string => typeof v === "string")
    : [];

  if (!contactId || !title) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (requestId) {
    const request = await prisma.request.findFirst({ where: { id: requestId, companyId } });
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const validAssignees =
    assigneeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIds }, companyId, isActive: true },
          select: { id: true },
        })
      : [];

  const job = await prisma.$transaction(async (tx) => {
    const last = await tx.job.findFirst({
      where: { companyId },
      orderBy: { jobNumber: "desc" },
    });

    const created = await tx.job.create({
      data: {
        companyId,
        contactId,
        requestId: requestId || null,
        jobNumber: (last?.jobNumber ?? 0) + 1,
        title,
        description: description || null,
        leadSource: leadSource || contact.leadSource || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        scheduledAnytime: Boolean(scheduledAnytime),
        address: address || contact.address || null,
        ...(validAssignees.length > 0 && {
          assignments: { create: validAssignees.map((u) => ({ userId: u.id })) },
        }),
      },
    });

    if (requestId) {
      await tx.request.update({ where: { id: requestId }, data: { status: "CONVERTED" } });
    }

    // First real work closes the lead: active client, off the pipeline board
    // (repeat clients on the board leave it the same way)
    await recordLeadWin(tx, companyId, contact);

    return created;
  });

  return NextResponse.json(job, { status: 201 });
}
