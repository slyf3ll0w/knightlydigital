import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { cleanStageInput, ensureConsoleStages } from "@/lib/console-leads";

/**
 * Save the console lead board's columns (the Customize sheet). Body:
 * { stages: [{ id?, name, color? }] in order, won: { name, color? } }.
 * A column missing from the list is deleted and its cards move to the first
 * column; the Won column can be renamed and recolored but never removed.
 */
export async function PUT(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clean = cleanStageInput(await req.json().catch(() => null));
  if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 });

  const current = await ensureConsoleStages();
  const won = current.find((s) => s.isWon)!;
  const known = new Set(current.filter((s) => !s.isWon).map((s) => s.id));

  await prisma.$transaction(async (tx) => {
    const keptIds: string[] = [];
    for (let i = 0; i < clean.stages.length; i++) {
      const s = clean.stages[i];
      if (s.id && known.has(s.id)) {
        await tx.consoleLeadStage.update({ where: { id: s.id }, data: { name: s.name, color: s.color, sortOrder: i } });
        keptIds.push(s.id);
      } else {
        const made = await tx.consoleLeadStage.create({ data: { name: s.name, color: s.color, sortOrder: i }, select: { id: true } });
        keptIds.push(made.id);
      }
    }
    await tx.consoleLeadStage.update({ where: { id: won.id }, data: { name: clean.won.name, color: clean.won.color, sortOrder: 9999 } });
    const removed = [...known].filter((id) => !keptIds.includes(id));
    if (removed.length) {
      await tx.consoleLead.updateMany({ where: { stageId: { in: removed } }, data: { stageId: keptIds[0] } });
      await tx.consoleLeadStage.deleteMany({ where: { id: { in: removed } } });
    }
  });

  logConsoleAction(admin, "lead-stages", { detail: [...clean.stages.map((s) => s.name), clean.won.name].join(" → ") });
  return NextResponse.json({ ok: true });
}
