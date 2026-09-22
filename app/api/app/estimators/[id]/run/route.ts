import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { compileSpec, parseVariants, runVariants } from "@/lib/estimator";
import { loadPriceBook, runStoredEstimator } from "@/lib/estimator-server";

/**
 * POST { inputs, variants? } — run a saved estimate tool. Pure arithmetic on
 * the server (lib/estimator.ts): no model call, no tokens, nothing written
 * except the run counter. The quote editor adds the returned lines to the
 * form; the user still reviews and saves the quote themselves.
 * `variants: {input, values[]}` also prices each alternative of one choice
 * (package tiers) and returns them as `variants: {value: subtotal | null}` —
 * even when the base run can't complete yet because that very choice is
 * still unanswered.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.estimator.findFirst({
    where: { id, companyId: actor.companyId, isActive: true },
    select: { id: true, spec: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { inputs?: unknown; variants?: unknown };
  const inputs = (body.inputs && typeof body.inputs === "object" ? body.inputs : {}) as Record<string, unknown>;
  // ?dry=1 — the runner's live total while typing; doesn't count as a use
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const result = await runStoredEstimator(row, actor.companyId, inputs, { count: !dry });

  let variants: Record<string, number | null> | undefined;
  if (body.variants) {
    const c = compileSpec(row.spec);
    const vreq = c.ok ? parseVariants(c.compiled.spec, body.variants) : null;
    if (c.ok && vreq) variants = runVariants(c.compiled, inputs, await loadPriceBook(actor.companyId), vreq);
  }
  if (!result.ok) {
    if (variants) return NextResponse.json({ ok: false, error: result.errors[0], errors: result.errors, variants });
    return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });
  }
  return NextResponse.json(variants ? { ...result, variants } : result);
}
