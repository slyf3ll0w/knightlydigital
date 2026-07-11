import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { resolveChannel, markTyping } from "@/lib/chat";

/** Heartbeat while composing — in-memory only, read back by the chat poll. */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const channel = await resolveChannel(
    actor,
    typeof body?.channel === "string" ? body.channel : null
  );
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });

  markTyping(channel.id, actor.id);
  return NextResponse.json({ ok: true });
}
