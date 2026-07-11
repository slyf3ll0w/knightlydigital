import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";
import { ensureStages, isValidHex, MAX_STAGES, PIPELINE_TRIGGERS } from "@/lib/pipeline";

/** GET — the company's pipeline stages (seeding defaults on first use). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stages = await ensureStages(actor.companyId);
  return NextResponse.json(stages);
}

/**
 * POST — add a stage to the board.
 * Body: { name, color?, autoAdvanceOn? } — new stages append to the end.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return NextResponse.json({ error: "The stage needs a name." }, { status: 400 });

  const existing = (await ensureStages(companyId)).filter((s) => !s.isConverted);
  if (existing.length >= MAX_STAGES) {
    return NextResponse.json(
      { error: `A board holds up to ${MAX_STAGES} stages — remove one first.` },
      { status: 400 }
    );
  }
  if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase()) || name.toLowerCase() === "converted") {
    return NextResponse.json({ error: "A stage with that name already exists." }, { status: 400 });
  }

  const autoAdvanceOn = (PIPELINE_TRIGGERS as readonly string[]).includes(body.autoAdvanceOn)
    ? (body.autoAdvanceOn as (typeof PIPELINE_TRIGGERS)[number])
    : null;

  const stage = await prisma.$transaction(async (tx) => {
    // One stage per trigger: claiming a trigger releases it elsewhere
    if (autoAdvanceOn) {
      await tx.pipelineStage.updateMany({
        where: { companyId, autoAdvanceOn },
        data: { autoAdvanceOn: null },
      });
    }
    return tx.pipelineStage.create({
      data: {
        companyId,
        name,
        color: isValidHex(body.color) ? body.color : null,
        sortOrder: (existing[existing.length - 1]?.sortOrder ?? -1) + 1,
        autoAdvanceOn,
      },
    });
  });

  return NextResponse.json(stage, { status: 201 });
}
