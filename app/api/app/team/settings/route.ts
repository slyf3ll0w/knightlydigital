import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * PATCH — company team policies: who gets website leads, and whether
 * Sales members can see invoices & payments.
 */
export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.defaultLeadUserId !== undefined) {
    if (body.defaultLeadUserId === null || body.defaultLeadUserId === "") {
      data.defaultLeadUserId = null; // back to "company owner"
    } else {
      const user = await prisma.user.findFirst({
        where: { id: body.defaultLeadUserId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!user) return NextResponse.json({ error: "Team member not found." }, { status: 400 });
      data.defaultLeadUserId = user.id;
    }
  }

  if (body.salesSeePayments !== undefined) {
    data.salesSeePayments = Boolean(body.salesSeePayments);
  }

  await prisma.company.update({ where: { id: actor.companyId }, data });
  return NextResponse.json({ success: true });
}
