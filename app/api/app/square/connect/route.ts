import { NextResponse } from "next/server";
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
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner can connect Square." }, { status: 403 });
  }
  if (getProcessor().name !== "square" || !squareConfigured()) {
    return NextResponse.json({ error: "Square isn't configured on this server yet." }, { status: 503 });
  }
  return NextResponse.redirect(squareAuthorizeUrlFor(actor.companyId, actor.id));
}
