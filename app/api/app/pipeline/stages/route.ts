import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";
import { ensureStages, isValidHex, MAX_STAGES, PIPELINE_TRIGGERS, stagesOfBoard } from "@/lib/pipeline";

/** "main" / "" / absent → the main board (null); otherwise a board id of this company, or undefined when it isn't one. */
async function boardFromParam(companyId: string, raw: unknown): Promise<string | null | undefined> {
  if (typeof raw !== "string" || !raw || raw === "main") return null;
  const board = await prisma.leadBoard.findFirst({ where: { id: raw, companyId }, select: { id: true } });
  return board ? board.id : undefined;
}

/** GET — the company's pipeline stages (seeding defaults on first use). `?board=<id|main>` narrows to one board's columns plus Converted. */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stages = await ensureStages(actor.companyId);
  const asked = req.nextUrl.searchParams.get("board");
  if (asked === null) return NextResponse.json(stages);
  const boardId = await boardFromParam(actor.companyId, asked);
  if (boardId === undefined) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  return NextResponse.json(stagesOfBoard(stages, boardId));
}

/**
 * POST — add a stage to the board.
 * Body: { name, color?, autoAdvanceOn?, boardId? } — new stages append to the
 * end of that board (the main board when boardId is absent). Names, the
 * stage limit and "one stage per trigger" are all per board.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return NextResponse.json({ error: "The stage needs a name." }, { status: 400 });

  const boardId = await boardFromParam(companyId, body.boardId);
  if (boardId === undefined) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  const existing = (await ensureStages(companyId)).filter((s) => !s.isConverted && (s.boardId ?? null) === boardId);
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
        where: { companyId, autoAdvanceOn, boardId },
        data: { autoAdvanceOn: null },
      });
    }
    return tx.pipelineStage.create({
      data: {
        companyId,
        boardId,
        name,
        color: isValidHex(body.color) ? body.color : null,
        sortOrder: (existing[existing.length - 1]?.sortOrder ?? -1) + 1,
        autoAdvanceOn,
      },
    });
  });

  return NextResponse.json(stage, { status: 201 });
}
