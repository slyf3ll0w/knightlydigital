import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { recordLeadWin, recordLeadLoss } from "@/lib/pipeline";

/**
 * PATCH — move a lead's card on the pipeline board.
 * Body, one of:
 *   { stageId }                      — drag to a column (card lands on top)
 *   { action: "won" }                — closes the lead → ACTIVE client
 *   { action: "lost", reason? }      — lead archives; repeat client stays ACTIVE
 *   { action: "reopen", stageId }    — undo of won/lost onto a working stage
 *                                      (win history restored server-side)
 * Sales/USER roles can only move their own leads (contactScope).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId, ...contactScope(actor) },
    select: {
      id: true, status: true, pipelineStageId: true,
      wonAt: true, lostAt: true, lostReason: true, timesWon: true,
    },
  });
  if (!contact) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const body = await req.json();
  const action = typeof body.action === "string" ? body.action : "move";

  // Undo snapshot — enough to restore the card exactly where it was
  const undo = {
    stageId: contact.pipelineStageId,
    status: contact.status,
    wonAt: contact.wonAt?.toISOString() ?? null,
    lostAt: contact.lostAt?.toISOString() ?? null,
    lostReason: contact.lostReason,
    timesWon: contact.timesWon,
  };

  if (action === "won") {
    if (!contact.pipelineStageId && contact.status !== "LEAD") {
      return NextResponse.json({ error: "This contact isn't on the board." }, { status: 400 });
    }
    await recordLeadWin(prisma, companyId, contact);
    return NextResponse.json({ success: true, undo });
  }

  if (action === "lost") {
    if (!contact.pipelineStageId) {
      return NextResponse.json({ error: "This contact isn't on the board." }, { status: 400 });
    }
    await recordLeadLoss(prisma, contact, typeof body.reason === "string" ? body.reason : null);
    return NextResponse.json({ success: true, undo });
  }

  if (action === "reopen") {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: String(body.stageId ?? ""), companyId, isConverted: false },
    });
    if (!stage) return NextResponse.json({ error: "Stage not found." }, { status: 404 });
    // Win history is derived from the contact's current state, never from the
    // request: undoing a loss keeps it, undoing a win rolls the counter back —
    // otherwise the undone win reads as a Repeat forever after
    const undoingLoss = contact.lostAt !== null;
    const timesWon = undoingLoss ? contact.timesWon : Math.max(0, contact.timesWon - 1);
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        status: timesWon > 0 ? "ACTIVE" : "LEAD",
        pipelineStageId: stage.id,
        stageChangedAt: new Date(),
        wonAt: timesWon > 0 ? contact.wonAt : null,
        lostAt: null,
        lostReason: null,
        timesWon,
      },
    });
    return NextResponse.json({ success: true });
  }

  // Plain move
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: String(body.stageId ?? ""), companyId },
  });
  if (!stage) return NextResponse.json({ error: "Stage not found." }, { status: 404 });
  if (stage.id === contact.pipelineStageId) return NextResponse.json({ success: true, undo });

  // Dragging into the Converted section IS winning the lead
  if (stage.isConverted) {
    await recordLeadWin(prisma, companyId, contact);
    return NextResponse.json({ success: true, undo });
  }

  const top = await prisma.contact.findFirst({
    where: { companyId, pipelineStageId: stage.id },
    orderBy: { pipelineOrder: "asc" },
    select: { pipelineOrder: true },
  });
  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: stage.id,
      pipelineOrder: (top?.pipelineOrder ?? 1) - 1,
      stageChangedAt: new Date(),
      // Dragging an off-board archived lead back on resurrects it
      ...(contact.status === "ARCHIVED" && { status: "LEAD", lostAt: null, lostReason: null }),
    },
  });
  return NextResponse.json({ success: true, undo });
}
