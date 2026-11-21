import { prisma } from "@/lib/db";

/**
 * A fingerprint of a company's call log: the newest updatedAt plus the row
 * count. GET /api/app/calls/pulse answers it and the Calls page renders with
 * it, so components/CallsLive.tsx can tell whether anything changed since
 * the page it is sitting on was built. One aggregate on an indexed column.
 */
export async function callLogStamp(companyId: string): Promise<string> {
  const agg = await prisma.call.aggregate({
    where: { companyId },
    _max: { updatedAt: true },
    _count: { _all: true },
  });
  return `${agg._max.updatedAt?.toISOString() ?? ""}|${agg._count._all}`;
}
