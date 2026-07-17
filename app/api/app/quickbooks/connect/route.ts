import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { buildAuthorizeUrl, isQuickBooksConfigured } from "@/lib/quickbooks";

/**
 * Starts the QuickBooks OAuth dance: browser lands here from the Settings →
 * QuickBooks "Connect" button and bounces to Intuit's consent screen.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isQuickBooksConfigured()) {
    return NextResponse.json(
      { error: "QuickBooks isn't configured on this server yet." },
      { status: 503 }
    );
  }
  return NextResponse.redirect(buildAuthorizeUrl(actor.companyId));
}
