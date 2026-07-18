import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { closeSettlementForIdentity, FinixError } from "@/lib/finix";

/**
 * POST — "Send to bank now": close the merchant's accruing settlement instead
 * of waiting for the daily payout cycle. Finix approves and funds the closed
 * settlement on its side, so from here the money is on its way. Payouts also
 * happen automatically every business day — this button just skips the wait.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { finixIdentityId: true, finixMerchantId: true, finixOnboardingState: true },
  });
  if (
    !company?.finixIdentityId ||
    !company.finixMerchantId ||
    company.finixOnboardingState !== "APPROVED"
  ) {
    return NextResponse.json({ error: "Online payments aren't set up yet." }, { status: 400 });
  }

  try {
    const settlement = await closeSettlementForIdentity(company.finixIdentityId);
    return NextResponse.json({
      success: true,
      settlement: {
        id: settlement.id,
        status: settlement.status ?? "AWAITING_APPROVAL",
        netAmount: settlement.net_amount ?? null,
      },
    });
  } catch (err) {
    if (err instanceof FinixError && /no unsettled/i.test(err.message)) {
      return NextResponse.json(
        {
          error:
            "Nothing is ready to pay out yet — payments clear about one business day after they're made, then pay out automatically.",
        },
        { status: 400 }
      );
    }
    console.error("[payments] payout failed", err);
    const message =
      err instanceof FinixError ? `Payout failed: ${err.message}` : "Payout failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
