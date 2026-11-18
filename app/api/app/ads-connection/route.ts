import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor, isManager } from "@/lib/permissions";
import { GoogleAdsError, accountsToPick, chooseAccount, disconnectCompany, isGoogleAdsConfigured, loadAdsConnectStatus, syncCompany } from "@/lib/google-ads";

/**
 * The company's Google Ads connection (lib/google-ads.ts), after the
 * sign-in at /api/app/integrations/google-ads/connect.
 *   GET                      status, plus the accounts to pick from while one still has to be picked
 *   POST { customerId }      use this Google Ads account
 *   POST { action: "sync" }  send the payments now
 *   DELETE                   disconnect (Google's access is revoked; what Google counted stays)
 * Owners and admins.
 */

async function manager() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { actor } as const;
}

function failure(err: unknown, what: string) {
  if (err instanceof GoogleAdsError) return NextResponse.json({ error: err.message }, { status: 400 });
  reportError(`[google-ads] ${what} failed`, err);
  return NextResponse.json({ error: "WorkBench couldn't reach Google. Try again in a minute." }, { status: 502 });
}

export async function GET() {
  const m = await manager();
  if (m.error) return m.error;
  const status = await loadAdsConnectStatus(m.actor.companyId);
  if (!status.needsAccount) return NextResponse.json({ ...status, accounts: [] });
  try {
    const accounts = await accountsToPick(m.actor.companyId);
    return NextResponse.json({ ...status, accounts: accounts.map((a) => ({ customerId: a.customerId, name: a.name })) });
  } catch (err) {
    return NextResponse.json({ ...status, accounts: [], lastError: err instanceof GoogleAdsError ? err.message : "WorkBench couldn't read your Google Ads accounts." });
  }
}

export async function POST(req: NextRequest) {
  const m = await manager();
  if (m.error) return m.error;
  if (!isGoogleAdsConfigured()) return NextResponse.json({ error: "Connecting Google Ads isn't available on this server yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; customerId?: unknown } | null;

  if (body?.action === "sync") {
    const r = await syncCompany(m.actor.companyId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ...(await loadAdsConnectStatus(m.actor.companyId)), accounts: [] });
  }

  try {
    await chooseAccount(m.actor.companyId, body?.customerId);
  } catch (err) {
    return failure(err, "pick account");
  }
  syncCompany(m.actor.companyId).catch((err) => reportError("[google-ads] first sync failed", err));
  return NextResponse.json({ ...(await loadAdsConnectStatus(m.actor.companyId)), accounts: [] });
}

export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  await disconnectCompany(m.actor.companyId);
  return NextResponse.json({ ...(await loadAdsConnectStatus(m.actor.companyId)), accounts: [] });
}
