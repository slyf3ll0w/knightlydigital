import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

// Logs that an "on my way" text was handed off to the sender's Messages app —
// stamps the job and drops a line in Notes & Activity so the office can see it.
// The text itself goes out from the tech's own phone (see lib/messaging.ts).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, companyId: actor.companyId, ...jobScope(actor) },
    include: { contact: { select: { firstName: true } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const sentAt = new Date();
  await Promise.all([
    prisma.job.update({ where: { id }, data: { onMyWaySentAt: sentAt } }),
    prisma.jobNote.create({
      data: {
        jobId: id,
        userId: actor.id,
        body: `Sent ${job.contact.firstName} an "on my way" text.`,
      },
    }),
  ]);

  return NextResponse.json({ success: true, sentAt: sentAt.toISOString() });
}
