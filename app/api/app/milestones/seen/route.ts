import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isMilestoneKey } from "@/lib/milestones";

/**
 * Stamps this user's milestone as seen (fired by components/MilestoneMoment
 * once the card has been on screen, or when it's closed). Per-user, one row
 * per milestone key in CelebrationSeen (kind MILESTONE). Only well-formed
 * keys are stored; a key carries no company data, so nothing to scope.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = body?.key;
  if (!isMilestoneKey(key)) return NextResponse.json({ error: "Bad key" }, { status: 400 });
  await prisma.celebrationSeen.upsert({
    where: { userId_kind_entityId: { userId: actor.id, kind: "MILESTONE", entityId: key } },
    create: { userId: actor.id, kind: "MILESTONE", entityId: key },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
