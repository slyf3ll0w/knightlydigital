import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, canSell } from "@/lib/permissions";
import { draftFollowUp } from "@/lib/follow-ups-server";


/**
 * POST { kind, id, channel?, standard? } — write the message for one
 * follow-up. Nothing is sent: the page shows the draft, the person edits it
 * and presses Send, which posts to the ordinary message / email route.
 * `standard: true` skips the model (no tokens spent).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => null);
  const kind = data?.kind === "invoice" ? "invoice" : data?.kind === "quote" ? "quote" : null;
  const id = typeof data?.id === "string" ? data.id.slice(0, 40) : "";
  if (!kind || !id) return NextResponse.json({ error: "Which quote or invoice?" }, { status: 400 });
  if (kind === "invoice" ? !canSeeMoney(actor) : !canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const channel = data?.channel === "text" || data?.channel === "email" ? data.channel : null;
  const res = await draftFollowUp(actor, kind, id, channel, { useModel: data?.standard !== true });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.draft);
}
