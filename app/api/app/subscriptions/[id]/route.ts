import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { billSubscriptionNow } from "@/lib/subscriptions";

/**
 * PATCH — manage one subscription. Body:
 *   { status: "ACTIVE" | "PAUSED" | "CANCELLED" }  — pause/resume/cancel
 *   { action: "billNow" }                          — bill this cycle immediately
 *   { name?, unitPrice?, quantity?, interval?, nextRunDate? } — reprice/edit;
 *     takes effect from the next billing run (already-generated invoices keep
 *     their amounts)
 * Managers only.
 */

const validIntervals = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const sub = await prisma.subscription.findFirst({ where: { id, companyId } });
  if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

  const body = await req.json();

  if (body.action === "billNow") {
    const outcome = await billSubscriptionNow(id, companyId);
    if (!outcome) return NextResponse.json({ error: "Subscription is not active." }, { status: 400 });
    return NextResponse.json({ ok: true, outcome });
  }

  const data: Record<string, unknown> = {};

  if (body.status && ["ACTIVE", "PAUSED", "CANCELLED"].includes(body.status)) {
    data.status = body.status;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 150);
    if (!name) return NextResponse.json({ error: "The subscription needs a name." }, { status: 400 });
    data.name = name;
  }
  if (body.unitPrice !== undefined) {
    const price = Number(body.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be zero or more." }, { status: 400 });
    }
    data.unitPrice = Math.round(price * 100) / 100;
  }
  if (body.quantity !== undefined) {
    const qty = Number(body.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than zero." }, { status: 400 });
    }
    data.quantity = qty;
  }
  if (body.interval !== undefined) {
    if (!validIntervals.includes(body.interval)) {
      return NextResponse.json({ error: "Invalid billing interval." }, { status: 400 });
    }
    data.interval = body.interval;
  }
  if (body.nextRunDate !== undefined) {
    if (!body.nextRunDate) {
      return NextResponse.json({ error: "A next billing date is required." }, { status: 400 });
    }
    // date-only, noon-anchored like the billing engine expects
    const next = new Date(
      String(body.nextRunDate).length === 10 ? `${body.nextRunDate}T12:00:00` : body.nextRunDate
    );
    if (isNaN(next.getTime())) {
      return NextResponse.json({ error: "Invalid next billing date." }, { status: 400 });
    }
    data.nextRunDate = next;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.subscription.update({ where: { id }, data });
  return NextResponse.json(updated);
}
