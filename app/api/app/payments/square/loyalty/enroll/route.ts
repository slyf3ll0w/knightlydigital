import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { enrollContactInLoyalty, LoyaltyError } from "@/lib/loyalty";

/** POST /api/app/payments/square/loyalty/enroll { contactId } — put a client in the rewards program (by their phone). */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const contactId = typeof body?.contactId === "string" ? body.contactId : "";
  if (!contactId) return NextResponse.json({ error: "Pick a client." }, { status: 400 });
  try {
    const account = await enrollContactInLoyalty({ companyId: actor.companyId, contactId, actorId: actor.id, actorName: actor.name });
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    if (err instanceof LoyaltyError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
