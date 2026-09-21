import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import { ESTIMATOR_SELECT, runnerEstimators } from "@/lib/estimator-server";
import EstimateClient from "./EstimateClient";

export const metadata: Metadata = { title: "Estimate" };

/**
 * /app/estimate — the onsite flow (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 4). Standing in the driveway: open a tool, answer its questions,
 * show the customer the number, then "Create quote" carries the lines into a
 * new quote where you pick the client and send. Also reachable from the +
 * menu ("Estimate") and the "n e" shortcut.
 */
export default async function EstimatePage() {
  const actor = await requirePageActor((a) => canSell(a.role));
  const rows = await prisma.estimator.findMany({ where: { companyId: actor.companyId, isActive: true }, select: ESTIMATOR_SELECT, orderBy: { name: "asc" } });
  return <EstimateClient tools={runnerEstimators(rows)} manager={isManager(actor.role)} />;
}
