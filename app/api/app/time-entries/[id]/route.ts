import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

const MAX_ENTRY_MS = 24 * 3600_000;

/**
 * Manager-only edit of a time entry — fix a forgotten clock-out, adjust a
 * span, or reattach it to a job. Edits are stamped with editedById for the
 * payroll audit trail; the CLOCK source is kept so you can still tell a live
 * clock from a hand-typed entry.
 * Body (all optional): { startedAt, endedAt, jobId, note }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const entry = await prisma.timeEntry.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = { editedById: actor.id };

  let startedAt = entry.startedAt;
  let endedAt = entry.endedAt;
  if (body.startedAt !== undefined) {
    startedAt = new Date(body.startedAt ?? NaN);
    if (Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    }
    data.startedAt = startedAt;
  }
  if (body.endedAt !== undefined) {
    if (body.endedAt === null) {
      endedAt = null; // reopen (rare — undo an accidental clock-out)
      data.endedAt = null;
    } else {
      endedAt = new Date(body.endedAt);
      if (Number.isNaN(endedAt.getTime())) {
        return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
      }
      data.endedAt = endedAt;
    }
  }
  if (endedAt) {
    if (endedAt <= startedAt) {
      return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
    }
    if (endedAt.getTime() - startedAt.getTime() > MAX_ENTRY_MS) {
      return NextResponse.json({ error: "An entry can't be longer than 24 hours." }, { status: 400 });
    }
  }

  if (body.jobId !== undefined) {
    if (body.jobId === null) {
      data.jobId = null;
    } else {
      const job = await prisma.job.findFirst({
        where: { id: String(body.jobId), companyId: actor.companyId },
        select: { id: true },
      });
      if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
      data.jobId = job.id;
    }
  }
  if (body.note !== undefined) {
    data.note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  }

  await prisma.timeEntry.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const entry = await prisma.timeEntry.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  await prisma.timeEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
