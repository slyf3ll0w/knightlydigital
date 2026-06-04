import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      phone: true,
      accountManager: { select: { name: true, email: true } },
      orders: {
        select: {
          id: true,
          serviceName: true,
          status: true,
          notes: true,
          adminNotes: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["ADMIN", "STAFF"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, email, company, phone, accountManagerId, password } = body;

  const updateData: Record<string, unknown> = {};
  if (name)     updateData.name = name;
  if (email)    updateData.email = email;
  if (company !== undefined) updateData.company = company || null;
  if (phone !== undefined)   updateData.phone = phone || null;
  if (accountManagerId !== undefined) updateData.accountManagerId = accountManagerId || null;
  if (password) updateData.passwordHash = await bcrypt.hash(password, 12);

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, company: true, phone: true },
  });

  return NextResponse.json(updated);
}
