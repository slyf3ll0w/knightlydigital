import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { ESTIMATOR_SELECT, runnerEstimators } from "@/lib/estimator-server";
import EstimatorsClient from "./EstimatorsClient";

export const metadata: Metadata = { title: "Estimate tools" };

export default async function EstimatorsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const rows = await prisma.estimator.findMany({
    where: { companyId: actor.companyId },
    select: ESTIMATOR_SELECT,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const tools = runnerEstimators(rows, { includeInactive: true });
  return (
    <EstimatorsClient
      tools={tools.map((t) => {
        const row = rows.find((r) => r.id === t.id)!;
        return { ...t, isActive: row.isActive, runs: row.runs, assists: row.assists, updatedAt: row.updatedAt.toISOString() };
      })}
      brokenCount={rows.length - tools.length}
    />
  );
}
