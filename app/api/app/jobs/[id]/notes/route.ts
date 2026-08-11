import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = actor.companyId;
  const userId = actor.id;

  const { id: jobId } = await params;
  const { body, clientKey: rawKey } = await req.json();

  if (!body?.trim()) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });

  const job = await prisma.job.findFirst({ where: { id: jobId, companyId, ...jobScope(actor) } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // Same idempotency convention as the clock route: a queued/retried post
  // with the same key returns the note it already created.
  const clientKey =
    typeof rawKey === "string" && rawKey.length > 0 && rawKey.length <= 64
      ? `${userId}:${rawKey}`
      : null;
  if (clientKey) {
    const existing = await prisma.jobNote.findUnique({ where: { clientKey } });
    if (existing && existing.userId === userId) {
      return NextResponse.json(existing, { status: 200 });
    }
  }

  const note = await prisma.jobNote.create({
    data: { jobId, userId, body: body.trim(), clientKey },
  });

  return NextResponse.json(note, { status: 201 });
}
