import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { connectUser, syncUserGoogleCalendar, verifyState } from "@/lib/google-calendar";
import { pullUserGoogleCalendar } from "@/lib/google-calendar-pull";

/**
 * Google redirects back here after consent with ?code and ?state.
 *
 * The signed state IS the identity: `buildAuthorizeUrl` HMACs the user id
 * with a 10-minute expiry, so this route does not need the app's session
 * cookie — and must not require it. From the native shell the consent screen
 * opens in the system browser (accounts.google.com can't load in the
 * webview), so Google hands the code back to a browser that has no WorkBench
 * session; requiring one is what turned "Connect" into "Unauthorized" on
 * mobile. A session, when present, is only cross-checked against the state.
 *
 * Signed-in callers land back on My Profile. Callers without a session
 * finished in the system browser, so they get the standalone
 * /app/calendar-connected page telling them to return to the app.
 */
export const dynamic = "force-dynamic";

function landing(req: NextRequest, signedIn: boolean, gcal: string) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host —
  // NEXTAUTH_URL is the real public origin.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const url = new URL(signedIn ? "/app/settings/profile" : "/app/calendar-connected", base);
  url.searchParams.set("gcal", gcal);
  if (signedIn) url.hash = "calendar-sync";
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const actor = await getActor();
  const signedIn = !!actor;

  if (sp.get("error")) {
    // "Cancel" on Google's screen, or Google errored out
    return landing(req, signedIn, "denied");
  }
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return landing(req, signedIn, "missing_params");

  const userId = verifyState(state);
  if (!userId) return landing(req, signedIn, "bad_state");
  // A session that isn't the one the state was minted for means the link was
  // replayed into somebody else's browser — refuse rather than connect it.
  if (actor && actor.id !== userId) return landing(req, signedIn, "bad_state");

  // Without a session we still need the company the connection belongs to.
  const companyId =
    actor?.companyId ??
    (await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } }))?.companyId;
  if (!companyId) return landing(req, signedIn, "bad_state");

  try {
    await connectUser({ userId, companyId, code });
  } catch (err) {
    console.error("[google-calendar] token exchange failed", err);
    return landing(req, signedIn, "exchange_failed");
  }

  // First pull + push run in the background — the card polls status for progress
  pullUserGoogleCalendar(userId)
    .catch((err) => console.error("[google-calendar] initial pull failed", err))
    .then(() => syncUserGoogleCalendar(userId))
    .catch((err) => console.error("[google-calendar] initial sync failed", err));

  return landing(req, signedIn, "connected");
}
