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

  await prisma.quote.updateMany({
    where: { id, companyId },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.status === "SENT" && { sentAt: new Date() }),
      ...(body.status === "ACCEPTED" && { acceptedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });

  return NextResponse.json({ success: true });
}
