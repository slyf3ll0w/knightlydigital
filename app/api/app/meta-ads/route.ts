import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor, isManager } from "@/lib/permissions";
import { MetaAdsError, clearDataset, loadMetaAdsStatus, saveDataset, sendTestEvent, syncCompany } from "@/lib/meta-ads";

/**
 * Facebook ads, results back (Insights → Lead sources → Facebook ads;
 * lib/meta-ads.ts).
 *   GET                                      status
 *   POST { datasetId, token }                turn on, or replace the dataset / token
 *   POST { action: "test", testCode }        one made-up lead to Events Manager's Test events tab
 *   POST { action: "sync" }                  send what is waiting now
 *   DELETE                                   turn off (what Facebook already counted stays)
 * Owners and admins.
 */

async function manager() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { actor } as const;
}

/** Facebook's refusal in its own words (400), or a failure to reach it (424: Cloudflare replaces a 502's body). */
function failure(err: unknown, what: string) {
  if (err instanceof MetaAdsError) return NextResponse.json({ error: err.transient ? err.message : `Facebook said: ${err.message}` }, { status: err.transient ? 424 : 400 });
  reportError(`[meta-ads] ${what} failed`, err);
  return NextResponse.json({ error: "WorkBench couldn't reach Facebook. Try again in a minute." }, { status: 424 });
}

export async function GET() {
  const m = await manager();
  if (m.error) return m.error;
  return NextResponse.json(await loadMetaAdsStatus(m.actor.companyId));
}

export async function POST(req: NextRequest) {
  const m = await manager();
  if (m.error) return m.error;
  const companyId = m.actor.companyId;
  const body = (await req.json().catch(() => null)) as { action?: unknown; datasetId?: unknown; token?: unknown; testCode?: unknown } | null;

  if (body?.action === "test") {
    try {
      await sendTestEvent(companyId, body.testCode);
    } catch (err) {
      return failure(err, "test event");
    }
    return NextResponse.json({ ...(await loadMetaAdsStatus(companyId)), tested: true });
  }

  if (body?.action === "sync") {
    const r = await syncCompany(companyId);
    if (!r.ok) return NextResponse.json({ error: r.transient ? r.error : `Facebook said: ${r.error}` }, { status: r.transient ? 424 : 400 });
    return NextResponse.json(await loadMetaAdsStatus(companyId));
  }

  try {
    await saveDataset(companyId, body?.datasetId, body?.token);
  } catch (err) {
    // a mistyped id or token is ours to explain, not Facebook's
    if (err instanceof MetaAdsError) return NextResponse.json({ error: err.message }, { status: 400 });
    return failure(err, "save");
  }
  return NextResponse.json(await loadMetaAdsStatus(companyId));
}

export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  await clearDataset(m.actor.companyId);
  return NextResponse.json(await loadMetaAdsStatus(m.actor.companyId));
}
