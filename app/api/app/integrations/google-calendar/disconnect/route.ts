import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { disconnectUser } from "@/lib/google-calendar";

/**
 * Disconnect Google Calendar: deletes the events Workbench created there
 * (best effort), revokes the grant, forgets the tokens. The card confirms
 * before calling this.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await disconnectUser(actor.id);
  return NextResponse.json({ ok: true });
}
