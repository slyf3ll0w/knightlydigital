import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { invalidateClientTheme, themeContextFor } from "@/lib/client-theme-load";
import { mergeThemePatch, parseClientTheme, type ClientThemeSpec, type ThemeProblem } from "@/lib/client-theme-spec";

/**
 * Drafts, publishing and history for a company's client-page theme (the AI
 * page designer, docs/plans/ai-portal-designer-2026-11-20.md). The ONE write
 * path: the Settings → Client pages routes, the Atlas / connector design
 * tools and the superadmin reset all go through here, so the rules (spec
 * checks, one draft per company, versions, rate limits, cache invalidation)
 * live in one place.
 *
 * Decided with David 2026-11-20: a draft saves without an approval card
 * (clients never see it); Publish / revert / reset always come from a
 * person's tap (the route), never directly from an AI tool.
 */

export const THEME_SOURCES = ["app", "atlas", "connector"] as const;
export type ThemeSource = (typeof THEME_SOURCES)[number];

const PREVIEW_DAYS = 7;
const KEEP_VERSIONS = 20;
export const THEME_LIMITS = {
  draftsPerHour: 30,
  publishesPerDay: 10,
  uploadsPerDay: 20,
} as const;

export type ThemeRow = {
  id: string;
  version: number;
  status: string;
  note: string | null;
  source: string;
  spec: ClientThemeSpec;
  createdAt: Date;
  publishedAt: Date | null;
  previewToken: string | null;
  previewExpiresAt: Date | null;
};

export type ThemeState = {
  published: ThemeRow | null;
  draft: ThemeRow | null;
  /** Newest first, published and archived, at most KEEP_VERSIONS. */
  versions: ThemeRow[];
};

export class ThemeError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: "RATE_LIMITED" | "NOT_FOUND" | "INVALID" = "INVALID",
    public problems: ThemeProblem[] = [],
  ) {
    super(message);
  }
}

const SELECT = {
  id: true,
  version: true,
  status: true,
  note: true,
  source: true,
  spec: true,
  createdAt: true,
  publishedAt: true,
  previewToken: true,
  previewExpiresAt: true,
} as const;

function row(r: { spec: unknown } & Omit<ThemeRow, "spec">): ThemeRow {
  return { ...r, spec: (r.spec ?? { v: 1 }) as ClientThemeSpec };
}

/** The path a person opens to preview a draft (fixture data for portal/login, the real booking page in preview mode). */
export function draftPreviewPath(token: string, doc: "hub" | "login" | "book" | "form" = "hub"): string {
  return `/client-preview?theme=${encodeURIComponent(token)}&doc=${doc}`;
}

export async function getThemeState(companyId: string): Promise<ThemeState> {
  const [company, rows] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { publishedThemeId: true } }),
    prisma.clientTheme.findMany({ where: { companyId }, orderBy: { version: "desc" }, take: KEEP_VERSIONS + 1, select: SELECT }),
  ]);
  const all = rows.map(row);
  return {
    published: all.find((r) => r.id === company?.publishedThemeId) ?? null,
    draft: all.find((r) => r.status === "draft") ?? null,
    versions: all.filter((r) => r.status !== "draft").slice(0, KEEP_VERSIONS),
  };
}

async function nextVersion(companyId: string): Promise<number> {
  const top = await prisma.clientTheme.findFirst({ where: { companyId }, orderBy: { version: "desc" }, select: { version: true } });
  return (top?.version ?? 0) + 1;
}

function newToken() {
  return randomBytes(18).toString("base64url");
}

/**
 * Merge `patch` over the current draft (or, when there is none, over the
 * published theme), check it, and save it as the company's one draft.
 * Pieces that fail a rule are left out and come back in `problems` so the
 * caller (a person or an AI) can fix them. `replace: true` saves `patch` as
 * the whole spec instead of merging.
 */
