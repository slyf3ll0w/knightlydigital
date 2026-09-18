import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { LineError, provisionLine } from "@/lib/business-line";
import { limit } from "@/lib/rate-limit";

/**
 * POST { areaCode, forwardTo? } — buy the company's business line. Gated on
 * the Workbench Plus entitlement inside provisionLine (402 without it).
 * Rate-limited hard: every call that gets past the checks spends money.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`line-provision:${actor.companyId}`, 5, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts — try again in an hour." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { areaCode?: unknown; forwardTo?: unknown };
  try {
    const out = await provisionLine(actor.companyId, {
      areaCode: typeof body.areaCode === "string" ? body.areaCode : "",
      forwardTo: typeof body.forwardTo === "string" ? body.forwardTo : null,
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    if (err instanceof LineError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[line] provision route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
