import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { sendReviewRequest } from "@/lib/payments";
import { syncJobChecklist, countOpenChecklistItems } from "@/lib/job-checklist";
import { billCompletedVisit } from "@/lib/subscriptions";

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

  // Close-out gate: an ACTIVE job can't complete or close while its service
  // checklist has tasks that are neither checked off nor given a skip reason.
  // Sync first so the gate holds even if the job page was never opened.
  if (job.status === "ACTIVE" && (status === "REQUIRES_INVOICING" || status === "ARCHIVED")) {
    await syncJobChecklist(id, companyId);
    const open = await countOpenChecklistItems(id);
    if (open > 0) {
      return NextResponse.json(
        {
          error: `${open} checklist ${open === 1 ? "task" : "tasks"} still need${open === 1 ? "s" : ""} to be checked off (or given a reason it wasn't done) before this job can be closed out.`,
        },
        { status: 400 }
      );
    }
  }

  // Stamp only on a real transition — a replayed/queued PATCH of the status
  // the job already has must not move completedAt/closedAt.
  const extra: Record<string, Date | null> = {};
  if (status === "REQUIRES_INVOICING" && job.status !== "REQUIRES_INVOICING")
    extra.completedAt = new Date();
  if (status === "ARCHIVED" && job.status !== "ARCHIVED") extra.closedAt = new Date();
  if (status === "ACTIVE" && job.status !== "ACTIVE") {
    extra.completedAt = null;
    extra.closedAt = null;
  }

  await prisma.job.update({ where: { id }, data: { status, ...extra } });

  // Per-visit billed series: completing the visit mints (and sends/charges)
  // its invoice, then archives the job. A billing failure never blocks the
  // status change — the job just stays in Requires Invoicing for manual
  // handling. Real-transition guard matches the completedAt stamp above.
  let visitBilling: "charged" | "billed" | "drafted" | null = null;
  if (status === "REQUIRES_INVOICING" && job.status !== "REQUIRES_INVOICING" && job.subscriptionId) {
    visitBilling = await billCompletedVisit(id, companyId).catch((e) => {
      console.error("[jobs] per-visit billing failed for", id, e);
      return null;
    });
  }

  // Completed job + configured review link → ask the client for a review.
  // sendReviewRequest owns the dedupe (once per job), so the same client
  // paying that job's invoice later doesn't get asked a second time.
  if (status === "REQUIRES_INVOICING") {
    const contact = await prisma.contact.findUnique({
      where: { id: job.contactId },
      select: { firstName: true, email: true },
    });
    if (contact?.email) {
      await sendReviewRequest({
        companyId,
        contactId: job.contactId,
        jobId: id,
        email: contact.email,
        contactFirstName: contact.firstName,
        jobTitle: job.title,
      }).catch((e) => console.error("[jobs] review request failed", e));
    }
  }

  return NextResponse.json({ success: true, visitBilling });
}
