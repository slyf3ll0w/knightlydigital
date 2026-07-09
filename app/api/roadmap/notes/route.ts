import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRoadmapEditor } from "@/lib/roadmap";

/** Add a roadmap note — allowlisted editors only. */
export async function POST(req: NextRequest) {
  if (!(await isRoadmapEditor())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const body = typeof raw?.body === "string" ? raw.body.trim().slice(0, 5000) : "";
  if (!body) return NextResponse.json({ error: "Note text is required." }, { status: 400 });

  const note = await prisma.roadmapNote.create({
    data: { body, isPublic: raw?.isPublic === true },
  });
  return NextResponse.json(note, { status: 201 });
}
