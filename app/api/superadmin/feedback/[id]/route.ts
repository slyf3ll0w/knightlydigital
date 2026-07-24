import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { ROADMAP_CATEGORIES } from "@/lib/roadmap";

/**
 * Review a feedback ticket. "approve" posts an (edited) item onto the public
 * Upcoming Features board and marks the ticket PLANNED; resolve/decline just
 * close it out. An optional `response` on any decision shows up on the
 * submitter's /app/support list.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const response =
    typeof body.response === "string" && body.response.trim()
      ? body.response.trim().slice(0, 2000)
      : null;

  const ticket = await prisma.feedbackTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  if (action === "approve") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const details =
      typeof body.details === "string" && body.details.trim()
        ? body.details.trim().slice(0, 2000)
        : null;
    const privateNotes =
      typeof body.privateNotes === "string" && body.privateNotes.trim()
        ? body.privateNotes.trim().slice(0, 5000)
        : null;
    const category = ROADMAP_CATEGORIES.includes(body.category) ? body.category : null;
    if (!title || !category) {
      return NextResponse.json({ error: "Title and category are required." }, { status: 400 });
    }
    const item = await prisma.roadmapItem.create({
      data: { title, details, privateNotes, category },
    });
    const updated = await prisma.feedbackTicket.update({
      where: { id },
      data: { status: "PLANNED", roadmapItemId: item.id, ...(response ? { response } : {}) },
    });
    return NextResponse.json({ ticket: updated, roadmapItem: item });
  }

  if (action === "resolve" || action === "decline") {
    const updated = await prisma.feedbackTicket.update({
      where: { id },
      data: {
        status: action === "resolve" ? "RESOLVED" : "DECLINED",
        ...(response ? { response } : {}),
      },
    });
    return NextResponse.json({ ticket: updated });
  }

  if (action === "reply") {
    // Add/edit the reply on an already-decided ticket; empty clears it.
    const updated = await prisma.feedbackTicket.update({
      where: { id },
      data: { response },
    });
    return NextResponse.json({ ticket: updated });
  }

  if (action === "reopen") {
    // Deliberately leaves any posted board item in place — pull it from the
    // roadmap page if it shouldn't be public anymore.
    const updated = await prisma.feedbackTicket.update({
      where: { id },
      data: { status: "OPEN" },
    });
    return NextResponse.json({ ticket: updated });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** Remove a ticket entirely (spam/noise). Board items it created survive. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.feedbackTicket.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
