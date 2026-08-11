import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { billAllReadyWork } from "@/lib/subscriptions";
import { inPreview, previewBlockedError } from "@/lib/preview";

/**
 * POST — the "Bill ready work" button: invoice (and auto-charge) every
 * per-visit series' completed, unbilled visits — one invoice per series,
 * dated line per visit. The owner's clicking cadence IS the billing cadence.
 * Managers only.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Billing"), { status: 403 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = await billAllReadyWork(actor.companyId);
  return NextResponse.json({ ok: true, ...summary });
}
