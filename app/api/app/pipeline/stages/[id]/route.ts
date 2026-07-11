import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { isValidHex, PIPELINE_TRIGGERS } from "@/lib/pipeline";

/**
 * PATCH — rename/recolor a stage or change its auto-advance trigger.
 * Body: { name?, color? (hex or null), autoAdvanceOn? (trigger or null) }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const stage = await prisma.pipelineStage.findFirst({ where: { id, companyId } });
  if (!stage) return NextResponse.json({ error: "Stage not found." }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: "The stage needs a name." }, { status: 400 });
    const dupe = await prisma.pipelineStage.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" }, NOT: { id } },
    });
    if (dupe) return NextResponse.json({ error: "A stage with that name already exists." }, { status: 400 });
    data.name = name;
  }
  if (body.color !== undefined) {
    if (body.color !== null && !isValidHex(body.color)) {
      return NextResponse.json({ error: "Color must be a hex value like #22C55E." }, { status: 400 });
    }
    data.color = body.color;
  }

  let trigger: string | null | undefined;
  if (body.autoAdvanceOn !== undefined) {
    if (stage.isConverted && body.autoAdvanceOn !== null) {
      return NextResponse.json(
        { error: "The Converted section fills itself — approvals and first jobs land leads there." },
        { status: 400 }
      );
    }
    if (body.autoAdvanceOn !== null && !(PIPELINE_TRIGGERS as readonly string[]).includes(body.autoAdvanceOn)) {
      return NextResponse.json({ error: "Invalid trigger." }, { status: 400 });
    }
    trigger = body.autoAdvanceOn;
    data.autoAdvanceOn = trigger;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (trigger) {
      // One stage per trigger: claiming it releases it elsewhere
      await tx.pipelineStage.updateMany({
        where: { companyId, autoAdvanceOn: trigger as never, NOT: { id } },
        data: { autoAdvanceOn: null },
      });
    }
    return tx.pipelineStage.update({ where: { id }, data });
  });

  return NextResponse.json(updated);
}

/**
 * DELETE — remove a stage. Its cards move to the board's first remaining
 * stage; the last stage can't be deleted (a board needs a column).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const stage = await prisma.pipelineStage.findFirst({ where: { id, companyId } });
  if (!stage) return NextResponse.json({ error: "Stage not found." }, { status: 404 });
  if (stage.isConverted) {
    return NextResponse.json(
      { error: "The Converted section can't be deleted — hide it in settings instead." },
      { status: 400 }
    );
  }

  const fallback = await prisma.pipelineStage.findFirst({
    where: { companyId, NOT: { id }, isConverted: false },
    orderBy: { sortOrder: "asc" },
  });
  if (!fallback) {
    return NextResponse.json({ error: "A board needs at least one stage." }, { status: 400 });
  }

  const moved = await prisma.$transaction(async (tx) => {
    const res = await tx.contact.updateMany({
      where: { companyId, pipelineStageId: id },
      data: { pipelineStageId: fallback.id, stageChangedAt: new Date() },
    });
    await tx.pipelineStage.delete({ where: { id } });
    return res.count;
  });

  return NextResponse.json({ success: true, movedTo: fallback.name, moved });
}
