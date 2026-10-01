import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";

/** Mark a website contact-form message as spam (or not). Body: { spam: boolean }. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.spam !== "boolean") return NextResponse.json({ error: "spam must be true or false." }, { status: 400 });

  const row = await prisma.contactSubmission.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!row) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  await prisma.contactSubmission.update({
    where: { id },
    data: { spam: body.spam, readAt: new Date() },
  });
  logConsoleAction(admin, body.spam ? "contact-spam" : "contact-not-spam", { detail: row.name });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await prisma.contactSubmission.findUnique({ where: { id }, select: { name: true } });
  if (!row) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  await prisma.contactSubmission.delete({ where: { id } });
  logConsoleAction(admin, "contact-delete", { detail: row.name });
  return NextResponse.json({ ok: true });
}
