import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { buildLoginUrl, isMetaLeadsConfigured } from "@/lib/meta-leads";

/**
 * Starts "Connect Facebook": the browser lands here from Insights → Lead
 * sources → Facebook ads and bounces to Facebook's sign-in. Owners and
 * admins (the connection is the company's).
 *
 * `?mode=url` returns the sign-in address as JSON instead of redirecting, for
 * the phone app: facebook.com can't load in the webview, so the page hands
 * the address to the system browser (same as Google Ads).
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isMetaLeadsConfigured()) {
    return NextResponse.json({ error: "Connecting Facebook isn't available on this server yet." }, { status: 503 });
  }
  const url = buildLoginUrl(actor);
  if (req.nextUrl.searchParams.get("mode") === "url") return NextResponse.json({ url });
  return NextResponse.redirect(url);
}
