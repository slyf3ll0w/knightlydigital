import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { buildAuthorizeUrl, isGoogleCalendarConfigured } from "@/lib/google-calendar";

/**
 * Starts the Google OAuth dance for the signed-in user's OWN calendar: the
 * browser lands here from My Profile → Calendar sync → "Connect Google
 * Calendar" and bounces to Google's consent screen. Any role — it's their
 * account, their schedule.
 *
 * `?mode=url` returns the consent URL as JSON instead of redirecting. The
 * native shell needs that: accounts.google.com is outside allowNavigation
 * (and outside iOS app-bound domains), so the webview can't follow a 302
 * there — CalendarSyncCard hands the URL to Capacitor's Browser plugin.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar isn't configured on this server yet." }, { status: 503 });
  }
  const url = buildAuthorizeUrl(actor.id);
  if (req.nextUrl.searchParams.get("mode") === "url") return NextResponse.json({ url });
  return NextResponse.redirect(url);
}
