import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { statusForStage } from "@/lib/console-leads";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * One card on the console lead board. Body, one of:
 *  - { stageId }                       move it (into the Won column = won, out of it = open again)
 *  - { action: "lost", reason? }       take it off the board
 *  - { action: "reopen", stageId }     put a lost card back
 *  - { name?, email?, phone?, businessName?, notes? }   edit the details
 * Every move answers with `undo` (the card's column and status before it)
 * so the board's toast can put it back.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lead = await prisma.consoleLead.findUnique({
    where: { id },
    select: { id: true, name: true, stageId: true, status: true },
  });
  if (!lead) return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
  const undo = { stageId: lead.stageId, status: lead.status };

  const body = await req.json().catch(() => ({}));
  const now = new Date();

  if (body.action === "lost") {
    await prisma.consoleLead.update({
      where: { id },
      data: { status: "LOST", lostAt: now, lostReason: str(body.reason, 300) || null },
    });
    logConsoleAction(admin, "lead-lost", { detail: lead.name });
    return NextResponse.json({ ok: true, undo });
  }

  if (typeof body.stageId === "string") {
    const placed = await statusForStage(body.stageId);
    if (!placed) return NextResponse.json({ error: "That column is gone. Refresh the board." }, { status: 400 });
    const reopening = lead.status === "LOST";
    if (!reopening && placed.stageId === lead.stageId) return NextResponse.json({ ok: true, undo });
    await prisma.consoleLead.update({
      where: { id },
      data: {
        stageId: placed.stageId,
        stageChangedAt: now,
        status: placed.status,
        wonAt: placed.status === "WON" ? now : null,
        ...(reopening ? { lostAt: null, lostReason: null } : {}),
      },
    });
    logConsoleAction(admin, placed.status === "WON" ? "lead-won" : reopening ? "lead-reopen" : "lead-move", { detail: lead.name });
    return NextResponse.json({ ok: true, undo });
  }

  const data: Record<string, string | null> = {};
  if ("name" in body) {
    const name = str(body.name, 120);
    if (!name) return NextResponse.json({ error: "Give the lead a name." }, { status: 400 });
    data.name = name;
  }
  if ("email" in body) {
    const email = str(body.email, 254).toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    }
    data.email = email;
  }
  if ("phone" in body) data.phone = str(body.phone, 30) || null;
  if ("businessName" in body) data.businessName = str(body.businessName, 120) || null;
  if ("notes" in body) data.notes = str(body.notes, 4000) || null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await prisma.consoleLead.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lead = await prisma.consoleLead.findUnique({ where: { id }, select: { name: true } });
  if (!lead) return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
  await prisma.consoleLead.delete({ where: { id } });
  logConsoleAction(admin, "lead-delete", { detail: lead.name });
  return NextResponse.json({ ok: true });
}
