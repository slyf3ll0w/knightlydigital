import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRoadmapEditor, ROADMAP_CATEGORIES } from "@/lib/roadmap";

/** Edit / check off a roadmap item — allowlisted editors only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isRoadmapEditor())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) {
    data.title = body.title.trim().slice(0, 200);
  }
  if (typeof body?.details === "string") {
    data.details = body.details.trim() ? body.details.trim().slice(0, 2000) : null;
  }
  if (ROADMAP_CATEGORIES.includes(body?.category)) data.category = body.category;
  // The checkbox: shipped=true stamps shippedAt, false puts it back in Upcoming
  if (typeof body?.shipped === "boolean") data.shippedAt = body.shipped ? new Date() : null;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const item = await prisma.roadmapItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isRoadmapEditor())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.roadmapItem.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
