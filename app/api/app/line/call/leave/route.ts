import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { VoiceError, leaveCall } from "@/lib/voice";

/**
 * POST { id } — Leave a call that has other people on it with the customer
 * (lib/voice.ts leaveCall): only the caller's leg drops. If the one leaving
 * answered the call and a teammate is on it, the call is handed to them —
 * the warm transfer. With nobody else on, this is an ordinary hang-up.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    return NextResponse.json(await leaveCall(actor.companyId, body.id, actor.id));
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    reportError("[voice] leave route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
