import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { listLoyaltyMembers, loyaltyProgramFor } from "@/lib/loyalty";
import { sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET /api/app/payments/square/loyalty?refresh=1&cursor=
 * The seller's Square Loyalty program (cached on the connection; `refresh`
 * re-reads it) and, when it is ACTIVE, a page of members matched to clients.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const state = await loyaltyProgramFor(actor.companyId, { refresh: sp.get("refresh") === "1", withProgram: true });
  if (state.failure && !state.program && state.status !== "NONE") {
    const { status, body } = sellerFailureStatus(state.failure);
    return NextResponse.json({ ...body, status: state.status }, { status });
  }
  const members = state.status === "ACTIVE" ? await listLoyaltyMembers(actor.companyId, sp.get("cursor")) : { members: [], cursor: null, failure: null };
  return NextResponse.json({ status: state.status, program: state.program, checkedAt: state.checkedAt, members: members.members, cursor: members.cursor });
}
