import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { LineError, lineSummary, refreshRegistration } from "@/lib/business-line";
import { limit } from "@/lib/rate-limit";

/** POST — re-check the registration with Telnyx right now (the card's Refresh button). */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`line-refresh:${actor.companyId}`, 20, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Checked very recently — the hourly sweep will pick it up." }, { status: 429 });
  }
  try {
    await refreshRegistration(actor.companyId);
    return NextResponse.json(await lineSummary(actor.companyId, { name: actor.name }));
  } catch (err) {
    if (err instanceof LineError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[line] refresh route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
