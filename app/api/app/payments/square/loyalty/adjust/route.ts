import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { adjustContactPoints, LoyaltyError } from "@/lib/loyalty";

/** POST /api/app/payments/square/loyalty/adjust { contactId, points (±), reason } — managers add or remove points by hand. */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Only owners and admins can change points." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const account = await adjustContactPoints({
      companyId: actor.companyId,
      contactId: String(body?.contactId ?? ""),
      points: Number(body?.points),
      reason: String(body?.reason ?? ""),
      actorId: actor.id,
      actorName: actor.name,
    });
    return NextResponse.json({ account });
  } catch (err) {
    if (err instanceof LoyaltyError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
