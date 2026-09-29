import { NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { loadInbox } from "@/lib/inbox";

/**
 * The inbox rows (lib/inbox.ts) for the Messages page's in-place refresh:
 * it polls `/api/app/messages/latest` and, when the stamp moves, swaps in
 * these rows instead of re-rendering the route.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await loadInbox(actor);
  return NextResponse.json({ rows, stamp: rows[0]?.at ?? null });
}
