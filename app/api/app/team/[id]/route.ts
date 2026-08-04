import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, canManageRole, type Role } from "@/lib/permissions";
import { ensureAccountForUser, setPasswordForUser } from "@/lib/account";

/**
 * PATCH — edit a team member: role, active toggle, password reset, name/phone.
 * Owners manage everyone; admins only Sales + Tech / Sales / Tech. The last
 * active owner can't be deactivated or demoted (a company must keep an owner).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const target = await prisma.user.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (!canManageRole(actor.role, target.role as Role) && target.id !== actor.id) {
    return NextResponse.json({ error: "You can't manage this team member." }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    data.name = String(body.name).trim().slice(0, 100);
  }
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;

  if (body.role !== undefined && body.role !== target.role) {
    if (!canManageRole(actor.role, body.role as Role) || !canManageRole(actor.role, target.role as Role)) {
      return NextResponse.json({ error: "You can't change this member to that role." }, { status: 403 });
    }
    data.role = body.role;
  }

  if (body.bookable !== undefined) data.bookable = Boolean(body.bookable);

  // Internal labor cost per hour (feeds job labor costing from time entries)
  if (body.hourlyCost !== undefined) {
    if (body.hourlyCost === null || body.hourlyCost === "") {
      data.hourlyCost = null;
    } else {
      const rate = Number(body.hourlyCost);
      if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
        return NextResponse.json({ error: "Enter a valid hourly cost." }, { status: 400 });
      }
      data.hourlyCost = rate;
    }
  }

  if (body.isActive !== undefined) {
    if (target.id === actor.id && body.isActive === false) {
      return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
    }
    data.isActive = Boolean(body.isActive);
  }

  let passwordToSet: string | null = null;
  if (body.password !== undefined) {
    if (String(body.password).length < 8 || String(body.password).length > 72) {
      return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
    }
    // The password belongs to the PERSON, not the company. A manager may only
    // reset it while this company is the login's sole membership — someone
    // who also works elsewhere manages their own password (profile page or
    // the Forgot password link).
    const account = await ensureAccountForUser(target);
    if (account) {
      const siblings = await prisma.user.count({
        where: { accountId: account.id, id: { not: target.id } },
      });
      if (siblings > 0) {
        return NextResponse.json(
          {
            error:
              "This member's login spans multiple companies, so only they can change its password (from their profile, or the Forgot password link).",
          },
          { status: 400 }
        );
      }
    }
    passwordToSet = String(body.password);
  }

  // Keep at least one active owner standing
  const removesOwner =
    target.role === "OWNER" &&
    ((data.role && data.role !== "OWNER") || data.isActive === false);
  if (removesOwner) {
    const otherOwners = await prisma.user.count({
      where: { companyId: actor.companyId, role: "OWNER", isActive: true, id: { not: target.id } },
    });
    if (otherOwners === 0) {
      return NextResponse.json({ error: "The company needs at least one active owner." }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data,
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, bookable: true, hourlyCost: true },
  });

  if (passwordToSet !== null) {
    await setPasswordForUser(target.id, passwordToSet);
  }

  return NextResponse.json(updated);
}
