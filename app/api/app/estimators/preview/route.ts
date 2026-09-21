import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { runCompiled } from "@/lib/estimator";
import { checkSpec } from "@/lib/estimator-server";

/**
 * POST { spec, inputs? } — try a spec that ISN'T saved yet (managers).
 * Compiles it and confirms every price-book item exists, exactly like a
 * save would; with `inputs`, also runs it. Backs the "Try it" button on an
 * Atlas create/update card and the manual editor's check + test. Free: pure
 * math, nothing written.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { spec?: unknown; inputs?: unknown };
  const check = await checkSpec(actor.companyId, body.spec);
  if (!check.ok) return NextResponse.json({ error: check.errors[0], errors: check.errors }, { status: 400 });
  if (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)) {
    const result = runCompiled(check.compiled, body.inputs as Record<string, unknown>, check.book);
    if (!result.ok) return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });
    return NextResponse.json(result);
  }
  return NextResponse.json({ ok: true, spec: check.compiled.spec });
}
