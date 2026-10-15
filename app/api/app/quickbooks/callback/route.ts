import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { connectCompany, syncCompany, verifyState } from "@/lib/quickbooks";

/**
 * Intuit redirects back here after the consent screen with ?code, ?state,
 * and ?realmId.
 *
 * The signed state IS the identity: `buildAuthorizeUrl` HMACs the company id
 * and the manager's user id with a 10-minute expiry, so this route does not
 * need the app's session cookie — and must not require it. From the native
 * shell the consent screen opens in the system browser (Intuit can't load in
 * the webview), so Intuit hands the code back to a browser that has no
 * WorkBench session; requiring one is what turned "Connect to QuickBooks"
 * into "error unauthorized" on a phone. The user named in the state must
 * still be an active manager of that company, and a session, when present,
 * is cross-checked against the state.
 *
 * Signed-in callers land back on the QuickBooks settings page. Callers
 * without a session finished in the system browser, so they get the
 * standalone /quickbooks-connected page telling them to return to the app.
 * Always a redirect (this is a browser navigation, not an XHR).
 */
export const dynamic = "force-dynamic";

function landing(req: NextRequest, signedIn: boolean, outcome: string) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host
  // (localhost:8080) — NEXTAUTH_URL is the real public origin.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const url = new URL(signedIn ? "/app/settings/quickbooks" : "/quickbooks-connected", base);
  if (signedIn) {
    if (outcome === "connected") url.searchParams.set("connected", "1");
    else url.searchParams.set("error", outcome);
  } else {
    url.searchParams.set("qbo", outcome);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const actor = await getActor();
  const signedIn = !!actor;

  if (sp.get("error")) {
    // User hit "Cancel" on Intuit's screen (or Intuit errored out)
    return landing(req, signedIn, "denied");
  }
  const code = sp.get("code");
  const state = sp.get("state");
  const realmId = sp.get("realmId");
  if (!code || !state || !realmId) {
    return landing(req, signedIn, "missing_params");
  }

  const verified = verifyState(state);
  if (!verified) return landing(req, signedIn, "bad_state");
  const { companyId, userId } = verified;
  // A session for a different account means the link was replayed into
  // somebody else's browser — refuse rather than connect it.
  if (actor && (actor.id !== userId || actor.companyId !== companyId)) {
    return landing(req, signedIn, "bad_state");
  }
  // The person who pressed Connect must still be an active manager of the
  // company — the state was minted up to ten minutes ago.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, role: true, isActive: true },
  });
  if (!user || user.companyId !== companyId || !user.isActive || !isManager(user.role)) {
    return landing(req, signedIn, "unauthorized");
  }

  try {
    await connectCompany({ companyId, code, realmId });
  } catch (err) {
    reportError("[quickbooks] token exchange failed", err);
    return landing(req, signedIn, "exchange_failed");
  }

  // First sync runs in the background — the settings page shows progress
  // via its status poll instead of blocking this redirect.
  syncCompany(companyId).catch((err) =>
    reportError("[quickbooks] initial sync failed", err)
  );

  return landing(req, signedIn, "connected");
}
