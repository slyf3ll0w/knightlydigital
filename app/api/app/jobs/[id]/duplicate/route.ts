import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, jobScope } from "@/lib/permissions";
import { withDocNumberRetry } from "@/lib/doc-numbers";

/**
 * POST — duplicate a job into a fresh unscheduled ACTIVE job: same client,
 * title, address, description, line items. Schedule, crew, checklist state,
 * photos, notes, and time entries stay with the original (the checklist
 * regenerates from the services on first open).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role) && actor.role !== "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = actor.companyId;

  const { id } = await params;
  const source = await prisma.job.findFirst({
    where: { id, companyId, ...jobScope(actor) },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const created = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const last = await tx.job.findFirst({
        where: { companyId },
        orderBy: { jobNumber: "desc" },
        select: { jobNumber: true },
      });
      return tx.job.create({
        data: {
          companyId,
          contactId: source.contactId,
          jobNumber: (last?.jobNumber ?? 0) + 1,
          title: source.title,
          description: source.description,
          address: source.address,
          leadSource: source.leadSource,
          status: "ACTIVE",
          lineItems: {
            create: source.lineItems.map((li, i) => ({
              name: li.name,
              description: li.description,
              quantity: li.quantity,
              unitCost: li.unitCost,
              unitPrice: li.unitPrice,
              total: li.total,
              recurringInterval: li.recurringInterval,
              sortOrder: i,
            })),
          },
        },
        select: { id: true, jobNumber: true },
      });
    })
  );

  return NextResponse.json(created, { status: 201 });
}
