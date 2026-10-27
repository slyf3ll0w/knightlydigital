import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isAccentCode, isVoiceId } from "@/lib/atlas-voices";

/**
 * The listener's Atlas voice + accent, kept on their User row so the pick
 * follows them between the phone and the desk (David 2026-10-27: "the voice
 * type should save between devices"). The browser keeps a copy in
 * localStorage (lib/atlas-voices.ts) and syncs it here when the talk screen
 * opens; the token and speak routes fall back to this when a request
 * carries no pick.
 *
 * GET → { pick: { voice, accent } | null }
 * PUT { voice?, accent? } | { pick: null } → the same, after saving.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: actor.id }, select: { atlasVoice: true, atlasAccent: true } });
  return NextResponse.json({ pick: pickOf(u) });
}

export async function PUT(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { pick?: unknown; voice?: unknown; accent?: unknown };
  const clear = body.pick === null;
  const voice = isVoiceId(body.voice) ? body.voice : null;
  const accent = isAccentCode(body.accent) ? body.accent : null;
  if (!clear && !voice && !accent) return NextResponse.json({ error: "Pick a voice or an accent." }, { status: 400 });
  const u = await prisma.user.update({
    where: { id: actor.id },
    data: clear ? { atlasVoice: null, atlasAccent: null } : { atlasVoice: voice, atlasAccent: accent },
    select: { atlasVoice: true, atlasAccent: true },
  });
  return NextResponse.json({ pick: pickOf(u) });
}

function pickOf(u: { atlasVoice: string | null; atlasAccent: string | null } | null): { voice: string; accent: string } | null {
  if (!u || (!u.atlasVoice && !u.atlasAccent)) return null;
  return { voice: isVoiceId(u.atlasVoice) ? u.atlasVoice : "", accent: isAccentCode(u.atlasAccent) ? u.atlasAccent : "en-US" };
}
