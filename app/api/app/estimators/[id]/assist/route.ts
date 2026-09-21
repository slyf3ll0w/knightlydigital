import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { specFromJson } from "@/lib/estimator";
import { readAssistImage, runAssist } from "@/lib/estimator-assist";

/**
 * POST { description?, imageBase64?, imageMime? } — the METERED half of an
 * estimate tool. The user describes the job in words and/or attaches a
 * photo; Atlas reads the tool's inputs and fills in what the evidence
 * supports (lib/estimator-assist.ts). Only tools whose spec opted into
 * `assist` accept this. The compute that follows is the free /run route —
 * this call only proposes input values, which the user sees and can change.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.estimator.findFirst({
    where: { id, companyId: actor.companyId, isActive: true },
    select: { id: true, name: true, spec: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const spec = specFromJson(row.spec);
  if (!spec) return NextResponse.json({ error: "This tool's saved rules no longer compile." }, { status: 409 });
  if (!spec.assist) return NextResponse.json({ error: "This tool doesn't use Atlas — fill in the inputs directly (it's free)." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 3000) : "";
  const image = readAssistImage(body);
  if (image === "bad") return NextResponse.json({ error: "That photo couldn't be read — use a JPEG, PNG or WebP under 2 MB." }, { status: 400 });
  if (description.length < 8 && !image) return NextResponse.json({ error: "Describe the job in a sentence or two, or attach a photo." }, { status: 400 });

  const out = await runAssist(actor, spec, row.name, description, image);
  if (!out.ok) {
    return NextResponse.json({ error: out.error, ...(out.access ? { access: out.access } : {}), ...(out.atlasLocked ? { atlasLocked: true } : {}) }, { status: out.status });
  }
  void prisma.estimator.update({ where: { id: row.id }, data: { assists: { increment: 1 } } }).catch(() => {});
  return NextResponse.json({ values: out.values, notes: out.notes, skipped: out.skipped, turnTokens: out.turnTokens, access: out.access });
}
