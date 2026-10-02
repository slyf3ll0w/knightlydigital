import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { getRecentTitles } from "@/lib/recent-titles";

/** GET — the signed-in user's recently typed appointment purposes + job titles. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getRecentTitles(actor.id));
}
