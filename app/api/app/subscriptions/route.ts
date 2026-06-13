import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney } from "@/lib/permissions";

/** GET — recurring subscriptions for the company (money-visible roles). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const subs = await prisma.subscription.findMany({
    where: { companyId: actor.companyId },
    include: { contact: { select: { firstName: true, lastName: true } } },
    orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
  });
  return NextResponse.json(subs);
}
