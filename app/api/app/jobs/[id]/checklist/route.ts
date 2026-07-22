import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

// Check off / skip / reopen a single close-out checklist item. Same access
// as the status route: techs work their assigned jobs, sales stay out.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const body = await req.json();
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  const action = body.action;
  if (!itemId || !["done", "skip", "reopen"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const job = await prisma.job.findFirst({
    where: { id, companyId, ...jobScope(actor) },
    select: { id: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.status === "ARCHIVED") {
    return NextResponse.json({ error: "This job is closed." }, { status: 400 });
  }

  const item = await prisma.jobChecklistItem.findFirst({ where: { id: itemId, jobId: id } });
  if (!item) return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });

  if (action === "skip") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) {
      return NextResponse.json(
        { error: "A reason is required to skip a checklist item." },
        { status: 400 }
      );
    }
    await prisma.jobChecklistItem.update({
      where: { id: itemId },
      data: { skipReason: reason, doneAt: null, doneById: actor.id },
    });
  } else if (action === "done") {
    await prisma.jobChecklistItem.update({
      where: { id: itemId },
      data: { doneAt: new Date(), doneById: actor.id, skipReason: null },
    });
  } else {
    await prisma.jobChecklistItem.update({
      where: { id: itemId },
      data: { doneAt: null, doneById: null, skipReason: null },
    });
  }

  return NextResponse.json({ success: true });
}
