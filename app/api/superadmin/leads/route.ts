import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { ensureConsoleStages, statusForStage } from "@/lib/console-leads";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Add a lead to the console board by hand. Body: { name, email?, phone?, businessName?, notes?, stageId? }. */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = str(body.name, 120);
  if (!name) return NextResponse.json({ error: "Give the lead a name." }, { status: 400 });
  const email = str(body.email, 254).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }

  const stages = await ensureConsoleStages();
  const wanted = typeof body.stageId === "string" ? await statusForStage(body.stageId) : null;
  const first = stages.find((s) => !s.isWon)!;
  const placed = wanted ?? { status: "OPEN" as const, stageId: first.id };

  const lead = await prisma.consoleLead.create({
    data: {
      name,
      email,
      phone: str(body.phone, 30) || null,
      businessName: str(body.businessName, 120) || null,
      notes: str(body.notes, 4000) || null,
      source: "manual",
      stageId: placed.stageId,
      status: placed.status,
      wonAt: placed.status === "WON" ? new Date() : null,
    },
    select: { id: true },
  });
  logConsoleAction(admin, "lead-add", { detail: name });
  return NextResponse.json({ id: lead.id });
}
