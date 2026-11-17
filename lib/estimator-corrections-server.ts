/**
 * Corrections, the database half (the reading is lib/estimator-corrections.ts;
 * the plan is docs/plans/estimator-corrections-2026-11-17.md).
 *
 * recordQuoteRun  — a quote was made from a tool run: keep the answers and the lines.
 * correctionReport — read a tool's sent quotes and return what is worth offering.
 * One company's quotes never reach another company's tool: every query is by companyId.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { compileSpec, runCompiled, specFromJson } from "./estimator";
import { loadPriceBook } from "./estimator-server";
import { analyzeCorrections, CORRECTION_BAR, type CorrectionLine, type CorrectionReport, type Dismissal, type Observation } from "./estimator-corrections";

type Db = Prisma.TransactionClient | typeof prisma;

const MAX_INPUT_BYTES = 20_000;

/** The answers as plain JSON, or null when they are not an object or far too big to be a form. */
export function cleanRunInputs(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const json = JSON.stringify(raw);
    if (json.length > MAX_INPUT_BYTES) return null;
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Keep the tool run a quote started from. The tool is run again here from the
 * answers (free, plain math) so the stored lines are the tool's own, never
 * what a browser claimed. A quote that already has a run and takes lines from
 * another loses its row: two runs on one quote cannot be read apart.
 * Never throws — a quote must save whether or not this does.
 */
export async function recordQuoteRun(
  db: Db,
  opts: { companyId: string; estimatorId: string; quoteId: string; inputs: unknown; source: "app" | "website"; auto?: boolean }
): Promise<void> {
  try {
    const inputs = cleanRunInputs(opts.inputs);
    if (!inputs) return;
    const existing = await db.estimatorQuoteRun.findUnique({ where: { quoteId: opts.quoteId }, select: { id: true } });
    if (existing) {
      await db.estimatorQuoteRun.delete({ where: { id: existing.id } });
      return;
    }
    const row = await db.estimator.findFirst({ where: { id: opts.estimatorId, companyId: opts.companyId }, select: { id: true, spec: true } });
    if (!row) return;
    const c = compileSpec(row.spec);
    if (!c.ok) return;
    const run = runCompiled(c.compiled, inputs, await loadPriceBook(opts.companyId));
    if (!run.ok) return;
    const toolLines: CorrectionLine[] = run.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, isOptional: l.isOptional }));
    await db.estimatorQuoteRun.create({
      data: { companyId: opts.companyId, estimatorId: row.id, quoteId: opts.quoteId, source: opts.source, auto: opts.auto === true, inputs: inputs as Prisma.InputJsonValue, toolLines: toolLines as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    console.error("[estimator-corrections] could not record the run", e);
  }
}

function linesFromJson(raw: unknown): CorrectionLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : null))
    .filter((l): l is Record<string, unknown> => l != null)
    .map((l) => ({ name: String(l.name ?? ""), quantity: Number(l.quantity ?? 0), unitPrice: Number(l.unitPrice ?? 0), isOptional: l.isOptional === true }))
    .filter((l) => Number.isFinite(l.quantity) && Number.isFinite(l.unitPrice));
}

export function dismissalsFromJson(raw: unknown): Dismissal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : null))
    .filter((d): d is Record<string, unknown> => d != null && typeof d.key === "string")
    .map((d) => ({ key: String(d.key), mode: d.mode === "never" ? ("never" as const) : ("later" as const), seen: Array.isArray(d.seen) ? d.seen.map(String).slice(0, 60) : [] }));
}

/** A tool's sent quotes, as the reader wants them. Quotes still in draft, and ones that went out on their own, are left out. */
export async function loadObservations(companyId: string, estimatorId: string): Promise<Observation[]> {
  const since = new Date(Date.now() - CORRECTION_BAR.maxAgeDays * 86_400_000);
  const runs = await prisma.estimatorQuoteRun.findMany({
    where: { companyId, estimatorId, auto: false, quote: { sentAt: { gte: since } } },
    orderBy: { createdAt: "desc" },
    take: CORRECTION_BAR.maxQuotes,
    select: {
      id: true,
      inputs: true,
      toolLines: true,
      quote: {
        select: {
          quoteNumber: true,
          sentAt: true,
          status: true,
          lineItems: { orderBy: { sortOrder: "asc" }, select: { name: true, description: true, quantity: true, unitPrice: true, isOptional: true } },
          // edited after it went out: the first revision is what the client first saw
          revisions: { where: { revision: 1 }, select: { snapshot: true } },
        },
      },
    },
  });
  return runs
    .filter((r) => r.quote.sentAt)
    .map((r) => {
      const first = r.quote.revisions[0]?.snapshot as { lineItems?: unknown } | undefined;
      const sentLines = first?.lineItems
        ? linesFromJson(first.lineItems)
        : r.quote.lineItems.map((l) => ({ name: l.name || l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), isOptional: l.isOptional }));
      const status = r.quote.status;
      return {
        id: r.id,
        quoteNumber: r.quote.quoteNumber,
        at: r.quote.sentAt!.toISOString(),
        inputs: (r.inputs ?? {}) as Record<string, unknown>,
        toolLines: linesFromJson(r.toolLines),
        sentLines,
        outcome: status === "APPROVED" || status === "CONVERTED" ? ("won" as const) : status === "ARCHIVED" ? ("lost" as const) : ("open" as const),
      };
    });
}

/** What, if anything, is worth offering the owner of this tool today. */
export async function correctionReport(companyId: string, tool: { id: string; spec: unknown; suggestionState?: unknown }): Promise<CorrectionReport> {
  if (!specFromJson(tool.spec)) return { suggestions: [], held: [], usable: 0, stale: 0 };
  const [observations, book] = await Promise.all([loadObservations(companyId, tool.id), loadPriceBook(companyId)]);
  if (observations.length < CORRECTION_BAR.minQuotes) return { suggestions: [], held: [], usable: observations.length, stale: 0 };
  return analyzeCorrections(tool.spec, book, observations, { dismissed: dismissalsFromJson(tool.suggestionState) });
}
