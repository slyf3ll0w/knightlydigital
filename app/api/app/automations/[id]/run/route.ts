import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { AUTOMATION_SELECT, runManual } from "@/lib/automations-server";

/**
 * POST { entityId } — run a "you press Run on a record" automation on that
 * record right now. Only manual.run rules; the record must belong to the
 * company (the loader scopes by companyId). Re-runnable — every press is
 * its own run row.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.automation.findFirst({ where: { id, companyId: actor.companyId }, select: AUTOMATION_SELECT });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!row.isActive) return NextResponse.json({ error: "This automation is paused." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const entityId = typeof body.entityId === "string" ? body.entityId.trim().slice(0, 40) : "";
  if (!entityId || entityId.includes(":")) return NextResponse.json({ error: "entityId is required." }, { status: 400 });
  const result = await runManual(row, entityId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: result.status === "ok", status: result.status, detail: result.detail });
}
