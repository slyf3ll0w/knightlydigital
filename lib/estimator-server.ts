import { prisma } from "./db";
import {
  compileSpec,
  runCompiled,
  specFromJson,
  type CompiledSpec,
  type EstimatorRun,
  type EstimatorSpec,
  type PriceBookEntry,
} from "./estimator";

/**
 * The Prisma-touching half of estimate tools, shared by the API routes and
 * the Atlas tools. lib/estimator.ts stays pure.
 */

export async function loadPriceBook(companyId: string): Promise<PriceBookEntry[]> {
  const rows = await prisma.workItem.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, unitPrice: true, unitCost: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    unitPrice: Number(r.unitPrice),
    unitCost: r.unitCost === null ? null : Number(r.unitCost),
  }));
}

/** Price-book names the spec references that this company doesn't have. */
export function missingPriceBookNames(compiled: CompiledSpec, book: PriceBookEntry[]): string[] {
  const have = new Set(book.map((b) => b.name.trim().toLowerCase()));
  return compiled.priceBookNames.filter((n) => !have.has(n.trim().toLowerCase()));
}

export type SpecCheck =
  | { ok: true; compiled: CompiledSpec; book: PriceBookEntry[] }
  | { ok: false; errors: string[] };

/** Compile + confirm every referenced price-book item exists — the gate before any save. */
export async function checkSpec(companyId: string, rawSpec: unknown): Promise<SpecCheck> {
  const c = compileSpec(rawSpec);
  if (!c.ok) return c;
  const book = await loadPriceBook(companyId);
  const missing = missingPriceBookNames(c.compiled, book);
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`Not in the price book: ${missing.join(", ")}. Add them under Settings → Services (or create_service) first, or use a plain unitPrice.`],
    };
  }
  return { ok: true, compiled: c.compiled, book };
}

export type EstimatorRow = {
  id: string;
  name: string;
  description: string | null;
  spec: unknown;
  isActive: boolean;
  runs: number;
  assists: number;
  updatedAt: Date;
};

export const ESTIMATOR_SELECT = {
  id: true,
  name: true,
  description: true,
  spec: true,
  isActive: true,
  runs: true,
  assists: true,
  updatedAt: true,
} as const;

/** Run a stored tool for a company; counts the run. Stored specs always compile. */
export async function runStoredEstimator(
  row: { id: string; spec: unknown },
  companyId: string,
  inputs: Record<string, unknown>
): Promise<EstimatorRun> {
  const c = compileSpec(row.spec);
  if (!c.ok) return { ok: false, errors: ["This tool's saved rules no longer compile — edit it with Atlas.", ...c.errors] };
  const book = await loadPriceBook(companyId);
  const result = runCompiled(c.compiled, inputs, book);
  if (result.ok) {
    void prisma.estimator.update({ where: { id: row.id }, data: { runs: { increment: 1 } } }).catch(() => {});
  }
  return result;
}

/** Rows → what the quote editor's runner needs (broken specs are dropped). */
export function runnerEstimators(
  rows: Pick<EstimatorRow, "id" | "name" | "description" | "spec" | "isActive">[],
  opts: { includeInactive?: boolean } = {}
): { id: string; name: string; description: string | null; usesAtlas: boolean; spec: EstimatorSpec }[] {
  const out: { id: string; name: string; description: string | null; usesAtlas: boolean; spec: EstimatorSpec }[] = [];
  for (const r of rows) {
    if (!r.isActive && !opts.includeInactive) continue;
    const spec = specFromJson(r.spec);
    if (!spec) continue;
    out.push({ id: r.id, name: r.name, description: r.description, usesAtlas: Boolean(spec.assist), spec });
  }
  return out;
}

/** The shape the runner UI and the Atlas tools list. */
export function estimatorSummary(row: EstimatorRow, spec: EstimatorSpec) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    usesAtlas: Boolean(spec.assist),
    inputs: spec.inputs.map((i) => ({ id: i.id, label: i.label, type: i.type })),
    lines: spec.lines.length,
    runs: row.runs,
    assists: row.assists,
    updatedAt: row.updatedAt,
  };
}
