import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

// Logs that a review-request text was handed off to the sender's Messages
// app (same free sms: pattern as on-my-way — see lib/messaging.ts). The
// ReviewRequest row also keeps the completed-job email automation from
// asking the same client twice.
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
    include: { contact: { select: { firstName: true, phone: true } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!job.contact.phone) {
    return NextResponse.json({ error: "This client has no phone number." }, { status: 400 });
  }

  await Promise.all([
    prisma.reviewRequest.create({
      data: {
        companyId: actor.companyId,
        contactId: job.contactId,
        jobId: id,
        phone: job.contact.phone,
        sentAt: new Date(),
        method: "sms",
      },
    }),
    prisma.jobNote.create({
      data: {
        jobId: id,
        userId: actor.id,
        body: `Sent ${job.contact.firstName} a review request text.`,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
