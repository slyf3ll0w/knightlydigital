import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runCompiled } from "@/lib/estimator";
import { loadPriceBook, resolvePublicEstimator } from "@/lib/estimator-server";
import { shapeEstimate } from "@/lib/estimator-public";
import { limit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/public/estimate/[companySlug]/[toolSlug]/calc  { inputs }
 * The website form's "See my estimate": runs the tool's math on the server
 * (the visitor never receives the formulas or the price book) and returns
 * the estimate shaped by the owner's showPrice — exact lines, a range, or
 * nothing. Forms that reveal the price only after contact details get
 * `hidden` here; the submit route returns the real number. Free: no model
 * call, nothing written but a counter. ?preview=1 lets a signed-in manager
 * try an unpublished form.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; tool: string }> }) {
  const { slug, tool } = await params;
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const pub = await resolvePublicEstimator(slug, tool, { preview });
  if (!pub) return NextResponse.json({ error: "This form isn't available." }, { status: 404 });

  const ip = clientIp(req.headers);
  if (!(await limit(`public-estimate-calc:${ip}`, 60, 600_000)).ok) {
    return NextResponse.json({ error: "Too many requests — please try again in a few minutes." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { inputs?: unknown };
  const inputs = (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs) ? body.inputs : {}) as Record<string, unknown>;
  const result = runCompiled(pub.compiled, inputs, await loadPriceBook(pub.company.id));
  if (!result.ok) return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });

  if (!pub.previewing) void prisma.estimator.update({ where: { id: pub.row.id }, data: { publicCalcs: { increment: 1 } } }).catch(() => {});

  const config = pub.config.reveal === "after_contact" ? { ...pub.config, showPrice: "hidden" as const } : pub.config;
  return NextResponse.json({ ok: true, estimate: shapeEstimate(result, config, pub.spec.minimumTotal) });
}
