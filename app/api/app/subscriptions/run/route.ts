import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { runDueSubscriptions } from "@/lib/subscriptions";

/**
 * POST — manually run all due subscriptions for this company (the "Run now"
 * button). Lets owners catch up billing and test the engine without waiting on
 * the cron. Managers only.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = await runDueSubscriptions(new Date(), actor.companyId);
  return NextResponse.json({ ok: true, ...summary });
}
