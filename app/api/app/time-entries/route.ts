import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

const MAX_ENTRY_MS = 24 * 3600_000; // a single span longer than a day is a typo

/**
 * Manager-only manual time entry (paper timesheet, forgotten clock-in).
 * Body: { userId, jobId?, startedAt, endedAt, note? }
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const startedAt = new Date(body.startedAt ?? NaN);
  const endedAt = new Date(body.endedAt ?? NaN);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return NextResponse.json({ error: "Start and end times are required." }, { status: 400 });
  }
  if (endedAt <= startedAt) {
    return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
  }
  if (endedAt.getTime() - startedAt.getTime() > MAX_ENTRY_MS) {
    return NextResponse.json({ error: "An entry can't be longer than 24 hours." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id: String(body.userId ?? ""), companyId: actor.companyId },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

  let jobId: string | null = null;
  if (body.jobId) {
    const job = await prisma.job.findFirst({
      where: { id: String(body.jobId), companyId: actor.companyId },
      select: { id: true },
    });
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
    jobId = job.id;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      companyId: actor.companyId,
      userId: user.id,
      jobId,
      startedAt,
      endedAt,
      source: "MANUAL",
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null,
      editedById: actor.id,
    },
  });
  return NextResponse.json({ success: true, id: entry.id });
}
