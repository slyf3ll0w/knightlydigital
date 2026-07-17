import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { syncCompany } from "@/lib/quickbooks";

/** Manual "Sync now" from Settings → QuickBooks. */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const summary = await syncCompany(actor.companyId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
