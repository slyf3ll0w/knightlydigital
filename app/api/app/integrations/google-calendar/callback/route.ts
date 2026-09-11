import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { connectUser, syncUserGoogleCalendar, verifyState } from "@/lib/google-calendar";
import { pullUserGoogleCalendar } from "@/lib/google-calendar-pull";

/**
 * Google redirects back here after consent with ?code and ?state. The
 * signed state must decode to the signed-in user — then we trade the code
 * for tokens and run the first sync in the background. Always finishes with
 * a redirect to My Profile (browser navigation, not an XHR).
 */
export const dynamic = "force-dynamic";

function profileRedirect(req: NextRequest, params: Record<string, string>) {
  // Behind Railway's proxy req.nextUrl.origin is the internal host —
  // NEXTAUTH_URL is the real public origin.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const url = new URL("/app/settings/profile", base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "calendar-sync";
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) {
    // "Cancel" on Google's screen, or Google errored out
    return profileRedirect(req, { gcal: "denied" });
  }
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return profileRedirect(req, { gcal: "missing_params" });

  const actor = await getActor();
  if (!actor) return profileRedirect(req, { gcal: "unauthorized" });
  const stateUserId = verifyState(state);
  if (!stateUserId || stateUserId !== actor.id) return profileRedirect(req, { gcal: "bad_state" });

  try {
    await connectUser({ userId: actor.id, companyId: actor.companyId, code });
  } catch (err) {
    console.error("[google-calendar] token exchange failed", err);
    return profileRedirect(req, { gcal: "exchange_failed" });
  }

  // First pull + push run in the background — the card polls status for progress
  pullUserGoogleCalendar(actor.id)
    .catch((err) => console.error("[google-calendar] initial pull failed", err))
    .then(() => syncUserGoogleCalendar(actor.id))
    .catch((err) => console.error("[google-calendar] initial sync failed", err));

  return profileRedirect(req, { gcal: "connected" });
}
