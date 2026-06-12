import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, viaContactScope } from "@/lib/permissions";

/**
 * PATCH — update a request's status or details.
 * Body: { status?: "NEW" | "CONVERTED" | "ARCHIVED", title?, details? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const request = await prisma.request.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
  });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status && ["NEW", "CONVERTED", "ARCHIVED"].includes(body.status)) {
    data.status = body.status;
  }
  if (body.title !== undefined) data.title = body.title;
  if (body.details !== undefined) data.details = body.details || null;

  const updated = await prisma.request.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/**
 * DELETE — permanently remove a request (spam/marketer cleanup). Refused when
 * quotes or jobs link to it; real work should be archived, not deleted.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const request = await prisma.request.findFirst({
    where: { id, companyId },
    include: { _count: { select: { quotes: true, jobs: true } } },
  });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  if (request._count.quotes > 0 || request._count.jobs > 0) {
    return NextResponse.json(
      { error: "This request is linked to quotes or jobs — archive it instead." },
      { status: 400 }
    );
  }

  await prisma.request.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
