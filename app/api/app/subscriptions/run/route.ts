import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { runDueSubscriptions, generateDueVisits } from "@/lib/subscriptions";

/**
 * POST — manually run all due subscriptions for this company (the "Run now"
 * button): billing cycles + upcoming visit-series jobs. Lets owners catch up
 * and test the engine without waiting on the cron. Managers only.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const summary = await runDueSubscriptions(now, actor.companyId);
  const visits = await generateDueVisits(now, actor.companyId);
  return NextResponse.json({ ok: true, ...summary, visits });
}
