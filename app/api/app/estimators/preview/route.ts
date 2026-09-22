import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { auditSpec, parseVariants, runCompiled, runVariants } from "@/lib/estimator";
import { checkSpec } from "@/lib/estimator-server";

/**
 * POST { spec, inputs?, variants? } — try a spec that ISN'T saved yet
 * (managers). Compiles it and confirms every price-book item exists,
 * exactly like a save would; with `inputs`, also runs it (and prices
 * `variants` of one choice, for package tiers). Without inputs it returns
 * the quality audit too — the editor's Check shows what a pro would send
 * back. Backs "Try it" on an Atlas card and the manual editor. Free: pure
 * math, nothing written.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { spec?: unknown; inputs?: unknown; variants?: unknown };
  const check = await checkSpec(actor.companyId, body.spec);
  if (!check.ok) return NextResponse.json({ error: check.errors[0], errors: check.errors }, { status: 400 });
  if (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)) {
    const inputs = body.inputs as Record<string, unknown>;
    const result = runCompiled(check.compiled, inputs, check.book);
    const vreq = body.variants ? parseVariants(check.compiled.spec, body.variants) : null;
    const variants = vreq ? runVariants(check.compiled, inputs, check.book, vreq) : undefined;
    if (!result.ok) {
      if (variants) return NextResponse.json({ ok: false, error: result.errors[0], errors: result.errors, variants });
      return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });
    }
    return NextResponse.json(variants ? { ...result, variants } : result);
  }
  const audit = auditSpec(check.compiled, check.book);
  return NextResponse.json({ ok: true, spec: check.compiled.spec, audit });
}
