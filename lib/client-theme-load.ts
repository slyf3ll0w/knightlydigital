import { cache } from "react";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { PLAN_HOLDER_SELECT, featureAllowed } from "@/lib/plans";
import { clientBand } from "@/lib/client-band";
import { DEFAULT_THEME, parseClientTheme, resolveTheme, type ParsedClientTheme, type ResolvedClientTheme, type ThemeContext } from "@/lib/client-theme-spec";

/**
 * Reading a company's client-pages theme (AI page designer,
 * docs/plans/ai-portal-designer-2026-11-20.md → "Storage model"). Server
 * only. The four client surfaces (portal login, client portal, booking page,
 * the booking forms + embeds) call loadClientTheme; the quote page, the pay
 * page and client emails never do.
 *
 * Kept apart from lib/client-theme.ts on purpose: that file is the pure
 * color resolver emails and client components import, and must never pull
 * Prisma into a client bundle.
 */

/** Where a ThemeAsset is served from (the company-scoped route lands in phase 5). */
export function themeAssetUrl(companyId: string, assetId: string): string {
  return `/api/theme-assets/${encodeURIComponent(companyId)}/${encodeURIComponent(assetId)}`;
}

const TTL_MS = 30_000;
const memo = new Map<string, { at: number; theme: ResolvedClientTheme }>();

/** Drop the cached theme after a publish / revert (phase 2 routes call this). */
export function invalidateClientTheme(companyId: string): void {
  memo.delete(companyId);
}

function defaultTheme(): ResolvedClientTheme {
  return resolveTheme(null);
}

/** The context a spec is checked against: this company's booking items and theme photos. */
export async function themeContextFor(companyId: string): Promise<ThemeContext> {
  const [types, assets, company] = await Promise.all([
    prisma.bookingType.findMany({ where: { companyId }, select: { id: true } }),
    prisma.themeAsset.findMany({ where: { companyId }, select: { id: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, brandColor: true, brandColorSecondary: true, documentColor: true } }),
  ]);
  return {
    bookingItemIds: types.map((t) => t.id),
    assetIds: assets.map((a) => a.id),
    defaultBand: company ? clientBand(company).band : undefined,
  };
}

/**
 * Turn a stored spec into a theme for rendering. The spec was valid when it
 * was written; things can drift since (an item deleted, a photo removed), so
 * it is checked again and only the pieces that still pass are used. A spec
 * that can't be read at all is the default look plus a reportError, never an
 * error page.
 */
export function resolveStoredSpec(raw: unknown, ctx: ThemeContext, companyId: string, label = "published"): { theme: ResolvedClientTheme; parsed: ParsedClientTheme } {
  const parsed = parseClientTheme(raw, ctx);
  if (parsed.problems.some((p) => p.fatal)) {
    reportError("[client-theme] unreadable theme spec", label, companyId, parsed.problems[0]?.message);
    return { theme: defaultTheme(), parsed };
  }
  if (parsed.problems.length) console.warn("[client-theme] theme pieces dropped", label, companyId, parsed.problems.map((p) => p.path).join(", "));
  return { theme: resolveTheme(parsed.theme, { imageUrl: (id) => themeAssetUrl(companyId, id) }), parsed };
}

async function loadUncached(companyId: string): Promise<ResolvedClientTheme> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { ...PLAN_HOLDER_SELECT, publishedThemeId: true } });
  if (!company?.publishedThemeId) return defaultTheme();
  // Off Pro: back to the company's colors + logo; the theme row is kept for when they return
  if (!featureAllowed(company, "page_designer")) return defaultTheme();
  const row = await prisma.clientTheme.findFirst({
    where: { id: company.publishedThemeId, companyId, status: "published" },
    select: { id: true, spec: true },
  });
  if (!row) {
    reportError("[client-theme] published theme row missing", companyId, company.publishedThemeId);
    return defaultTheme();
  }
  return resolveStoredSpec(row.spec, await themeContextFor(companyId), companyId, row.id).theme;
}

/**
 * The theme the company's client pages wear right now: its published spec,
 * fully defaulted, when it is on Pro (`page_designer`); otherwise — and on
 * any failure — today's look (resolveTheme(null)). Cached per request and
 * for 30 s per company.
 */
export const loadClientTheme = cache(async (companyId: string): Promise<ResolvedClientTheme> => {
  const hit = memo.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.theme;
  try {
    const theme = await loadUncached(companyId);
    memo.set(companyId, { at: Date.now(), theme });
    return theme;
  } catch (err) {
    reportError("[client-theme] load failed", companyId, err);
    return JSON.parse(JSON.stringify(DEFAULT_THEME)) as ResolvedClientTheme;
  }
});

export type ThemeDraft = {
  id: string;
  companyId: string;
  version: number;
  note: string | null;
  theme: ResolvedClientTheme;
  parsed: ParsedClientTheme;
  /** Whether the company may publish it (Pro). Previews render either way. */
  allowed: boolean;
};

/**
 * A DRAFT by its preview token, for /client-preview (phase 2): null when the
 * token is unknown, expired, or the row is no longer a draft. Not cached —
 * a draft changes with every edit.
 */
export async function loadClientThemeDraft(previewToken: string): Promise<ThemeDraft | null> {
  if (!previewToken || previewToken.length > 200) return null;
  const row = await prisma.clientTheme.findUnique({
    where: { previewToken },
    select: { id: true, companyId: true, version: true, note: true, spec: true, status: true, previewExpiresAt: true },
  });
  if (!row || row.status !== "draft") return null;
  if (!row.previewExpiresAt || row.previewExpiresAt.getTime() < Date.now()) return null;
  const company = await prisma.company.findUnique({ where: { id: row.companyId }, select: PLAN_HOLDER_SELECT });
  const { theme, parsed } = resolveStoredSpec(row.spec, await themeContextFor(row.companyId), row.companyId, `draft ${row.id}`);
  return { id: row.id, companyId: row.companyId, version: row.version, note: row.note, theme, parsed, allowed: company ? featureAllowed(company, "page_designer") : false };
}
