import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor, isManager } from "@/lib/permissions";
import { GoogleAdsError, connectCompany, syncCompany, verifyState } from "@/lib/google-ads";
import { loginUrlReturningTo } from "@/lib/login-return";

/**
 * Google redirects back here after consent with ?code and ?state.
 *
 * Finished only by the signed-in person who started it, in the company it
 * was started for (the state is signed with both). No session (the phone
 * app's consent screen runs in the system browser) → sign in and come
 * straight back with code and state intact.
 *
 * Lands on the Google Ads page with ?gads=<outcome>; the page turns that
 * into a line of plain words. A failure's reason rides along as ?why.
 */
export const dynamic = "force-dynamic";

const PAGE = "/app/insights/lead-sources/google-ads";

function landing(req: NextRequest, outcome: string, why?: string) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host
  const url = new URL(PAGE, process.env.NEXTAUTH_URL ?? req.nextUrl.origin);
  url.searchParams.set("gads", outcome);
  if (why) url.searchParams.set("why", why.slice(0, 300));
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return landing(req, "denied");
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return landing(req, "failed");

  const signed = verifyState(state);
  if (!signed) return landing(req, "expired");

  const actor = await getActor();
  if (!actor) {
    const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
    return NextResponse.redirect(new URL(loginUrlReturningTo(`${req.nextUrl.pathname}${req.nextUrl.search}`), base));
  }
  if (actor.id !== signed.userId || actor.companyId !== signed.companyId || !isManager(actor.role)) return landing(req, "expired");

  try {
    const outcome = await connectCompany({ companyId: actor.companyId, userId: actor.id, code });
    if (outcome === "connected") {
      // first send in the background; a brand-new conversion action may refuse payments for a few hours, the cron tries again
      syncCompany(actor.companyId).catch((err) => reportError("[google-ads] first sync failed", err));
    }
    return landing(req, outcome);
  } catch (err) {
    if (err instanceof GoogleAdsError) return landing(req, "failed", err.message);
    reportError("[google-ads] connect failed", err);
    return landing(req, "failed");
  }
}
