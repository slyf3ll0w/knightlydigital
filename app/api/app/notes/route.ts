import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { checkFeature } from "@/lib/plan-gate";
import { companyTz } from "@/lib/tasks";
import {
  capReached,
  clampSize,
  listNotes,
  noteInclude,
  parseExpiry,
  randomRotation,
  serializeNote,
  validateBody,
  validateColor,
  validatePage,
  validatePos,
} from "@/lib/sticky-notes";

/**
 * GET ?page=/app/jobs/abc — the viewer's notes on that page (own + team,
 * unexpired) with their own placements. POST { body, page, x?, y?, color?,
 * shared?, width?, height?, expiry?, expiryDate? } — stick a note.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const page = validatePage(req.nextUrl.searchParams.get("page") ?? "/app/dashboard") ?? "/app/dashboard";
  const tz = await companyTz(actor.companyId);
  return NextResponse.json({ notes: await listNotes(actor, page, tz), page });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const text = validateBody(body.body);
  if ("error" in text) return NextResponse.json({ error: text.error }, { status: 400 });
  const color = validateColor(body.color) ?? "YELLOW";
  const shared = body.shared === true;
  const page = validatePage(body.page ?? "/app/dashboard");
  if (!page) return NextResponse.json({ error: "That page can't hold notes." }, { status: 400 });
  if (shared) {
    // Dark until PLAN_GATING=1 (lib/plan-gate.ts)
    const gate = await checkFeature(actor.companyId, "team_notes");
    if (!gate.ok) return gate.response;
  }
  const full = await capReached(actor, shared);
  if (full) return NextResponse.json({ error: full }, { status: 400 });
  const tz = await companyTz(actor.companyId);
  const expiry = parseExpiry(body.expiry, body.expiryDate, tz);
  if (expiry && "error" in expiry) return NextResponse.json({ error: expiry.error }, { status: 400 });

  const note = await prisma.stickyNote.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      body: text.body,
      color,
      shared,
      page,
      x: validatePos(body.x),
      y: validatePos(body.y),
      width: clampSize(body.width),
      height: clampSize(body.height),
      expiresAt: expiry?.expiresAt ?? null,
      rotation: randomRotation(),
    },
    include: noteInclude,
  });
  return NextResponse.json({ note: serializeNote(note, actor, null, tz) }, { status: 201 });
}
