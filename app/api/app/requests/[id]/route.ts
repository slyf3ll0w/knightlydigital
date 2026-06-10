import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * PATCH — update a request's status or details.
 * Body: { status?: "NEW" | "CONVERTED" | "ARCHIVED", title?, details?, assessmentAt? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await prisma.request.findFirst({ where: { id, companyId } });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status && ["NEW", "CONVERTED", "ARCHIVED"].includes(body.status)) {
    data.status = body.status;
  }
  if (body.title !== undefined) data.title = body.title;
  if (body.details !== undefined) data.details = body.details || null;
  if (body.assessmentAt !== undefined) {
    data.assessmentAt = body.assessmentAt ? new Date(body.assessmentAt) : null;
  }

  const updated = await prisma.request.update({ where: { id }, data });
  return NextResponse.json(updated);
}
