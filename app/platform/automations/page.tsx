import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { AUTOMATION_SELECT, automationShape } from "@/lib/automations-server";
import AutomationsClient from "./AutomationsClient";
import type { Row } from "./types";

export const metadata: Metadata = { title: "Automations" };

/**
 * /app/automations — the company's "when this happens, do that" rules
 * (docs/plans/automations-builder-2026-09-24.md). Desktop lists them with
 * pause / delete and links into the card builder; phones get the iOS list +
 * detail sheet with Atlas as the way to create or change a rule.
 */
export default async function AutomationsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const [rows, recent] = await Promise.all([
    prisma.automation.findMany({ where: { companyId: actor.companyId }, select: AUTOMATION_SELECT, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.automationRun.findMany({
      // Non-match claim rows exist only as the dedupe key — not activity
      where: { companyId: actor.companyId, NOT: { status: "skipped", detail: "conditions not met" } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, automationId: true, event: true, entityType: true, entityId: true, status: true, detail: true, createdAt: true },
    }),
  ]);
  const automations: Row[] = rows.map((r) => {
    const s = automationShape(r) as ReturnType<typeof automationShape> & { webhookUrl?: string | null };
    return { ...s, lastRunAt: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null, updatedAt: new Date(s.updatedAt).toISOString(), webhookUrl: s.webhookUrl ?? null };
  });
  return <AutomationsClient automations={automations} recentRuns={recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />;
}
