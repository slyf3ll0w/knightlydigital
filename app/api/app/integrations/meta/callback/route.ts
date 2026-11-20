import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor, isManager } from "@/lib/permissions";
import { MetaLeadsError, connectCompany, verifyState } from "@/lib/meta-leads";
import { loginUrlReturningTo } from "@/lib/login-return";

/**
 * Facebook redirects back here after the sign-in with ?code and ?state.
 *
 * Finished only by the signed-in person who started it, in the company it
 * was started for (the state is signed with both). No session (the phone
 * app's sign-in runs in the system browser) → sign in and come straight
 * back with code and state intact.
 *
 * Lands on the Facebook ads page with ?fb=<outcome>; the page turns that
 * into a line of plain words. A failure's reason rides along as ?why.
 */
export const dynamic = "force-dynamic";

const PAGE = "/app/insights/lead-sources/facebook";

function landing(req: NextRequest, outcome: string, why?: string) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host
  const url = new URL(PAGE, process.env.NEXTAUTH_URL ?? req.nextUrl.origin);
  url.searchParams.set("fb", outcome);
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
    return landing(req, await connectCompany({ companyId: actor.companyId, userId: actor.id, code }));
  } catch (err) {
    if (err instanceof MetaLeadsError) return landing(req, "failed", err.message);
    reportError("[meta-leads] connect failed", err);
    return landing(req, "failed");
  }
}