export async function saveDraft(
  companyId: string,
  patch: unknown,
  opts: { note?: string | null; source: ThemeSource; userId?: string | null; replace?: boolean },
): Promise<{ draft: ThemeRow; problems: ThemeProblem[]; ignored: string[]; previewPath: string }> {
  const rl = await limit(`client-theme:draft:${companyId}`, THEME_LIMITS.draftsPerHour, 60 * 60 * 1000);
  if (!rl.ok) throw new ThemeError("Too many design changes in the last hour. Try again a little later.", 429, "RATE_LIMITED");

  const state = await getThemeState(companyId);
  const base = opts.replace ? {} : (state.draft?.spec ?? state.published?.spec ?? { v: 1 });
  const merged = opts.replace ? patch : mergeThemePatch(base, patch);
  const ctx = await themeContextFor(companyId);
  const parsed = parseClientTheme(merged, ctx);
  if (parsed.problems.some((p) => p.fatal)) {
    throw new ThemeError(parsed.problems.find((p) => p.fatal)!.message, 400, "INVALID", parsed.problems);
  }
  const note = opts.note === undefined ? (state.draft?.note ?? null) : opts.note ? opts.note.slice(0, 80) : null;
  const expires = new Date(Date.now() + PREVIEW_DAYS * 86_400_000);
  const spec = JSON.parse(JSON.stringify(parsed.theme));

  const saved = state.draft
    ? await prisma.clientTheme.update({
        where: { id: state.draft.id },
        data: { spec, note, source: opts.source, createdById: opts.userId ?? null, previewToken: state.draft.previewToken ?? newToken(), previewExpiresAt: expires },
        select: SELECT,
      })
    : await prisma.clientTheme.create({
        data: { companyId, spec, note, status: "draft", version: await nextVersion(companyId), source: opts.source, createdById: opts.userId ?? null, previewToken: newToken(), previewExpiresAt: expires },
        select: SELECT,
      });
  const draft = row(saved);
  return { draft, problems: parsed.problems, ignored: parsed.ignored, previewPath: draftPreviewPath(draft.previewToken!) };
}

export async function discardDraft(companyId: string): Promise<void> {
  await prisma.clientTheme.deleteMany({ where: { companyId, status: "draft" } });
}

/**
 * What a person confirmed: publish the draft, put an older version back
 * (as a NEW version, so history only grows), or go back to the default
 * look. Archives the previously published row and prunes history.
 */
export type PublishTarget = { draft: true } | { version: number } | { reset: true };

export async function publishTheme(
  companyId: string,
  target: PublishTarget,
  opts: { userId?: string | null; source?: ThemeSource } = {},
): Promise<{ published: ThemeRow | null; problems: ThemeProblem[] }> {
  const rl = await limit(`client-theme:publish:${companyId}`, THEME_LIMITS.publishesPerDay, 24 * 60 * 60 * 1000);
  if (!rl.ok) throw new ThemeError("That's the most publishes for one day. Try again tomorrow.", 429, "RATE_LIMITED");

  if ("reset" in target) {
    await prisma.$transaction([
      prisma.clientTheme.updateMany({ where: { companyId, status: "published" }, data: { status: "archived" } }),
      prisma.company.update({ where: { id: companyId }, data: { publishedThemeId: null } }),
    ]);
    invalidateClientTheme(companyId);
    return { published: null, problems: [] };
  }

  const ctx = await themeContextFor(companyId);
  let sourceRow: { id: string; spec: unknown; note: string | null; status: string } | null;
  if ("draft" in target) {
    sourceRow = await prisma.clientTheme.findFirst({ where: { companyId, status: "draft" }, select: { id: true, spec: true, note: true, status: true } });
    if (!sourceRow) throw new ThemeError("There is no draft to publish.", 404, "NOT_FOUND");
  } else {
    sourceRow = await prisma.clientTheme.findFirst({ where: { companyId, version: target.version, status: { not: "draft" } }, select: { id: true, spec: true, note: true, status: true } });
    if (!sourceRow) throw new ThemeError(`Version ${target.version} isn't in this company's history.`, 404, "NOT_FOUND");
  }
  // Re-check at publish time: an item or photo may have been deleted since.
  const parsed = parseClientTheme(sourceRow.spec, ctx);
  if (!parsed.ok && parsed.problems.some((p) => p.fatal)) throw new ThemeError("This look can't be published as it is.", 400, "INVALID", parsed.problems);
  const spec = JSON.parse(JSON.stringify(parsed.theme));
  const now = new Date();

  const published = await prisma.$transaction(async (tx) => {
    await tx.clientTheme.updateMany({ where: { companyId, status: "published" }, data: { status: "archived" } });
    const r =
      "draft" in target
        ? await tx.clientTheme.update({ where: { id: sourceRow!.id }, data: { spec, status: "published", publishedAt: now, previewToken: null, previewExpiresAt: null }, select: SELECT })
        : await tx.clientTheme.create({
            data: {
              companyId,
              spec,
              note: sourceRow!.note,
              status: "published",
              version: ((await tx.clientTheme.findFirst({ where: { companyId }, orderBy: { version: "desc" }, select: { version: true } }))?.version ?? 0) + 1,
              source: opts.source ?? "app",
              createdById: opts.userId ?? null,
              publishedAt: now,
            },
            select: SELECT,
          });
    await tx.company.update({ where: { id: companyId }, data: { publishedThemeId: r.id } });
    return r;
  });

  // Keep the newest KEEP_VERSIONS non-draft rows.
  const old = await prisma.clientTheme.findMany({ where: { companyId, status: "archived" }, orderBy: { version: "desc" }, skip: KEEP_VERSIONS - 1, select: { id: true } });
  if (old.length) await prisma.clientTheme.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });

  invalidateClientTheme(companyId);
  return { published: row(published), problems: parsed.problems };
}
