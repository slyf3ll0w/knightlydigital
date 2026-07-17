import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { enterPipeline } from "@/lib/pipeline";

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

  // customFields: merge sanitized values over what's stored (callers send
  // partial maps; an explicit empty string can't clear — send the full map
  // from the contact editor to overwrite)
  let customFieldsPatch: Record<string, string> | undefined;
  if (body.customFields !== undefined) {
    const existing = await prisma.contact.findFirst({
      where: { id, companyId: actor.companyId, ...contactScope(actor) },
      select: { customFields: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const defs = await getActiveFieldDefs(actor.companyId);
    const sanitized = sanitizeCustomFields(body.customFields, defs);
    const base =
      body.replaceCustomFields === true
        ? {}
        : ((existing.customFields as Record<string, string>) ?? {});
    customFieldsPatch = { ...base, ...sanitized };
  }

  // Each field updates independently — callers send only what they change
  // (AssignLead sends assignedToId alone, CustomFieldsCard sends customFields
  // alone, the edit form sends everything).
  if (body.firstName !== undefined && !String(body.firstName).trim()) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }
  if (body.lastName !== undefined && !String(body.lastName).trim()) {
    return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  }

  let status: "LEAD" | "ACTIVE" | "ARCHIVED" | undefined;
  if (body.status !== undefined) {
    if (!["LEAD", "ACTIVE", "ARCHIVED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    status = body.status;
  }

  let paymentTermsDays: number | undefined;
  if (body.paymentTermsDays !== undefined) {
    const n = Number(body.paymentTermsDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return NextResponse.json(
        { error: "Payment terms must be between 0 and 365 days." },
        { status: 400 }
      );
    }
    paymentTermsDays = n;
  }

  const opt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  // Status CHANGES keep the pipeline board consistent; an unchanged status
  // (edit forms send it either way) must not move the card — a repeat client
  // on the board stays put when their profile is edited.
  let statusChange: "LEAD" | "ACTIVE" | "ARCHIVED" | undefined;
  if (status !== undefined) {
    const current = await prisma.contact.findFirst({
      where: { id, companyId: actor.companyId, ...contactScope(actor) },
      select: { status: true },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.status !== status) statusChange = status;
  }

  const contact = await prisma.contact.updateMany({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    data: {
      ...(customFieldsPatch !== undefined && { customFields: customFieldsPatch }),
      ...(body.firstName !== undefined && { firstName: String(body.firstName).trim() }),
      ...(body.lastName !== undefined && { lastName: String(body.lastName).trim() }),
      ...(body.companyName !== undefined && { companyName: opt(body.companyName) }),
      ...(body.email !== undefined && { email: opt(body.email) }),
      ...(body.phone !== undefined && { phone: opt(body.phone) }),
      ...(body.address !== undefined && { address: opt(body.address) }),
      ...(body.city !== undefined && { city: opt(body.city) }),
      ...(body.state !== undefined && { state: opt(body.state) }),
      ...(body.zip !== undefined && { zip: opt(body.zip) }),
      ...(body.notes !== undefined && { notes: opt(body.notes) }),
      ...(body.leadSource !== undefined && { leadSource: opt(body.leadSource) }),
      ...(status !== undefined && { status }),
      ...(paymentTermsDays !== undefined && { paymentTermsDays }),
      // Leaving LEAD takes the card off the board (becoming LEAD re-enters below)
      ...(statusChange === "ACTIVE" || statusChange === "ARCHIVED"
        ? { pipelineStageId: null, stageChangedAt: null }
        : {}),
      ...assignment,
    },
  });

  if (contact.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (statusChange === "LEAD") {
    await enterPipeline(prisma, actor.companyId, id);
  }

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
          subscriptions: true, appointments: true,
        },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = contact._count;
  const hasWork =
    c.quotes > 0 || c.jobs > 0 || c.invoices > 0 || c.payments > 0 ||
    c.subscriptions > 0 || c.appointments > 0;

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
      // payments have no DB cascade — catch any on their invoices that
      // were recorded without a contact link
      await tx.payment.deleteMany({ where: { invoice: { contactId: id, companyId } } });
      await tx.invoice.deleteMany({ where: { contactId: id, companyId } });
      // contracts reference quotes (agreement gate), so they go before quotes
      await tx.contract.deleteMany({ where: { contactId: id, companyId } });
      await tx.quote.deleteMany({ where: { contactId: id, companyId } });
      await tx.job.deleteMany({ where: { contactId: id, companyId } });
      // jobs/invoices reference subscriptions, so those went first
      await tx.subscription.deleteMany({ where: { contactId: id, companyId } });
      await tx.appointment.deleteMany({ where: { contactId: id, companyId } });
      await tx.request.deleteMany({ where: { contactId: id, companyId } });
      await tx.bookingRequest.deleteMany({ where: { contactId: id, companyId } });
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
