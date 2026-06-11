import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

async function getCompanyId() {
  const session = await getServerSession(authOptions);
  return session?.user.companyId ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const validStatuses = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
  const updated = await prisma.job.updateMany({
    where: { id, companyId },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status && validStatuses.includes(body.status) && { status: body.status }),
      ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }),
      ...(body.scheduledEnd !== undefined && { scheduledEnd: body.scheduledEnd ? new Date(body.scheduledEnd) : null }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.leadSource !== undefined && { leadSource: body.leadSource || null }),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
