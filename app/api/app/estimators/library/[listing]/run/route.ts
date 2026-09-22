import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { compileSpec, explainRun, parseVariants, runCompiled, runVariants } from "@/lib/estimator";
import { loadVisibleListing } from "@/lib/estimator-library";

/**
 * POST /api/app/estimators/library/[listing]/run { inputs, variants? } —
 * "Preview" on a Library card: run a listing's PORTABLE spec (no price book
 * needed) for anyone who can sell. The runner reaches it by giving the
 * preview tool the id `library/<listingId>`; the static `library` segment
 * wins over `[id]/run`, so a listing id can never be mistaken for a tool.
 * Nothing is counted or saved.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ listing: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { listing } = await params;
  const row = await loadVisibleListing(listing, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const c = compileSpec(row.spec);
  if (!c.ok) return NextResponse.json({ error: "This listing's rules no longer compile.", errors: c.errors }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { inputs?: unknown; variants?: unknown; explain?: unknown };
  const inputs = body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs) ? (body.inputs as Record<string, unknown>) : {};
  const result = runCompiled(c.compiled, inputs, []);
  const vreq = body.variants ? parseVariants(c.compiled.spec, body.variants) : null;
  const variants = vreq ? runVariants(c.compiled, inputs, [], vreq) : undefined;
  if (!result.ok) {
    if (variants) return NextResponse.json({ ok: false, error: result.errors[0], errors: result.errors, variants });
    return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });
  }
  const drivers = body.explain === true ? explainRun(c.compiled, inputs, []) : undefined;
  return NextResponse.json({ ...result, ...(variants ? { variants } : {}), ...(drivers ? { drivers } : {}) });
}
