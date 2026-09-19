import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { VoiceError, startOutboundCall } from "@/lib/voice";

/**
 * POST { contactId } | { to } — call a client from the business line
 * (lib/voice.ts startOutboundCall): rings the signed-in user's cell first,
 * whispers who they're calling, then rings the client and bridges. Anyone
 * who can see clients can place a call; the customer sees the business
 * number. Rate-limited: every call past the checks costs minutes.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`line-call:${actor.id}`, 30, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many calls in a row — give it a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { contactId?: unknown; to?: unknown };
  try {
    const out = await startOutboundCall(actor.companyId, actor.id, {
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      to: typeof body.to === "string" ? body.to : null,
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[voice] call route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
