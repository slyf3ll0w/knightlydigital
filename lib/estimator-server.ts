import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { resolvePublicCompany } from "./public-company";
import { getActor, isManager } from "./permissions";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "./estimator-public";
import {
  compileSpec,
  describeSpecChanges,
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
  companyId: string;
  name: string;
  description: string | null;
  spec: unknown;
  isActive: boolean;
  runs: number;
  assists: number;
  isPublic: boolean;
  publicSlug: string | null;
  publicConfig: unknown;
  publicViews: number;
  publicCalcs: number;
  submissions: number;
  /** The Library listing this tool was copied from (null when built here). */
  sourceListingId: string | null;
  updatedAt: Date;
};

export const ESTIMATOR_SELECT = {
  id: true,
  companyId: true,
  name: true,
  description: true,
  spec: true,
  isActive: true,
  runs: true,
  assists: true,
  isPublic: true,
  publicSlug: true,
  publicConfig: true,
  publicViews: true,
  publicCalcs: true,
  submissions: true,
  sourceListingId: true,
  updatedAt: true,
} as const;

/** Hosted path of a tool's website form ("" when it isn't published). */
export function publicEstimatePath(companySlug: string, row: { isPublic: boolean; publicSlug: string | null }): string {
  return row.isPublic && row.publicSlug ? `/book/${companySlug}/estimate/${row.publicSlug}` : "";
}

export type PublicEstimatorCompany = NonNullable<Awaited<ReturnType<typeof resolvePublicCompany>>>;

export type PublicEstimator = {
  company: PublicEstimatorCompany;
  row: EstimatorRow;
  spec: EstimatorSpec;
  compiled: CompiledSpec;
  config: EstimatorPublicConfig;
  /** A manager of this company looking at their own unpublished form */
  previewing: boolean;
};

/**
 * Public resolution of a website form: the shared public-company gate
 * (suspended / pre-approval companies vanish), then an ACTIVE + PUBLIC tool
 * by slug. `preview` lets a signed-in manager of that company see a form
 * that isn't published yet (the settings sheet's Preview button); anyone
 * else gets the public view.
 */
export async function resolvePublicEstimator(companySlug: string, publicSlug: string, opts: { preview?: boolean } = {}): Promise<PublicEstimator | null> {
  let previewing = false;
  let company: PublicEstimatorCompany | null = null;
  if (opts.preview) {
    const actor = await getActor();
    if (actor && isManager(actor.role)) {
      const own = await prisma.company.findUnique({ where: { id: actor.companyId } });
      if (own && own.slug === companySlug) {
        company = own;
        previewing = true;
      }
    }
  }
  if (!company) company = await resolvePublicCompany(companySlug);
  if (!company) return null;
  const row = await prisma.estimator.findFirst({
    where: { companyId: company.id, publicSlug, isActive: true, ...(previewing ? {} : { isPublic: true }) },
    select: ESTIMATOR_SELECT,
  });
  if (!row) return null;
  const c = compileSpec(row.spec);
  if (!c.ok) return null;
  return { company, row, spec: c.compiled.spec, compiled: c.compiled, config: sanitizePublicConfig(row.publicConfig), previewing };
}

/** The company's published forms, for the booking page menu. */
export async function publicEstimatorsFor(companyId: string) {
  const rows = await prisma.estimator.findMany({
    where: { companyId, isActive: true, isPublic: true, publicSlug: { not: null } },
    select: { id: true, name: true, description: true, publicSlug: true, publicConfig: true, spec: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((r) => specFromJson(r.spec))
    .map((r) => {
      const config = sanitizePublicConfig(r.publicConfig);
      return { id: r.id, slug: r.publicSlug as string, heading: config.heading || r.name, description: config.intro || r.description, showPrice: config.showPrice };
    });
}

/** Run a stored tool for a company; counts the run. Stored specs always compile. */
export async function runStoredEstimator(
  row: { id: string; spec: unknown },
  companyId: string,
  inputs: Record<string, unknown>,
  opts: { count?: boolean } = {}
): Promise<EstimatorRun> {
  const c = compileSpec(row.spec);
  if (!c.ok) return { ok: false, errors: ["This tool's saved rules no longer compile — edit it with Atlas.", ...c.errors] };
  const book = await loadPriceBook(companyId);
  const result = runCompiled(c.compiled, inputs, book);
  if (result.ok && opts.count !== false) {
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
    isPublic: row.isPublic,
    publicSlug: row.publicSlug,
    publicConfig: sanitizePublicConfig(row.publicConfig),
    publicViews: row.publicViews,
    publicCalcs: row.publicCalcs,
    submissions: row.submissions,
    sourceListingId: row.sourceListingId,
    updatedAt: row.updatedAt,
  };
}

/** Is this public slug free for the company (ignoring `exceptId`)? */
export async function publicSlugTaken(companyId: string, slug: string, exceptId?: string): Promise<boolean> {
  const hit = await prisma.estimator.findFirst({ where: { companyId, publicSlug: slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
  return Boolean(hit);
}

// ── version history ──────────────────────────────────────────────────────────

/** Snapshots kept per tool — enough to undo a bad week of edits, small enough to stay cheap. */
export const ESTIMATOR_VERSION_KEEP = 25;

export type VersionBy = { id: string; name: string } | null;

/** Keep the tool AS IT IS NOW, right before it changes. Trims to the last ESTIMATOR_VERSION_KEEP. */
export async function snapshotEstimator(
  row: { id: string; companyId: string; name: string; description: string | null; spec: unknown },
  note: string,
  by: VersionBy
): Promise<void> {
  await prisma.estimatorVersion.create({
    data: {
      estimatorId: row.id,
      companyId: row.companyId,
      name: row.name,
      description: row.description,
      spec: row.spec as Prisma.InputJsonValue,
      note: note.slice(0, 120),
      byUserId: by?.id ?? null,
      byName: by?.name ?? null,
    },
  });
  const stale = await prisma.estimatorVersion.findMany({
    where: { estimatorId: row.id },
    orderBy: { createdAt: "desc" },
    skip: ESTIMATOR_VERSION_KEEP,
    select: { id: true },
  });
  if (stale.length > 0) await prisma.estimatorVersion.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
}

export type EstimatorVersionRow = {
  id: string;
  note: string;
  byName: string | null;
  createdAt: string;
  name: string;
  inputs: number;
  lines: number;
  broken: boolean;
  /** What the edit AFTER this snapshot changed (the newest compares against the live tool). */
  changes: string[];
};

/** Newest first. */
export async function listEstimatorVersions(row: { id: string; name: string; spec: unknown }): Promise<EstimatorVersionRow[]> {
  const rows = await prisma.estimatorVersion.findMany({
    where: { estimatorId: row.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, spec: true, note: true, byName: true, createdAt: true },
  });
  const live = specFromJson(row.spec);
  return rows.map((v, i) => {
    const mine = specFromJson(v.spec);
    const next = i === 0 ? live : specFromJson(rows[i - 1].spec);
    const nextName = i === 0 ? row.name : rows[i - 1].name;
    const changes = mine && next ? describeSpecChanges(mine, next) : [];
    if (v.name !== nextName) changes.unshift(`Renamed "${v.name}" → "${nextName}"`);
    return {
      id: v.id,
      note: v.note,
      byName: v.byName,
      createdAt: v.createdAt.toISOString(),
      name: v.name,
      inputs: mine?.inputs.length ?? 0,
      lines: mine?.lines.length ?? 0,
      broken: !mine,
      changes,
    };
  });
}
