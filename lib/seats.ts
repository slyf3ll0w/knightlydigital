import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, PLANS, PLAN_HOLDER_SELECT, canAddPerson, formatCents, seatLimit } from "@/lib/plans";

/**
 * The seat cap (lib/plans.ts seatLimit): Core includes INCLUDED_SEATS active
 * people plus every seat paid for (Company.paidSeats, lib/plan-billing.ts);
 * Pro and Max have no cap, nor do test accounts, nor anyone while
 * PLAN_GATING is dark. Adding a person or reactivating one past the cap is
 * refused with 402 SEATS_REQUIRED — the client shows the message with a link
 * to Settings → Plans, where one more person is two taps.
 */
export const SEATS_REQUIRED_CODE = "SEATS_REQUIRED";

export async function seatRefusal(companyId: string): Promise<NextResponse | null> {
  const [company, active] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: PLAN_HOLDER_SELECT }),
    prisma.user.count({ where: { companyId, isActive: true, role: { not: "SUPERADMIN" } } }),
  ]);
  if (!company || canAddPerson(company, active)) return null;
  const limit = seatLimit(company) ?? INCLUDED_SEATS;
  return NextResponse.json(
    {
      error: `Your plan includes ${limit} ${limit === 1 ? "person" : "people"}. Add a person for ${formatCents(EXTRA_SEAT_CENTS)} a month, or go ${PLANS.SHOP.name} for unlimited people.`,
      code: SEATS_REQUIRED_CODE,
      limit,
      active,
    },
    { status: 402 }
  );
}
