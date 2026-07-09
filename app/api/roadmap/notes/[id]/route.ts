import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRoadmapEditor } from "@/lib/roadmap";

/** Edit a note or move it between public/private — editors only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isRoadmapEditor())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof raw?.body === "string" && raw.body.trim()) {
    data.body = raw.body.trim().slice(0, 5000);
  }
  if (typeof raw?.isPublic === "boolean") data.isPublic = raw.isPublic;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const note = await prisma.roadmapNote.update({ where: { id }, data });
    return NextResponse.json(note);
  } catch {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
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
  await prisma.roadmapNote.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
