import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, jobScope } from "@/lib/permissions";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { autoAdvance } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";

/**
 * POST — turn a job that was really a sales visit (an estimate, a meeting,
 * a 1-on-1) into an appointment. Jobs end with Complete Job → invoice;
 * appointments end with an optional quote, which becomes the job only if
 * the client approves it. Same client, time, address, crew lead, and notes
 * carry over; the job row is deleted (its number is simply skipped, like a
 * deleted job).
 *
 * Only an untouched job qualifies: no invoice, quote, plan, line items,
 * clocked time, photos, or sign-off. Anything with real work on it stays a
 * job — the error names what's in the way.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Booking an appointment is a sales action; replacing the job is an edit
  const canEdit = isManager(actor.role) || actor.role === "USER";
  if (!canSell(actor.role) || !canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = actor.companyId;

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, companyId, ...jobScope(actor) },
    include: {
      contact: { select: { id: true, address: true } },
      assignments: { select: { userId: true } },
      notes: { select: { body: true }, orderBy: { createdAt: "asc" } },
      invoice: { select: { id: true } },
      quote: { select: { id: true } },
      _count: { select: { lineItems: true, timeEntries: true, photos: true } },
    },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const blockers: string[] = [];
  if (job.status !== "ACTIVE") blockers.push("it's already completed or closed");
  if (!job.scheduledAt) blockers.push("it isn't scheduled yet");
  if (job.invoice) blockers.push("it has an invoice");
  if (job.quote) blockers.push("it came from a quote");
  if (job.subscriptionId) blockers.push("it belongs to a recurring plan");
  if (job._count.lineItems > 0) blockers.push("it has line items");
  if (job._count.timeEntries > 0) blockers.push("time has been clocked on it");
  if (job._count.photos > 0) blockers.push("it has photos");
  if (job.completionSignedAt) blockers.push("it's been signed off");
  if (blockers.length > 0) {
    return NextResponse.json(
      { error: `This job can't become an appointment — ${blockers.join(", ")}.` },
      { status: 400 }
    );
  }

  // Somewhere to drive to = an in-person visit; otherwise it's a call
  const address = (job.address ?? job.contact.address)?.trim() || null;
  const type = address ? "IN_PERSON" : "PHONE_CALL";

  // The crew lead becomes the assignee (appointments take one person);
  // an unassigned job goes to whoever is converting it
  const lead = job.assignments[0]?.userId;
  const assignee = lead
    ? await prisma.user.findFirst({
        where: { id: lead, companyId, isActive: true },
        select: { id: true },
      })
    : null;
  const assignedToId = assignee?.id ?? actor.id;

  const notes = [job.description, ...job.notes.map((n) => n.body)]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);

  const scheduledAt = job.scheduledAt!;
  const scheduledEnd = job.scheduledAnytime
    ? null
    : (job.scheduledEnd ?? new Date(scheduledAt.getTime() + 60 * 60000));

  let appointment: { id: string };
  try {
    appointment = await withDocNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const last = await tx.appointment.findFirst({
          where: { companyId },
          orderBy: { appointmentNumber: "desc" },
          select: { appointmentNumber: true },
        });
        const created = await tx.appointment.create({
          data: {
            companyId,
            contactId: job.contactId,
            requestId: job.requestId,
            assignedToId,
            appointmentNumber: (last?.appointmentNumber ?? 0) + 1,
            title: job.title.slice(0, 120),
            type,
            scheduledAt,
            scheduledEnd,
            scheduledAnytime: job.scheduledAnytime,
            address: type === "IN_PERSON" ? address!.slice(0, 300) : null,
            propertyId: type === "IN_PERSON" ? job.propertyId : null,
            notes: notes || null,
            remindClient: job.remindClient,
            arrivalWindowMinutes: type === "IN_PERSON" ? job.arrivalWindowMinutes : null,
          },
          select: { id: true },
        });
        // Notes, assignments, and checklist rows cascade with the job
        await tx.job.delete({ where: { id: job.id } });
        return created;
      })
    );
  } catch (e) {
    console.error("[job → appointment] failed", { jobId: job.id, error: e });
    return NextResponse.json(
      { error: "Couldn't turn this job into an appointment. Please try again." },
      { status: 500 }
    );
  }

  // Pipeline board: booking an estimate/sales call advances the lead's card
  fireAutomations(companyId, "appointment.scheduled", appointment.id);
  await autoAdvance(prisma, companyId, job.contactId, "APPOINTMENT_SCHEDULED");

  return NextResponse.json({ id: appointment.id }, { status: 201 });
}
