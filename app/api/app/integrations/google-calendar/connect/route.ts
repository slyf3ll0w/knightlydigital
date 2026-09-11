import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { buildAuthorizeUrl, isGoogleCalendarConfigured } from "@/lib/google-calendar";

/**
 * Starts the Google OAuth dance for the signed-in user's OWN calendar: the
 * browser lands here from My Profile → Calendar sync → "Connect Google
 * Calendar" and bounces to Google's consent screen. Any role — it's their
 * account, their schedule.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar isn't configured on this server yet." }, { status: 503 });
  }
  return NextResponse.redirect(buildAuthorizeUrl(actor.id));
}
