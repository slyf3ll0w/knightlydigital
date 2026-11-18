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
import { analyzeCorrections, CORRECTION_BAR, suggestionText, type CorrectionLine, type CorrectionReport, type Dismissal, type Observation } from "./estimator-corrections";

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
  opts: { companyId: string; estimatorId: string; quoteId: string; inputs: unknown; source: "app" | "atlas" | "website"; auto?: boolean }
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
          discount: true,
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
      const first = r.quote.revisions[0]?.snapshot as { lineItems?: unknown; discount?: unknown } | undefined;
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
        // the quote's discount as it first went out (rounding is read on the price the client saw)
        sentDiscount: Number((first?.lineItems ? first.discount : r.quote.discount) ?? 0) || 0,
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

// ── across companies (the platform console) ──────────────────────────────────

export type CorrectionPattern = {
  /** The trade the companies are in (their onboarding answer), or "Other". */
  industry: string;
  /** The correction, without anyone's numbers: "Rate raised: cedar fence". */
  what: string;
  companies: number;
  tools: number;
  examples: { company: string; tool: string; said: string }[];
};

const plainWords = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/**
 * The same correction turning up in more than one company — a sign the
 * BUILDER gets something wrong for a trade, not that one owner prices
 * differently (docs/plans/estimator-corrections-2026-11-17.md, "Across
 * companies"). For the platform console only: it reads every company's
 * proven suggestions and groups them by trade and kind. Nothing here is
 * shown to another company or fed back into anyone's tool; a pattern that
 * holds becomes a builder fix and a case on the estimator answer key.
 */
export async function crossCompanyCorrections(): Promise<{ patterns: CorrectionPattern[]; toolsRead: number; toolsWithSuggestions: number }> {
  const since = new Date(Date.now() - CORRECTION_BAR.maxAgeDays * 86_400_000);
  const busy = await prisma.estimatorQuoteRun.groupBy({
    by: ["estimatorId"],
    where: { auto: false, quote: { sentAt: { gte: since } } },
    _count: { _all: true },
    orderBy: { _count: { estimatorId: "desc" } },
    take: 150,
  });
  const ids = busy.filter((b) => b._count._all >= CORRECTION_BAR.minQuotes).map((b) => b.estimatorId);
  const tools = await prisma.estimator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, spec: true, companyId: true, company: { select: { name: true, industry: true, isTest: true } } } });
  const groups = new Map<string, { industry: string; what: string; companies: Set<string>; tools: Set<string>; examples: CorrectionPattern["examples"] }>();
  let toolsWithSuggestions = 0;
  for (const tool of tools) {
    // what the quotes show, whether or not the owner dismissed it
    const report = await correctionReport(tool.companyId, { id: tool.id, spec: tool.spec }).catch(() => null);
    if (!report || report.suggestions.length === 0) continue;
    toolsWithSuggestions++;
    const industry = tool.company.industry?.trim() || "Other";
    for (const s of report.suggestions) {
      const what =
        s.kind === "rate"
          ? `Rate ${s.to > s.from ? "raised" : "lowered"}: ${plainWords(s.label)}`
          : s.kind === "price_book"
            ? `Price-book price ${s.to > s.from ? "raised" : "lowered"}: ${plainWords(s.name)}`
            : s.kind === "minimum"
              ? "Minimum raised"
              : s.kind === "rounding"
                ? `Prices rounded ${s.mode === "up" ? "up " : ""}to $${s.to}`
                : s.kind === "add_line"
                  ? `Line added by hand: ${plainWords(s.name)}`
                  : `Line taken off: ${plainWords(s.name)}`;
      const key = `${industry.toLowerCase()}|${what}`;
      const g = groups.get(key) ?? { industry, what, companies: new Set<string>(), tools: new Set<string>(), examples: [] };
      g.companies.add(tool.companyId);
      g.tools.add(tool.id);
      if (g.examples.length < 5) g.examples.push({ company: `${tool.company.name}${tool.company.isTest ? " (test)" : ""}`, tool: tool.name, said: suggestionText(s).title });
      groups.set(key, g);
    }
  }
  const patterns = [...groups.values()]
    .map((g) => ({ industry: g.industry, what: g.what, companies: g.companies.size, tools: g.tools.size, examples: g.examples }))
    .sort((a, b) => b.companies - a.companies || b.tools - a.tools || a.what.localeCompare(b.what));
  return { patterns, toolsRead: tools.length, toolsWithSuggestions };
}
