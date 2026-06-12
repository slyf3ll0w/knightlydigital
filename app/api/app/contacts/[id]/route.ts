import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // Reassigning a lead is a manager action
  let assignment: { assignedToId: string | null } | undefined;
  if (isManager(actor.role) && body.assignedToId !== undefined) {
    if (body.assignedToId === null || body.assignedToId === "") {
      assignment = { assignedToId: null };
    } else {
      const target = await prisma.user.findFirst({
        where: { id: body.assignedToId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 400 });
      assignment = { assignedToId: target.id };
    }
  }

  const contact = await prisma.contact.updateMany({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    data: {
      ...(body.firstName !== undefined && {
        firstName: body.firstName,
        lastName: body.lastName,
        companyName: body.companyName || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        notes: body.notes || null,
      }),
      ...assignment,
    },
  });

  if (contact.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

/**
 * DELETE — permanently remove a contact.
 *
 * Default: spam/marketer cleanup — refused when the contact has any real
 * work; their requests and booking submissions go with them.
 *
 * ?force=1: full wipe (test clients, irrelevant records) — destroys the
 * client AND all their quotes, jobs, invoices, payment records,
 * appointments, requests, and plans. The UI requires typing the client's
 * name before sending this.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const companyId = actor.companyId;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const contact = await prisma.contact.findFirst({
    where: { id, companyId },
    include: {
      _count: {
        select: {
          quotes: true, jobs: true, invoices: true, payments: true,
          servicePlans: true, appointments: true,
        },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = contact._count;
  const hasWork =
    c.quotes > 0 || c.jobs > 0 || c.invoices > 0 || c.payments > 0 ||
    c.servicePlans > 0 || c.appointments > 0;

  if (hasWork && !force) {
    return NextResponse.json(
      { error: "This client has quotes, jobs, or billing history — archive them instead." },
      { status: 400 }
    );
  }

  // FK-safe order: quotes/invoices/appointments reference jobs/requests, so
  // they go first; line items, payments, assignments etc. cascade. Records
  // belonging to OTHER clients can reference this client's requests/jobs
  // (a request converted into someone else's quote/job) — detach those
  // first or the FK check kills the whole wipe.
  try {
    await prisma.$transaction(async (tx) => {
      const [requests, jobs] = await Promise.all([
        tx.request.findMany({ where: { contactId: id, companyId }, select: { id: true } }),
        tx.job.findMany({ where: { contactId: id, companyId }, select: { id: true } }),
      ]);
      const reqIds = requests.map((r) => r.id);
      const jobIds = jobs.map((j) => j.id);

      if (jobIds.length > 0) {
        await tx.invoice.updateMany({
          where: { jobId: { in: jobIds }, NOT: { contactId: id } },
          data: { jobId: null },
        });
        await tx.quote.updateMany({
          where: { jobId: { in: jobIds }, NOT: { contactId: id } },
          data: { jobId: null },
        });
      }
      if (reqIds.length > 0) {
        await tx.job.updateMany({
          where: { requestId: { in: reqIds }, NOT: { contactId: id } },
          data: { requestId: null },
        });
        await tx.quote.updateMany({
          where: { requestId: { in: reqIds }, NOT: { contactId: id } },
          data: { requestId: null },
        });
        await tx.appointment.updateMany({
          where: { requestId: { in: reqIds }, NOT: { contactId: id } },
          data: { requestId: null },
        });
      }

      await tx.payment.deleteMany({ where: { contactId: id, companyId } });
      await tx.invoice.deleteMany({ where: { contactId: id, companyId } });
      await tx.quote.deleteMany({ where: { contactId: id, companyId } });
      await tx.job.deleteMany({ where: { contactId: id, companyId } });
      await tx.appointment.deleteMany({ where: { contactId: id, companyId } });
      await tx.request.deleteMany({ where: { contactId: id, companyId } });
      await tx.bookingRequest.deleteMany({ where: { contactId: id, companyId } });
      await tx.servicePlan.deleteMany({ where: { contactId: id, companyId } });
      await tx.reviewRequest.deleteMany({ where: { contactId: id, companyId } });
      await tx.contact.delete({ where: { id } });
    });
  } catch (e) {
    console.error("[contact force-delete] failed", { contactId: id, error: e });
    return NextResponse.json(
      { error: "Couldn't delete this client — some of their records are linked in an unexpected way. Please try again or contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
