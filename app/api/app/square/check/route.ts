import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { probeSquareConnection } from "@/lib/square-connection";

/**
 * POST — "Check connection" on the Settings card: Square's recommended
 * liveness probe (ListLocations with the seller token). A dead grant tears
 * the connection down so the card flips to Connect, instead of the next
 * client finding out at the pay page.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await probeSquareConnection(actor.companyId);
  return NextResponse.json(result, { status: result.ok ? 200 : 424 });
}
