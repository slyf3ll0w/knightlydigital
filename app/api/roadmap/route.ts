import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRoadmapEditor, ROADMAP_CATEGORIES } from "@/lib/roadmap";

/** Public board data — anyone can read; private notes only go to editors. */
export async function GET() {
  const canEdit = await isRoadmapEditor();
  const items = await prisma.roadmapItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({
    items: canEdit ? items : items.map(({ privateNotes: _, ...rest }) => rest),
  });
}

/** Add an item — allowlisted editors only. */
export async function POST(req: NextRequest) {
  if (!(await isRoadmapEditor())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const details =
    typeof body?.details === "string" && body.details.trim()
      ? body.details.trim().slice(0, 2000)
      : null;
  const privateNotes =
    typeof body?.privateNotes === "string" && body.privateNotes.trim()
      ? body.privateNotes.trim().slice(0, 5000)
      : null;
  const category = ROADMAP_CATEGORIES.includes(body?.category) ? body.category : null;
  if (!title || !category) {
    return NextResponse.json({ error: "Title and category are required." }, { status: 400 });
  }

  const item = await prisma.roadmapItem.create({
    data: { title, details, privateNotes, category },
  });
  return NextResponse.json(item, { status: 201 });
}
