import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { squareConfigured } from "@/lib/square";
import { squareAuthorizeUrlFor } from "@/lib/square-connection";

/**
 * Starts the Square OAuth dance: the browser lands here from Settings →
 * Online Payments "Connect Square" and bounces to Square's consent screen.
 * Owner only — this is the account that will receive the company's money.
 * The signed state carries the company AND the owner, so the callback can
 * finish without a session (the native shell hands Square to Safari/Chrome).
 *
 * `?mode=url` returns the consent URL as JSON instead of redirecting. The
 * phone app needs that: its shell keeps only /app and /superadmin paths in
 * the webview, so a plain link to this /api route was thrown to the system
 * browser — which has no session and showed this route's "Unauthorized"
 * JSON on screen (Knight Light, 2026-11-09). components/ConnectSquareButton
 * fetches the URL (same-origin, with cookies) and opens it in the system
 * browser itself. `&native=1` flags the signed state so the callback lands
 * on /square-connected (outside the app) instead of Settings.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner can connect Square." }, { status: 403 });
  }
  if (getProcessor().name !== "square" || !squareConfigured()) {
    return NextResponse.json({ error: "Square isn't configured on this server yet." }, { status: 503 });
  }
  const sp = req.nextUrl.searchParams;
  const url = squareAuthorizeUrlFor(actor.companyId, actor.id, { native: sp.get("native") === "1" });
  if (sp.get("mode") === "url") return NextResponse.json({ url });
  return NextResponse.redirect(url);
}
