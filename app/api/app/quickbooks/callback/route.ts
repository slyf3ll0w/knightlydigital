import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { connectCompany, syncCompany, verifyState } from "@/lib/quickbooks";

/**
 * Intuit redirects back here after the consent screen with ?code, ?state,
 * and ?realmId. The signed state must decode to the signed-in manager's own
 * company — then we trade the code for tokens and kick off the first sync
 * in the background. Always finishes with a redirect to the settings page
 * (this is a browser navigation, not an XHR).
 */
export const dynamic = "force-dynamic";

function settingsRedirect(req: NextRequest, params: Record<string, string>) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host
  // (localhost:8080) — NEXTAUTH_URL is the real public origin.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const url = new URL("/app/settings/quickbooks", base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) {
    // User hit "Cancel" on Intuit's screen (or Intuit errored out)
    return settingsRedirect(req, { error: "denied" });
  }
  const code = sp.get("code");
  const state = sp.get("state");
  const realmId = sp.get("realmId");
  if (!code || !state || !realmId) {
    return settingsRedirect(req, { error: "missing_params" });
  }

  const actor = await getActor();
  if (!actor || !isManager(actor.role)) {
    return settingsRedirect(req, { error: "unauthorized" });
  }
  const stateCompanyId = verifyState(state);
  if (!stateCompanyId || stateCompanyId !== actor.companyId) {
    return settingsRedirect(req, { error: "bad_state" });
  }

  try {
    await connectCompany({ companyId: actor.companyId, code, realmId });
  } catch (err) {
    console.error("[quickbooks] token exchange failed", err);
    return settingsRedirect(req, { error: "exchange_failed" });
  }

  // First sync runs in the background — the settings page shows progress
  // via its status poll instead of blocking this redirect.
  syncCompany(actor.companyId).catch((err) =>
    console.error("[quickbooks] initial sync failed", err)
  );

  return settingsRedirect(req, { connected: "1" });
}
