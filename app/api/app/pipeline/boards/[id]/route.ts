import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { deleteBoard, listBoards, MAIN_BOARD_NAME } from "@/lib/pipeline";
import { canonicalLeadSource } from "@/lib/lead-source";

/**
 * One extra leads board (managers).
 *
 *   PATCH { name?, sources? } → rename it, or set the lead sources whose new
 *          leads land on it (a source can belong to one board: naming it
 *          here takes it off any other).
 *   DELETE → its leads move to the first column of the main board, its
 *          columns go with it, forms that pointed at it go back to the main
 *          board.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  const { id } = await params;
  const board = await prisma.leadBoard.findFirst({ where: { id, companyId } });
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { name?: unknown; sources?: unknown } | null;
  const data: { name?: string; sources?: string[] } = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: "The board needs a name." }, { status: 400 });
    const others = (await listBoards(prisma, companyId)).filter((b) => b.id !== id);
    if (name.toLowerCase() === MAIN_BOARD_NAME.toLowerCase() || others.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "A board with that name already exists." }, { status: 400 });
    }
    data.name = name;
  }
  if (body?.sources !== undefined) {
    if (!Array.isArray(body.sources)) return NextResponse.json({ error: "sources must be a list." }, { status: 400 });
    const seen = new Set<string>();
    const sources: string[] = [];
    for (const raw of body.sources.slice(0, 30)) {
      const s = typeof raw === "string" ? canonicalLeadSource(raw) : "";
      if (!s || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      sources.push(s);
    }
    data.sources = sources;
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (data.sources?.length) {
      // One board per source: take these off every other board
      const lower = new Set(data.sources.map((s) => s.toLowerCase()));
      const others = await tx.leadBoard.findMany({ where: { companyId, NOT: { id } }, select: { id: true, sources: true } });
      for (const o of others) {
        const kept = o.sources.filter((s) => !lower.has(s.toLowerCase()));
        if (kept.length !== o.sources.length) await tx.leadBoard.update({ where: { id: o.id }, data: { sources: kept } });
      }
    }
    return tx.leadBoard.update({ where: { id }, data });
  });
  return NextResponse.json({ board: { id: updated.id, name: updated.name, sources: updated.sources } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const board = await prisma.leadBoard.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  const { moved } = await deleteBoard(actor.companyId, id);
  return NextResponse.json({ success: true, moved, movedTo: MAIN_BOARD_NAME });
}
