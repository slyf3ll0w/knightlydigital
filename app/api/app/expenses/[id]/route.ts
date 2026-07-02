import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/** PATCH — correct an expense (description, category, amount, date). Managers only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const expense = await prisma.expense.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.description !== undefined) {
    const description = String(body.description).trim().slice(0, 300);
    if (!description) {
      return NextResponse.json({ error: "The expense needs a description." }, { status: 400 });
    }
    data.description = description;
  }
  if (body.category !== undefined) {
    data.category = String(body.category).trim().slice(0, 100) || null;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    }
    data.amount = Math.round(amount * 100) / 100;
  }
  if (body.incurredAt !== undefined) {
    if (!body.incurredAt) {
      return NextResponse.json({ error: "A transaction date is required." }, { status: 400 });
    }
    // date-only, noon-anchored (matches create)
    const incurred = new Date(
      String(body.incurredAt).length === 10 ? `${body.incurredAt}T12:00:00` : body.incurredAt
    );
    if (isNaN(incurred.getTime())) {
      return NextResponse.json({ error: "Invalid transaction date." }, { status: 400 });
    }
    data.incurredAt = incurred;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.expense.update({ where: { id: expense.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const expense = await prisma.expense.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.expense.delete({ where: { id: expense.id } });
  return NextResponse.json({ success: true });
}
