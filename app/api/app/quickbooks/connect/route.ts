import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { buildAuthorizeUrl, isQuickBooksConfigured } from "@/lib/quickbooks";

/**
 * Starts the QuickBooks OAuth dance: the Settings → QuickBooks "Connect"
 * button lands here and bounces to Intuit's consent screen. The signed state
 * carries the company AND the manager, so the callback can finish without a
 * session (the native shell hands Intuit to Safari/Chrome).
 *
 * `?mode=url` returns the consent URL as JSON instead of redirecting. The
 * native shell needs that: it keeps only /app and /superadmin paths in its
 * webview, so a plain link to this /api route is thrown to the system
 * browser — which has no session and saw this route's "Unauthorized" JSON
 * on screen. The settings page fetches the URL (same-origin, with cookies)
 * and opens it in the system browser itself.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isQuickBooksConfigured()) {
    return NextResponse.json(
      { error: "QuickBooks isn't configured on this server yet." },
      { status: 503 }
    );
  }
  const url = buildAuthorizeUrl(actor.companyId, actor.id);
  if (req.nextUrl.searchParams.get("mode") === "url") return NextResponse.json({ url });
  return NextResponse.redirect(url);
}
