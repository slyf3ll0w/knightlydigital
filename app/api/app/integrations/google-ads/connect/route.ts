import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { buildAuthorizeUrl, isGoogleAdsConfigured } from "@/lib/google-ads";

/**
 * Starts "Connect Google Ads": the browser lands here from Insights → Lead
 * sources → Report paid jobs to Google Ads and bounces to Google's consent
 * screen. Owners and admins (the connection is the company's).
 *
 * `?mode=url` returns the consent URL as JSON instead of redirecting, for
 * the phone app: accounts.google.com can't load in the webview, so the page
 * hands the URL to the system browser (same as Google Calendar).
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isGoogleAdsConfigured()) {
    return NextResponse.json({ error: "Connecting Google Ads isn't available on this server yet." }, { status: 503 });
  }
  const url = buildAuthorizeUrl(actor);
  if (req.nextUrl.searchParams.get("mode") === "url") return NextResponse.json({ url });
  return NextResponse.redirect(url);
}
