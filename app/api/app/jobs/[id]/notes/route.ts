import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  const userId = session?.user.id;
  if (!companyId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId } = await params;
  const { body } = await req.json();

  if (!body?.trim()) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });

  const job = await prisma.job.findFirst({ where: { id: jobId, companyId } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const note = await prisma.jobNote.create({
    data: { jobId, userId, body: body.trim() },
  });

  return NextResponse.json(note, { status: 201 });
}
