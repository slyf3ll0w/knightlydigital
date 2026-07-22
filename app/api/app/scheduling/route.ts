import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { resolveSlotInterval } from "@/lib/scheduling";
import { earliestOpenMinutes, sanitizeBusinessHours } from "@/lib/business-hours";

/**
 * GET — the company's in-app scheduling slot interval (minutes). Used by fully
 * client-rendered scheduling forms (e.g. New Job) that can't receive it as a
 * server prop. Non-sensitive; any authenticated company member may read it.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { schedulingIntervalMinutes: true, businessHours: true },
  });

  return NextResponse.json({
    intervalMinutes: resolveSlotInterval({
      companyIntervalMinutes: company?.schedulingIntervalMinutes,
    }),
    dayStartMinutes: earliestOpenMinutes(sanitizeBusinessHours(company?.businessHours)),
  });
}
