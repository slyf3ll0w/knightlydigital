import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { checkFeature } from "@/lib/plan-gate";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { specFromJson } from "@/lib/estimator";
import { applySuggestion, builderRequest, suggestionText, type Dismissal } from "@/lib/estimator-corrections";
import { correctionReport, dismissalsFromJson } from "@/lib/estimator-corrections-server";

/**
 * Corrections for one estimate tool (docs/plans/estimator-corrections-2026-11-17.md).
 *
 * GET  — what the owner's own sent quotes say should change, already proven
 *        against those quotes. A rate or minimum comes with the changed `spec`
 *        (the page saves it through the tool's ordinary PATCH, so History and
 *        the rate-card dates work as for any edit); a line to add or drop
 *        comes with the `request` to hand the builder.
 * POST — { key, answer: "later" | "never" }: the owner said no.
 * Managers only: these are the company's prices.
 */
async function load(id: string, companyId: string) {
  return prisma.estimator.findFirst({ where: { id, companyId }, select: { id: true, spec: true, suggestionState: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await checkFeature(actor.companyId, "estimator");
  if (!gate.ok) return gate.response;
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const spec = specFromJson(row.spec);
  if (!spec) return NextResponse.json({ suggestions: [] });

  const report = await correctionReport(actor.companyId, row);
  return NextResponse.json({
    usable: report.usable,
    suggestions: report.suggestions.map((s) => ({
      key: s.key,
      kind: s.kind,
      ...suggestionText(s),
      quotes: s.quotes.map((q) => ({ id: q.id, quoteNumber: q.quoteNumber ?? null, at: q.at, tool: q.tool, sent: q.sent, outcome: q.outcome })),
      spec: applySuggestion(spec, s),
      priceBook: s.kind === "price_book" ? { workItemId: s.workItemId, unitPrice: s.to } : null,
      request: builderRequest(s),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await checkFeature(actor.companyId, "estimator");
  if (!gate.ok) return gate.response;
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { key?: unknown; answer?: unknown };
  const key = typeof body.key === "string" ? body.key.slice(0, 200) : "";
  const mode: Dismissal["mode"] | null = body.answer === "later" ? "later" : body.answer === "never" ? "never" : null;
  if (!key || !mode) return NextResponse.json({ error: "Pass the suggestion and later or never." }, { status: 400 });

  // only a suggestion that is really on offer can be answered; what was behind it is remembered
  const report = await correctionReport(actor.companyId, row);
  const s = report.suggestions.find((x) => x.key === key);
  if (!s) return NextResponse.json({ ok: true });
  const next: Dismissal[] = [...dismissalsFromJson(row.suggestionState).filter((d) => d.key !== key), { key, mode, seen: s.quotes.map((q) => q.id) }].slice(-40);
  await prisma.estimator.update({ where: { id: row.id }, data: { suggestionState: next as unknown as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true });
}
