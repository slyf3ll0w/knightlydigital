import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { LineError, lineSummary, setCallerIdName, setLineForwarding, setVoicemailGreeting } from "@/lib/business-line";

/**
 * Business line (lib/business-line.ts), manager-only.
 *   GET   → the card's read model: number, forwarding, registration status
 *   PATCH → { forwardTo } — where inbound calls ring (null/"" switches forwarding off)
 *         → { greeting }  — the voicemail greeting (null/"" = default), lib/voice.ts
 *         → { callerIdName } — outbound caller-ID name (CNAM listing; "" = off)
 * Provisioning, registration, refresh and the OTP each have their own route
 * under /api/app/line/*.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await lineSummary(actor.companyId, { id: actor.id, name: actor.name }));
  } catch (err) {
    return lineErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { forwardTo?: unknown; greeting?: unknown; callerIdName?: unknown };
  try {
    if ("greeting" in body) {
      return NextResponse.json(await setVoicemailGreeting(actor.companyId, body.greeting));
    }
    if ("callerIdName" in body) {
      return NextResponse.json(await setCallerIdName(actor.companyId, body.callerIdName));
    }
    const forwardTo = typeof body.forwardTo === "string" && body.forwardTo.trim() ? body.forwardTo.trim() : null;
    const out = await setLineForwarding(actor.companyId, forwardTo);
    return NextResponse.json(out);
  } catch (err) {
    return lineErrorResponse(err);
  }
}

function lineErrorResponse(err: unknown): NextResponse {
  if (err instanceof LineError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[line] route error:", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
