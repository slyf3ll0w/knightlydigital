import { reportError } from "@/lib/report-error";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { disconnectSquare } from "@/lib/square-connection";

/**
 * POST — owner disconnects Square: tokens revoked at Square (best effort)
 * and forgotten here, the company's merchant/location cleared, so every
 * pay surface goes back to "arrange payment with the business". Saved
 * cards stay listed but can't be charged until Square is reconnected
 * (they belong to the seller's Square account, not to us).
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner can disconnect Square." }, { status: 403 });
  }
  try {
    await disconnectSquare(actor.companyId);
  } catch (err) {
    reportError("[square] disconnect failed", err);
    return NextResponse.json({ error: "Couldn't disconnect Square. Please try again." }, { status: 424 });
  }
  console.log(`[square] company ${actor.companyId} disconnected by ${actor.name ?? actor.id}`);
  return NextResponse.json({ ok: true });
}
