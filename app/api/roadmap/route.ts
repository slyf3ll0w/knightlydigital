import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRoadmapEditor, ROADMAP_CATEGORIES } from "@/lib/roadmap";

/** Public board data — anyone can read the roadmap. */
export async function GET() {
  const items = await prisma.roadmapItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items });
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
  const category = ROADMAP_CATEGORIES.includes(body?.category) ? body.category : null;
  if (!title || !category) {
    return NextResponse.json({ error: "Title and category are required." }, { status: 400 });
  }

  const item = await prisma.roadmapItem.create({
    data: { title, details, category },
  });
  return NextResponse.json(item, { status: 201 });
}
