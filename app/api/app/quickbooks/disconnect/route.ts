import { NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { disconnectCompany } from "@/lib/quickbooks";

/**
 * Disconnect QuickBooks: revokes the grant at Intuit and deletes the
 * connection + all sync mappings. Reconnecting later re-matches entities
 * (customers by display name, invoices adopt nothing — they'd re-push), so
 * the settings page warns before calling this.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await disconnectCompany(actor.companyId);
  return NextResponse.json({ ok: true });
}
