import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { cancelBuild, loadBuild } from "@/lib/estimator-build-jobs";

export const dynamic = "force-dynamic";

/**
 * GET /api/app/estimators/build/[id] — one build's state for the page (and
 * the app-wide progress bar) to poll: status (running | questions | done |
 * error | cancelled), the prompt (so a resumed page can answer clarifying
 * questions), and every event so far (the page replays the ones it hasn't
 * seen). DELETE cancels a build that is still going — nothing is saved.
 * Managers, own company.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await loadBuild(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { id: row.id, status: row.status, prompt: row.prompt, estimatorId: row.estimatorId, toolId: row.toolId, events: row.events, updatedAt: row.updatedAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const ok = await cancelBuild(id, actor.companyId);
  const row = ok ? await loadBuild(id, actor.companyId) : null;
  return NextResponse.json({ ok, status: row?.status ?? null });
}
