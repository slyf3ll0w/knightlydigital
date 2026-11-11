import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { CompanyRequestError, fileCompanyRequest, pendingRequestsForUser } from "@/lib/company-requests";

/**
 * Ask WorkBench support for another company on this login (avatar menu →
 * Request a company). Any role may ask — the company would be theirs.
 * GET = this login's waiting requests (the avatar menu lists them).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await pendingRequestsForUser(actor.id);
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await limit(`company-request:${actor.id}`, 10, 24 * 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests today. Try again tomorrow." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const request = await fileCompanyRequest(actor.id, body ?? {});
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof CompanyRequestError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
