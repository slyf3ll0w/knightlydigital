import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getActor, isManager, canManageRole, roleLabel, type Role } from "@/lib/permissions";
import { emailWhere, normalizeEmail } from "@/lib/user-email";
import { findOrAdoptAccountByEmail } from "@/lib/account";
import { sendEmail, teamAddedEmail } from "@/lib/email";

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

/**
 * POST — add a team member. Free, no seat limits.
 *
 * An email that already has a WorkBench login gets ATTACHED, not rejected:
 * the account gains a membership at this company and keeps its existing
 * password (which the owner never sees — the starting-password field only
 * applies to brand-new logins). The person gets a heads-up email and can
 * switch companies from their profile picture.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, phone, role, password } = body;
  const email = normalizeEmail(body.email);

  if (!name?.trim() || !email || !role) {
    return NextResponse.json({ error: "Name, email, and role are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || String(body.email ?? "").length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!canManageRole(actor.role, role as Role)) {
    return NextResponse.json(
      { error: actor.role === "ADMIN" ? "Admins can add Sales + Tech, Sales, and Tech members." : "Invalid role." },
      { status: 403 }
    );
  }

  // One membership per address per company (case-insensitive: the raw-email
  // check used to miss a legacy mixed-case row and 500 instead of 409).
  const inCompany = await prisma.user.findFirst({
    where: { companyId: actor.companyId, ...emailWhere(email) },
    select: { id: true, isActive: true },
  });
  if (inCompany) {
    return NextResponse.json(
      {
        error: inCompany.isActive
          ? "That email is already on your team."
          : "That email was on your team before — reactivate them from the list instead.",
      },
      { status: 409 }
    );
  }

  // Existing login elsewhere → attach a new membership to it.
  const account = await findOrAdoptAccountByEmail(email);

  if (!account) {
    if (!password) {
      return NextResponse.json(
        { error: "A starting password is required for a new account." },
        { status: 400 }
      );
    }
    if (String(password).length < 8 || String(password).length > 72) {
      return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
    }
  }

  // Account-level identity: an attached member keeps the name/phone/avatar
  // they already use on WorkBench, not whatever the owner typed.
  const identity = account
    ? await prisma.user.findFirst({
        where: { accountId: account.id },
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          phone: true,
          avatarData: true,
          avatarMime: true,
          avatarUpdatedAt: true,
        },
      })
    : null;

  const newHash = account ? null : await bcrypt.hash(String(password), 12);
  const user = await prisma.$transaction(async (tx) => {
    const login =
      account ?? (await tx.account.create({ data: { email, passwordHash: newHash! } }));
    return tx.user.create({
      data: {
        companyId: actor.companyId,
        name: identity?.name ?? String(name).trim().slice(0, 100),
        email: login.email,
        phone: identity?.phone ?? (phone ? String(phone).trim().slice(0, 30) : null),
        avatarData: identity?.avatarData ?? null,
        avatarMime: identity?.avatarMime ?? null,
        avatarUpdatedAt: identity?.avatarUpdatedAt ?? null,
        role,
        accountId: login.id,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
    });
  });

  // Heads-up to the attached person — best effort, the membership is live.
  if (account) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { name: true },
      });
      const mail = teamAddedEmail({
        name: identity?.name ?? String(name).trim(),
        companyName: company?.name ?? "A company",
        roleLabel: roleLabel[role as string] ?? String(role),
      });
      await sendEmail({ to: account.email, subject: mail.subject, html: mail.html });
    } catch {
      // never fail the add over a notification
    }
  }

  return NextResponse.json({ ...user, attached: Boolean(account) }, { status: 201 });
}
