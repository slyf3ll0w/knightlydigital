import { NextResponse } from "next/server";
import { callLogStamp } from "@/lib/call-pulse";
import { getActor, canSell } from "@/lib/permissions";

/**
 * GET — a fingerprint of the company's call log: the newest updatedAt plus
 * the row count. The Calls page polls this (components/CallsLive.tsx) and
 * re-renders itself only when it changes, so a call that just started, got
 * answered, or ended shows up without anyone reloading. One aggregate on an
 * indexed column; cheap enough to ask every few seconds.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(
    { stamp: await callLogStamp(actor.companyId) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
