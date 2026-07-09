import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { resolveThread, markTyping } from "@/lib/chat";

/** Heartbeat while composing — in-memory only, read back by the chat poll. */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const resolved = await resolveThread(actor, typeof body?.thread === "string" ? body.thread : null);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 404 });

  markTyping(actor.companyId, actor.id, resolved.peerId);
  return NextResponse.json({ ok: true });
}
