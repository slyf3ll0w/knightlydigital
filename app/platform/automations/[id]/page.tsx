import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { AUTOMATION_SELECT, automationShape } from "@/lib/automations-server";
import Builder from "../Builder";
import type { Row } from "../types";

export const metadata: Metadata = { title: "Automation" };

/** /app/automations/[id] — one rule in the card builder (desktop) or the plain-English flow (phone). */
export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const { id } = await params;
  const row = await prisma.automation.findFirst({ where: { id, companyId: actor.companyId }, select: AUTOMATION_SELECT });
  if (!row) notFound();
  const runs = await prisma.automationRun.findMany({
    where: { automationId: row.id, NOT: { status: "skipped", detail: "conditions not met" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, automationId: true, event: true, entityType: true, entityId: true, status: true, detail: true, createdAt: true },
  });
  const s = automationShape(row) as ReturnType<typeof automationShape> & { webhookUrl?: string | null };
  const initial: Row = { ...s, lastRunAt: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null, updatedAt: new Date(s.updatedAt).toISOString(), webhookUrl: s.webhookUrl ?? null };
  return <Builder initial={initial} initialRuns={runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />;
}
