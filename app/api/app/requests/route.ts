import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contactId, title, details, assessmentAt } = body;

  if (!contactId || !title) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const last = await prisma.request.findFirst({
    where: { companyId },
    orderBy: { requestNumber: "desc" },
  });

  const request = await prisma.request.create({
    data: {
      companyId,
      contactId,
      requestNumber: (last?.requestNumber ?? 0) + 1,
      title,
      details: details || null,
      assessmentAt: assessmentAt ? new Date(assessmentAt) : null,
    },
  });

  return NextResponse.json(request, { status: 201 });
}
