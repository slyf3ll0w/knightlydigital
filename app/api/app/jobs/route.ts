import { NextRequest, NextResponse } from "next/server";
import type { RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSell, jobScope, contactScope } from "@/lib/permissions";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";
import { recordLeadWin } from "@/lib/pipeline";
import { ensureSubscriptionsForContact } from "@/lib/subscriptions";
import { syncJobChecklist } from "@/lib/job-checklist";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Whitelisted relations: `include: { user: true }` shipped every assignee's
  // full row (legacy passwordHash, hourlyCost — the pricing-gated field — and
  // avatar bytes) and `contact: true` shipped hubToken/processor refs to every
  // role that can list jobs. Nothing display-worthy needs more than this.
  const jobs = await prisma.job.findMany({
    where: { companyId: actor.companyId, ...jobScope(actor) },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          status: true,
        },
      },
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, role: true, isActive: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // One rule for creating jobs everywhere: anyone who can sell (owners,
  // admins, sales, sales/tech combo) — matching quote conversion, which
  // creates the same entity. Pure techs only work assigned jobs.
  if (!canSell(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (await inPreview(actor.companyId)) {
    const n = await prisma.job.count({ where: { companyId: actor.companyId } });
    if (n >= PREVIEW_CAP) return NextResponse.json(previewCapError("jobs"), { status: 403 });
  }
  const companyId = actor.companyId;

  const body = await req.json();
  const { contactId, requestId, title, description, scheduledAt, scheduledEnd, scheduledAnytime, address, leadSource, propertyId } = body;
  // Optional up-front crew assignment — only users in this company count
  const assigneeIds: string[] = Array.isArray(body.assigneeIds)
    ? body.assigneeIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  // Optional services from the price book (or free-typed). A job with no
  // line items is still valid — but pricing it here builds its checklist and
  // can start a recurring plan, same as the quote and invoice paths.
  const lineItems = (Array.isArray(body.lineItems) ? body.lineItems : []) as {
    name?: string;
    description?: string;
    quantity?: number;
    unitPrice?: number;
    unitCost?: number | null;
    workItemId?: string | null;
    recurringInterval?: RecurringInterval | null;
    sortOrder?: number;
  }[];
  const namedLines = lineItems.filter((li) => (li.name ?? "").trim());

  if (!contactId || !title) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }
  // A window that ends before it starts is always a typo — the only schedule
  // shape we hard-reject (conflicts below are a non-blocking heads-up)
  if (
    scheduledAt &&
    scheduledEnd &&
    new Date(scheduledEnd).getTime() <= new Date(scheduledAt).getTime()
  ) {
    return NextResponse.json({ error: "The end time must be after the start time." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (requestId) {
    const request = await prisma.request.findFirst({ where: { id: requestId, companyId } });
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // Saved service address (property): must belong to this contact. The
  // property's address becomes the job-site snapshot unless one was typed.
  const property =
    typeof propertyId === "string" && propertyId
      ? await prisma.contactAddress.findFirst({ where: { id: propertyId, contactId } })
      : null;
  const propertyLine = property
    ? [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")
    : null;

  const validAssignees =
    assigneeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIds }, companyId, isActive: true },
          select: { id: true },
        })
      : [];

  // Wrapped so two dispatchers creating jobs at once both succeed
  const job = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    const last = await tx.job.findFirst({
      where: { companyId },
      orderBy: { jobNumber: "desc" },
    });

    const created = await tx.job.create({
      data: {
        companyId,
        contactId,
        requestId: requestId || null,
        jobNumber: (last?.jobNumber ?? 0) + 1,
        title,
        description: description || null,
        leadSource: leadSource || contact.leadSource || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        scheduledAnytime: Boolean(scheduledAnytime),
        // Arrival-window override: null = company default, 0 = exact time
        arrivalWindowMinutes:
          Number.isInteger(Number(body.arrivalWindowMinutes)) &&
          Number(body.arrivalWindowMinutes) >= 0 &&
          Number(body.arrivalWindowMinutes) <= 480
            ? Number(body.arrivalWindowMinutes)
            : null,
        address: address || propertyLine || contact.address || null,
        propertyId: property?.id ?? null,
        ...(validAssignees.length > 0 && {
          assignments: { create: validAssignees.map((u) => ({ userId: u.id })) },
        }),
        ...(namedLines.length > 0 && {
          lineItems: {
            create: namedLines.map((li, i) => ({
              name: li.name!.trim(),
              description: li.description || null,
              quantity: li.quantity || 1,
              unitPrice: li.unitPrice || 0,
              unitCost: li.unitCost ?? null,
              total: (li.quantity || 1) * (li.unitPrice || 0),
              workItemId: li.workItemId ?? null,
              recurringInterval: li.recurringInterval ?? null,
              sortOrder: li.sortOrder ?? i,
            })),
          },
        }),
      },
    });

    if (requestId) {
      await tx.request.update({ where: { id: requestId }, data: { status: "CONVERTED" } });
    }

    // Recurring services sold on this job start the client's plan — same rule
    // as quote conversion and direct invoices. Lines the user marked one-time
    // arrive with recurringInterval null and are skipped.
    await ensureSubscriptionsForContact(
      tx,
      companyId,
      contactId,
      namedLines
        .filter((li) => li.recurringInterval != null)
        .map((li) => ({ workItemId: li.workItemId, quantity: Number(li.quantity) || 1 }))
    );

    // First real work closes the lead: active client, off the pipeline board
    // (repeat clients on the board leave it the same way)
    await recordLeadWin(tx, companyId, contact);

    return created;
  }));

  // Materialize the close-out checklist from the picked services right away —
  // before this, a directly-created job could never have one.
  if (namedLines.length > 0) {
    await syncJobChecklist(job.id, companyId).catch((e) =>
      console.error("[jobs] checklist sync failed for", job.id, e)
    );
  }

  // Non-blocking double-booking heads-up — the same check every other
  // schedule write runs; creation was the one path with none at all.
  let conflicts: string[] = [];
  if (scheduledAt && !scheduledAnytime && validAssignees.length > 0) {
    const checkStart = new Date(scheduledAt);
    conflicts = await findScheduleConflicts({
      companyId,
      start: checkStart,
      // No end picked = the calendar's 1-hour default window (same as the
      // PATCH route) — a timed job without an end still holds real time.
      end: scheduledEnd ? new Date(scheduledEnd) : new Date(checkStart.getTime() + 3600_000),
      userIds: validAssignees.map((u) => u.id),
      excludeJobId: job.id,
    }).catch(() => []);
  }

  return NextResponse.json({ ...job, conflicts }, { status: 201 });
}
