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
  const { contactId, title, description, status, scheduledAt, scheduledEnd, address } = body;

  if (!contactId || !title) {
    return NextResponse.json({ error: "Contact and title are required." }, { status: 400 });
  }

  // Verify contact belongs to company
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  // Auto-increment job number
  const last = await prisma.job.findFirst({
    where: { companyId },
    orderBy: { jobNumber: "desc" },
  });
  const jobNumber = (last?.jobNumber ?? 0) + 1;

  const job = await prisma.job.create({
    data: {
      companyId,
      contactId,
      jobNumber,
      title,
      description: description || null,
      status: status || "LEAD",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
      address: address || contact.address || null,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
