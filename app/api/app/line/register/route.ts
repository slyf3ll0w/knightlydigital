import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { LineError, lineSummary, sanitizeRegistrationForm, submitRegistration } from "@/lib/business-line";
import { limit } from "@/lib/rate-limit";

/**
 * POST <registration form> — file (or re-file, after a rejection) the
 * company's 10DLC brand + campaign for its business line. Each submission
 * costs real TCR fees, hence the tight rate limit.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`line-register:${actor.companyId}`, 3, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many submissions — try again in an hour." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const form = sanitizeRegistrationForm(body);
    await submitRegistration(actor.companyId, form);
    return NextResponse.json(await lineSummary(actor.companyId, { name: actor.name }), { status: 201 });
  } catch (err) {
    if (err instanceof LineError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[line] register route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
