import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

async function getSession() {
  return getServerSession(authOptions);
}

export async function GET() {
  const session = await getSession();
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.job.findMany({
    where: { companyId },
    include: { contact: true, assignments: { include: { user: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contactId, requestId, title, description, scheduledAt, scheduledEnd, address, leadSource } = body;

  if (!contactId || !title) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (requestId) {
    const request = await prisma.request.findFirst({ where: { id: requestId, companyId } });
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const job = await prisma.$transaction(async (tx) => {
    const last = await tx.job.findFirst({
      where: { companyId },
      orderBy: { jobNumber: "desc" },
    });

    const created = await tx.job.create({
      data: {
        companyId,
        contactId,
        requestId: requestId || null,
        jobNumber: (last?.jobNumber ?? 0) + 1,
        title,
        description: description || null,
        leadSource: leadSource || contact.leadSource || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        address: address || contact.address || null,
      },
    });

    if (requestId) {
      await tx.request.update({ where: { id: requestId }, data: { status: "CONVERTED" } });
    }

    // First real work for a lead makes them an active client (Jobber behavior)
    if (contact.status === "LEAD") {
      await tx.contact.update({ where: { id: contactId }, data: { status: "ACTIVE" } });
    }

    return created;
  });

  return NextResponse.json(job, { status: 201 });
}
