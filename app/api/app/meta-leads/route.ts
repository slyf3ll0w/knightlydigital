import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor, isManager } from "@/lib/permissions";
import { MetaLeadsError, chooseDataset, choosePage, datasetsToPick, disconnectPage, isMetaLeadsConfigured, loadMetaLeadsStatus, pagesToPick } from "@/lib/meta-leads";
import { loadMetaAdsStatus } from "@/lib/meta-ads";

/**
 * The company's Facebook Page connection (lib/meta-leads.ts), after the
 * sign-in at /api/app/integrations/meta/connect.
 *   GET                 status, plus the Pages to pick from while one still has to be picked, and the
 *                       datasets to pick from while results are not being reported yet
 *   POST { pageId }     take leads from this Page
 *   POST { datasetId }  report results to this dataset through the sign-in (nothing pasted)
 *   DELETE              disconnect (leads already filed stay)
 * Owners and admins.
 */

async function manager() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { actor } as const;
}

export async function GET() {
  const m = await manager();
  if (m.error) return m.error;
  const companyId = m.actor.companyId;
  const status = await loadMetaLeadsStatus(companyId);
  const wantDatasets = status.signedIn && !(await loadMetaAdsStatus(companyId)).on;
  if (!status.needsPage && !wantDatasets) return NextResponse.json({ ...status, pages: [], datasets: [] });
  try {
    const [pages, datasets] = await Promise.all([status.needsPage ? pagesToPick(companyId) : [], wantDatasets ? datasetsToPick(companyId) : []]);
    return NextResponse.json({ ...status, pages, datasets });
  } catch (err) {
    return NextResponse.json({ ...status, pages: [], datasets: [], lastLeadError: err instanceof MetaLeadsError ? err.message : "WorkBench couldn't read your Facebook account." });
  }
}

export async function POST(req: NextRequest) {
  const m = await manager();
  if (m.error) return m.error;
  if (!isMetaLeadsConfigured()) return NextResponse.json({ error: "Connecting Facebook isn't available on this server yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { pageId?: unknown; datasetId?: unknown } | null;
  try {
    if (body?.datasetId !== undefined) await chooseDataset(m.actor.companyId, body.datasetId);
    else await choosePage(m.actor.companyId, body?.pageId);
  } catch (err) {
    if (err instanceof MetaLeadsError) return NextResponse.json({ error: err.transient ? "WorkBench couldn't reach Facebook. Try again in a minute." : err.message }, { status: err.transient ? 424 : 400 });
    reportError("[meta-leads] pick failed", err);
    // 424, not 502: Cloudflare replaces a 502's body
    return NextResponse.json({ error: "WorkBench couldn't reach Facebook. Try again in a minute." }, { status: 424 });
  }
  return NextResponse.json({ ...(await loadMetaLeadsStatus(m.actor.companyId)), pages: [], datasets: [] });
}

export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  await disconnectPage(m.actor.companyId);
  return NextResponse.json({ ...(await loadMetaLeadsStatus(m.actor.companyId)), pages: [], datasets: [] });
}
