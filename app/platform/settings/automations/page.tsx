import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { AUTOMATION_SELECT, automationShape } from "@/lib/automations-server";
import AutomationsClient from "./AutomationsClient";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const [rows, recent] = await Promise.all([
    prisma.automation.findMany({ where: { companyId: actor.companyId }, select: AUTOMATION_SELECT, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.automationRun.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, automationId: true, event: true, entityType: true, entityId: true, status: true, detail: true, createdAt: true },
    }),
  ]);
  return (
    <AutomationsClient
      automations={rows.map((r) => {
        const s = automationShape(r);
        return { ...s, lastRunAt: s.lastRunAt?.toISOString() ?? null, updatedAt: s.updatedAt.toISOString() };
      })}
      recentRuns={recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
