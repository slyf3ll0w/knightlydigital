import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { sendEmail, reviewRequestEmail } from "@/lib/email";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Techs complete their assigned jobs; sales can't change job status
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const job = await prisma.job.findFirst({ where: { id, companyId, ...jobScope(actor) } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const extra: Record<string, Date | null> = {};
  if (status === "REQUIRES_INVOICING") extra.completedAt = new Date();
  if (status === "ARCHIVED") extra.closedAt = new Date();
  if (status === "ACTIVE") {
    extra.completedAt = null;
    extra.closedAt = null;
  }

  await prisma.job.update({ where: { id }, data: { status, ...extra } });

  // Completed job + configured Google review link → ask the client for a
  // review (once per job; silent no-op without RESEND_API_KEY)
  if (status === "REQUIRES_INVOICING") {
    const [company, contact, alreadySent] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, reviewLink: true },
      }),
      prisma.contact.findUnique({
        where: { id: job.contactId },
        select: { firstName: true, email: true },
      }),
      prisma.reviewRequest.findFirst({ where: { companyId, jobId: id } }),
    ]);
    if (company?.reviewLink && contact?.email && !alreadySent) {
      const { subject, html } = reviewRequestEmail({
        companyName: company.name,
        contactFirstName: contact.firstName,
        reviewLink: company.reviewLink,
        jobTitle: job.title,
      });
      await sendEmail({ to: contact.email, subject, html, fromName: company.name });
      await prisma.reviewRequest.create({
        data: {
          companyId,
          contactId: job.contactId,
          jobId: id,
          email: contact.email,
          sentAt: new Date(),
          method: "email",
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
