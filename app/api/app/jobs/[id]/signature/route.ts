import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

/**
 * POST — record the client's on-site completion sign-off. The client types
 * their name on the tech's phone (same typed-signature convention as quote
 * approval). One signature per job; proof-of-completion for disputes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const signatureName = typeof body?.signatureName === "string" ? body.signatureName.trim() : "";
  if (!signatureName || signatureName.length > 120) {
    return NextResponse.json({ error: "Ask the client to type their full name." }, { status: 400 });
  }

  const job = await prisma.job.findFirst({
    where: { id, companyId: actor.companyId, ...jobScope(actor) },
    select: { id: true, status: true, completionSignedAt: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.completionSignedAt) {
    return NextResponse.json({ error: "This job is already signed off." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { completionSignatureName: signatureName, completionSignedAt: new Date() },
    }),
    prisma.jobNote.create({
      data: {
        jobId: job.id,
        userId: actor.id,
        body: `Client signed off on completion — "${signatureName}".`,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
