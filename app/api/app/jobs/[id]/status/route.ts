import { NextRequest, NextResponse } from "next/server";
import { fireAutomations } from "@/lib/automations-server";
import { prisma } from "@/lib/db";
import { canSeeMoney, getActor, isManager, jobScope } from "@/lib/permissions";
import { sendReviewRequest } from "@/lib/payments";
import { syncJobChecklist, countOpenChecklistItems } from "@/lib/job-checklist";
import { billCompletedVisit } from "@/lib/subscriptions";
import { autoCloseAt, formatDuration } from "@/lib/time-entries";

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

  const job = await prisma.job.findFirst({
    where: { id, companyId, ...jobScope(actor) },
    include: { invoice: { select: { id: true } }, subscription: { select: { interval: true, billPerVisit: true } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // "Close without invoicing" is a money decision: a job nothing bills for
  // (no invoice, not covered by a plan's cycle invoice) can only be closed
  // by someone who sees money. A tech completes it instead — that parks it
  // in Requires Invoicing where the office still bills it.
  if (status === "ARCHIVED" && job.status !== "ARCHIVED" && !canSeeMoney(actor)) {
    const coveredByPlan = Boolean(job.subscription?.interval && !job.subscription.billPerVisit);
    if (!job.invoice && !coveredByPlan) {
      return NextResponse.json(
        { error: "Closing a job without an invoice is up to the office — mark it complete instead." },
        { status: 403 }
      );
    }
  }

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

  // Plan-billed recurring work (interval billing, not per-visit) is covered by
  // the plan's cycle invoice — completing such a job closes it out directly.
  // Parking it in "Requires invoicing" would count it in the invoicing queue
  // and invite a second, manual invoice for work the plan already bills.
  let effectiveStatus = status;
  let planBilled = false;
  if (status === "REQUIRES_INVOICING" && job.subscriptionId) {
    const sub = await prisma.subscription.findUnique({
      where: { id: job.subscriptionId },
      select: { interval: true, billPerVisit: true },
    });
    if (sub?.interval && !sub.billPerVisit) {
      effectiveStatus = "ARCHIVED";
      planBilled = true;
    }
  }

  // Stamp only on a real transition — a replayed/queued PATCH of the status
  // the job already has must not move completedAt/closedAt. completedAt keys
  // off the REQUESTED completion, so a plan-billed visit that closes straight
  // to ARCHIVED still records when the work was done.
  const extra: Record<string, Date | null> = {};
  if (status === "REQUIRES_INVOICING" && job.status !== "REQUIRES_INVOICING")
    extra.completedAt = new Date();
  if (effectiveStatus === "ARCHIVED" && job.status !== "ARCHIVED") extra.closedAt = new Date();
  if (effectiveStatus === "ACTIVE" && job.status !== "ACTIVE") {
    extra.completedAt = null;
    extra.closedAt = null;
  }

  await prisma.job.update({ where: { id }, data: { status: effectiveStatus, ...extra } });
  if (status === "REQUIRES_INVOICING" && job.status !== "REQUIRES_INVOICING") fireAutomations(actor.companyId, "job.completed", id);

  // Finishing the job clocks the tech out of it. Left open, the entry would
  // run until their NEXT clock-in — sometimes the following morning — and
  // labor cost would carry a 16-hour "visit". A manager closing the job
  // clocks out everyone still on it; a tech only closes their own entry.
  // Dispatchers (USER) close jobs from the office too — they clock out
  // everyone on it, like a manager; a tech only closes their own entry.
  const closesForEveryone = isManager(actor.role) || actor.role === "USER";
  if (
    job.status !== effectiveStatus &&
    (effectiveStatus === "REQUIRES_INVOICING" || effectiveStatus === "ARCHIVED")
  ) {
    const closingAt = new Date();
    const open = await prisma.timeEntry.findMany({
      where: { jobId: id, endedAt: null, ...(closesForEveryone ? {} : { userId: actor.id }) },
      select: { id: true, userId: true, startedAt: true },
    });
    for (const e of open) {
      const endedAt = autoCloseAt(e.startedAt, closingAt);
      await prisma.$transaction([
        prisma.timeEntry.update({ where: { id: e.id }, data: { endedAt } }),
        prisma.jobNote.create({
          data: {
            jobId: id,
            userId: e.userId,
            body: `Clocked out — ${formatDuration(endedAt.getTime() - e.startedAt.getTime())} (job ${status === "ARCHIVED" ? "closed" : "completed"}).`,
          },
        }),
      ]);
    }
  }

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

  return NextResponse.json({ success: true, visitBilling, planBilled });
}
