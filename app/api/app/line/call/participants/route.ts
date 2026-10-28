import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { VoiceError, addParticipant, addablePeople, muteParticipant, removeParticipant } from "@/lib/voice";

/**
 * Add a person to a live call (lib/voice.ts; plan
 * docs/plans/conference-calls-2026-10-28.md).
 *
 *   GET    ?callId=                       — teammates who could be added, with whether the app can reach them
 *   POST   { callId, userId | contactId | to } — ring them into the call (rate-limited: each dial costs minutes)
 *   DELETE { callId, participantId }      — hang their leg up / stop ringing them
 *   PATCH  { callId, participantId, mute } — mute or unmute them in the mix
 *
 * Anyone on the call may do these; owners and admins may from the Calls page.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const callId = req.nextUrl.searchParams.get("callId");
  if (!callId) return NextResponse.json({ error: "Missing callId" }, { status: 400 });
  try {
    return NextResponse.json(await addablePeople(actor.companyId, callId, actor.id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    reportError("[voice] addable people error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`line-add:${actor.id}`, 20, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many adds in a row — give it a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { callId?: unknown; userId?: unknown; contactId?: unknown; to?: unknown };
  if (typeof body.callId !== "string") return NextResponse.json({ error: "Missing callId" }, { status: 400 });
  try {
    const participant = await addParticipant(
      actor.companyId,
      body.callId,
      { id: actor.id, role: actor.role, name: actor.name },
      {
        userId: typeof body.userId === "string" ? body.userId : null,
        contactId: typeof body.contactId === "string" ? body.contactId : null,
        to: typeof body.to === "string" ? body.to : null,
      }
    );
    return NextResponse.json({ participant }, { status: 201 });
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    reportError("[voice] add participant route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { callId?: unknown; participantId?: unknown };
  if (typeof body.callId !== "string" || typeof body.participantId !== "string") return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  try {
    const participant = await removeParticipant(actor.companyId, body.callId, { id: actor.id, role: actor.role }, body.participantId);
    return NextResponse.json({ participant });
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    reportError("[voice] remove participant route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { callId?: unknown; participantId?: unknown; mute?: unknown };
  if (typeof body.callId !== "string" || typeof body.participantId !== "string") return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  try {
    return NextResponse.json(await muteParticipant(actor.companyId, body.callId, { id: actor.id, role: actor.role }, body.participantId, body.mute !== false));
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    reportError("[voice] mute participant route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
