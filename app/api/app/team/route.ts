import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getActor, isManager, canManageRole, type Role } from "@/lib/permissions";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { companyId: actor.companyId },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(users);
}

/** POST — add a team member. Free, no seat limits. */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, phone, role, password } = body;

  if (!name?.trim() || !email?.trim() || !role || !password) {
    return NextResponse.json({ error: "Name, email, role, and a starting password are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || String(email).length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!canManageRole(actor.role, role as Role)) {
    return NextResponse.json(
      { error: actor.role === "ADMIN" ? "Admins can add Sales + Tech, Sales, and Tech members." : "Invalid role." },
      { status: 403 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      companyId: actor.companyId,
      name: String(name).trim().slice(0, 100),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim().slice(0, 30) : null,
      role,
      passwordHash: await bcrypt.hash(password, 12),
    },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
  });

  return NextResponse.json(user, { status: 201 });
}
