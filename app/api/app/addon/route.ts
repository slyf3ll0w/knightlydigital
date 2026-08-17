import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * GET — the company's add-on state. The upsell page polls this after the
 * payer returns from Livery checkout, waiting for the subscription.created
 * webhook to stamp the entitlement (usually seconds).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { addonEnabled: true, addonActiveAt: true },
  });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  return NextResponse.json({
    enabled: company.addonEnabled,
    active: Boolean(company.addonActiveAt),
    activeAt: company.addonActiveAt,
  });
}
