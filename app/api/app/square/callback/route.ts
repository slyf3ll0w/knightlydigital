import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { completeSquareConnect, SquareConnectError, verifySquareState } from "@/lib/square-connection";

/**
 * Square redirects the seller back here after the consent screen with
 * ?code (5-minute, single-use), ?state (ours) and ?response_type=code —
 * or ?error=access_denied when they pressed Deny.
 *
 * Register this URL in the Developer Console (OAuth → Redirect URL) for
 * each environment: `${NEXTAUTH_URL}/api/app/square/callback`.
 *
 * The signed state IS the identity (same reasoning as the QuickBooks
 * callback): the native shell opens consent in the system browser, which
 * has no WorkBench session, so this route must not require one. The owner
 * named in the state must still be the active OWNER of that company, and
 * a session, when present, is cross-checked against the state.
 * Always a redirect — this is a browser navigation, not an XHR.
 */
export const dynamic = "force-dynamic";

function landing(req: NextRequest, signedIn: boolean, outcome: string) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host —
  // NEXTAUTH_URL is the real public origin.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const url = new URL(signedIn ? "/app/settings" : "/app/login", base);
  if (signedIn) {
    url.searchParams.set("square", outcome);
  } else {
    url.searchParams.set("callbackUrl", `/app/settings?square=${outcome}`);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const actor = await getActor();
  const signedIn = !!actor;

  if (sp.get("error")) {
    // Seller pressed Deny (access_denied) or Square errored out
    return landing(req, signedIn, "denied");
  }
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return landing(req, signedIn, "missing_params");

  const verified = verifySquareState(state);
  if (!verified) return landing(req, signedIn, "bad_state");
  const { companyId, userId } = verified;
  // A session for a different account means the link was replayed into
  // somebody else's browser — refuse rather than connect it.
  if (actor && (actor.id !== userId || actor.companyId !== companyId)) {
    return landing(req, signedIn, "bad_state");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, role: true, isActive: true, name: true },
  });
  if (!user || user.companyId !== companyId || !user.isActive || user.role !== "OWNER") {
    return landing(req, signedIn, "unauthorized");
  }

  try {
    const result = await completeSquareConnect({ companyId, code });
    console.log(`[square] company ${companyId} connected by ${user.name ?? userId}${result.businessName ? ` (${result.businessName})` : ""}`);
  } catch (err) {
    if (err instanceof SquareConnectError) return landing(req, signedIn, err.code);
    reportError("[square] connect failed", err);
    return landing(req, signedIn, "exchange_failed");
  }

  return landing(req, signedIn, "connected");
}
