import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { compileSpec, explainRun, parseVariants, runVariants, type PriceDriver } from "@/lib/estimator";
import { loadPriceBook, runStoredEstimator } from "@/lib/estimator-server";

/**
 * POST { inputs, variants?, explain? } — run a saved estimate tool. Pure
 * arithmetic on the server (lib/estimator.ts): no model call, no tokens,
 * nothing written except the run counter. The quote editor adds the returned
 * lines to the form; the user still reviews and saves the quote themselves.
 * `variants: {input, values[]}` also prices each alternative of one choice
 * (package tiers) and returns them as `variants: {value: subtotal | null}` —
 * even when the base run can't complete yet because that very choice is
 * still unanswered. `explain: true` adds `drivers` — the answers that move
 * this price most, in plain words (explainRun).
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

  const body = (await req.json().catch(() => ({}))) as { inputs?: unknown; variants?: unknown; explain?: unknown };
  const inputs = (body.inputs && typeof body.inputs === "object" ? body.inputs : {}) as Record<string, unknown>;
  // ?dry=1 — the runner's live total while typing; doesn't count as a use
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const result = await runStoredEstimator(row, actor.companyId, inputs, { count: !dry });

  let variants: Record<string, number | null> | undefined;
  let drivers: PriceDriver[] | undefined;
  if (body.variants || body.explain === true) {
    const c = compileSpec(row.spec);
    if (c.ok) {
      const book = await loadPriceBook(actor.companyId);
      const vreq = body.variants ? parseVariants(c.compiled.spec, body.variants) : null;
      if (vreq) variants = runVariants(c.compiled, inputs, book, vreq);
      if (body.explain === true && result.ok) drivers = explainRun(c.compiled, inputs, book);
    }
  }
  if (!result.ok) {
    if (variants) return NextResponse.json({ ok: false, error: result.errors[0], errors: result.errors, variants });
    return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ ...result, ...(variants ? { variants } : {}), ...(drivers ? { drivers } : {}) });
}
