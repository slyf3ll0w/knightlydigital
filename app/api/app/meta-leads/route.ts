import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor, isManager } from "@/lib/permissions";
import { MetaLeadsError, choosePage, disconnectPage, isMetaLeadsConfigured, loadMetaLeadsStatus, pagesToPick } from "@/lib/meta-leads";

/**
 * The company's Facebook Page connection (lib/meta-leads.ts), after the
 * sign-in at /api/app/integrations/meta/connect.
 *   GET                 status, plus the Pages to pick from while one still has to be picked
 *   POST { pageId }     take leads from this Page
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
  const status = await loadMetaLeadsStatus(m.actor.companyId);
  if (!status.needsPage) return NextResponse.json({ ...status, pages: [] });
  try {
    return NextResponse.json({ ...status, pages: await pagesToPick(m.actor.companyId) });
  } catch (err) {
    return NextResponse.json({ ...status, pages: [], lastLeadError: err instanceof MetaLeadsError ? err.message : "WorkBench couldn't read your Facebook Pages." });
  }
}

export async function POST(req: NextRequest) {
  const m = await manager();
  if (m.error) return m.error;
  if (!isMetaLeadsConfigured()) return NextResponse.json({ error: "Connecting Facebook isn't available on this server yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { pageId?: unknown } | null;
  try {
    await choosePage(m.actor.companyId, body?.pageId);
  } catch (err) {
    if (err instanceof MetaLeadsError) return NextResponse.json({ error: err.transient ? "WorkBench couldn't reach Facebook. Try again in a minute." : err.message }, { status: err.transient ? 424 : 400 });
    reportError("[meta-leads] pick page failed", err);
    // 424, not 502: Cloudflare replaces a 502's body
    return NextResponse.json({ error: "WorkBench couldn't reach Facebook. Try again in a minute." }, { status: 424 });
  }
  return NextResponse.json({ ...(await loadMetaLeadsStatus(m.actor.companyId)), pages: [] });
}

export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  await disconnectPage(m.actor.companyId);
  return NextResponse.json({ ...(await loadMetaLeadsStatus(m.actor.companyId)), pages: [] });
}
