import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { billSubscriptionNow } from "@/lib/subscriptions";

/**
 * PATCH — manage one subscription. Body:
 *   { status: "ACTIVE" | "PAUSED" | "CANCELLED" }  — pause/resume/cancel
 *   { action: "billNow" }                          — bill this cycle immediately
 * Managers only.
 */
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

  if (body.status && ["ACTIVE", "PAUSED", "CANCELLED"].includes(body.status)) {
    const updated = await prisma.subscription.update({
      where: { id },
      data: { status: body.status },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}
