import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { firstRunAfter } from "@/lib/expenses";

/**
 * A recurring monthly expense template (managers only). Templates are created
 * via POST /api/app/expenses with repeatMonthly: true.
 * PATCH  — edit { description?, category?, amount?, dayOfMonth?, active? };
 *          changing dayOfMonth (or resuming) reschedules to the next future
 *          occurrence — pausing never causes catch-up backfill on resume
 * DELETE — stop it for good (already-logged expenses stay)
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const template = await prisma.recurringExpense.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.description !== undefined) {
    const description = String(body.description).trim().slice(0, 200);
    if (!description) {
      return NextResponse.json({ error: "A description is required." }, { status: 400 });
    }
    data.description = description;
  }
  if (body.category !== undefined) {
    data.category = String(body.category).trim().slice(0, 60) || null;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a positive amount." }, { status: 400 });
    }
    data.amount = Math.round(amount * 100) / 100;
  }
  if (body.dayOfMonth !== undefined) {
    const day = Number(body.dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return NextResponse.json({ error: "Day of month must be 1–31." }, { status: 400 });
    }
    data.dayOfMonth = day;
  }
  if (body.active !== undefined) data.active = body.active === true;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Reschedule when the day changes, or when resuming a paused template (its
  // stored nextRunDate may be months in the past — jumping it forward keeps
  // the cron's catch-up loop from backfilling the paused period).
  const resuming = data.active === true && !template.active;
  if (data.dayOfMonth !== undefined || resuming) {
    const day = (data.dayOfMonth as number | undefined) ?? template.dayOfMonth;
    data.nextRunDate = firstRunAfter(new Date(), day);
  }

  const updated = await prisma.recurringExpense.update({ where: { id: template.id }, data });
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
  const template = await prisma.recurringExpense.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recurringExpense.delete({ where: { id: template.id } });
  return NextResponse.json({ success: true });
}
