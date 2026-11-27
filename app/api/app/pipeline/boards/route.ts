import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";
import { createBoard, ensureStages, listBoards, MAIN_BOARD_NAME, MAX_BOARDS } from "@/lib/pipeline";

/**
 * Leads boards (lib/pipeline.ts, ticket #p6pp98).
 *
 *   GET  → { boards: [{ id: null, name: "Main board", main: true, … }, …] }
 *          each with its open-lead count, its sources and the forms that
 *          send leads to it.
 *   POST { name } → a new board with the starter columns (managers).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  const [stages, boards, forms] = await Promise.all([
    ensureStages(companyId),
    listBoards(prisma, companyId),
    prisma.bookingType.findMany({ where: { companyId, leadBoardId: { not: null } }, select: { id: true, name: true, leadBoardId: true } }),
  ]);
  const counts = await prisma.contact.groupBy({
    by: ["pipelineStageId"],
    where: { companyId, pipelineStageId: { in: stages.filter((s) => !s.isConverted).map((s) => s.id) } },
    _count: { _all: true },
  });
  const perStage = new Map(counts.map((c) => [c.pipelineStageId, c._count._all]));
  const open = (boardId: string | null) =>
    stages.filter((s) => !s.isConverted && (s.boardId ?? null) === boardId).reduce((n, s) => n + (perStage.get(s.id) ?? 0), 0);
  return NextResponse.json(
    {
      boards: [
        { id: null, name: MAIN_BOARD_NAME, main: true, open: open(null), sources: [], forms: [] },
        ...boards.map((b) => ({
          id: b.id,
          name: b.name,
          main: false,
          open: open(b.id),
          sources: b.sources,
          forms: forms.filter((f) => f.leadBoardId === b.id).map((f) => ({ id: f.id, name: f.name })),
        })),
      ],
      max: MAX_BOARDS,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return NextResponse.json({ error: "The board needs a name." }, { status: 400 });
  await ensureStages(companyId); // the main board exists before any other
  const boards = await listBoards(prisma, companyId);
  if (boards.length >= MAX_BOARDS) return NextResponse.json({ error: `You can have up to ${MAX_BOARDS} extra boards. Remove one first.` }, { status: 400 });
  if (name.toLowerCase() === MAIN_BOARD_NAME.toLowerCase() || boards.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "A board with that name already exists." }, { status: 400 });
  }
  const board = await createBoard(companyId, name);
  return NextResponse.json({ board: { id: board.id, name: board.name, main: false, open: 0, sources: [], forms: [] } }, { status: 201 });
}
