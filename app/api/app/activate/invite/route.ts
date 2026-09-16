import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { checkInviteCode } from "@/lib/invites";

/**
 * Redeem an invite code against a company that's ALREADY sitting at the
 * payment-verification gate (/app/activate).
 *
 * A code at signup waives underwriting — but until now there was no way to
 * apply one afterward, so anyone who signed up the ordinary way first (the
 * public application had no code field) was stuck at the gate and had to be
 * cleared by hand from the superadmin console. Same authority, same effect,
 * applied one step later: underwriting waived (Company.paymentsWaived) and
 * the application review closed out.
 *
 * Owner-only, and it grants exactly what opening a brand-new company with the
 * code would have granted — so it opens no door the code didn't already open.
 * Online payments stay held until a superadmin requires verification and
 * Finix approves (lib/payments-gate.ts onlinePaymentsHeld).
 * Rate-limited per IP in middleware ("invite-redeem").
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json(
      { error: "Only the account owner can use an invite code here." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const check = await checkInviteCode(body?.code);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { paymentsWaived: true, suspendedAt: true },
  });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
  // A code is an underwriting waiver, not an appeal — a company we suspended
  // stays suspended.
  if (company.suspendedAt) {
    return NextResponse.json(
      { error: "This account is closed. Contact us to reopen it." },
      { status: 403 }
    );
  }
  if (company.paymentsWaived) return NextResponse.json({ ok: true });

  class Claimed extends Error {}
  try {
    await prisma.$transaction(async (tx) => {
      // Minted codes are single-use — claim it the same way signup does, so
      // one code can't unlock two companies by racing.
      if (check.id) {
        const claimed = await tx.inviteCode.updateMany({
          where: { id: check.id, usedAt: null, revokedAt: null },
          data: { usedAt: new Date(), usedByCompanyId: actor.companyId },
        });
        if (claimed.count === 0) throw new Claimed();
      }
      await tx.company.update({
        where: { id: actor.companyId },
        // accessPendingAt too: the code is the approval, so the pending-review
        // banner and the superadmin queue entry clear with it.
        data: { paymentsWaived: true, accessPendingAt: null },
      });
      await tx.accessApplication.updateMany({
        where: { companyId: actor.companyId, status: "PENDING" },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
    });
  } catch (e) {
    if (e instanceof Claimed) {
      return NextResponse.json(
        { error: "That invite code has already been used." },
        { status: 403 }
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
