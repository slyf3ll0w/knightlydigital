import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { createChannel, listChannels } from "@/lib/chat";

/** GET — the actor's thread list. POST — start a DM (one memberId, deduped)
 *  or a group chat (2+ memberIds, optional name). */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ channels: await listChannels(actor) });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const memberIds: string[] = Array.isArray(body?.memberIds)
    ? body.memberIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const name = typeof body?.name === "string" ? body.name : null;

  const result = await createChannel(actor, memberIds, name);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
