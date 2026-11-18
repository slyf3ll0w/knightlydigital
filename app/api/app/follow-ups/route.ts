import { NextResponse } from "next/server";
import { getActor, canSeeMoney, canSell } from "@/lib/permissions";
import { loadFollowUps } from "@/lib/follow-ups-server";

/** GET — today's follow-ups for the signed-in person (lib/follow-ups.ts). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role) && !canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await loadFollowUps(actor));
}
