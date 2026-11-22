import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { loadSettingsView } from "@/lib/settings-view";

/**
 * GET — the Settings pop-up's data (components/SettingsPopup.tsx): the
 * company row, the business line summary, numbering high-water marks and
 * how this login can verify itself. Managers only, like the old page.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const view = await loadSettingsView(actor, req.headers.get("user-agent"));
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
