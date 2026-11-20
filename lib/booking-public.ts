import { getActor, isManager } from "@/lib/permissions";
import {
  listPublicBookingTypes,
  menuTypes,
  resolvePublicBookingType,
  toPublicBookingType,
  type PublicBookingType,
  type ResolveOpts,
} from "@/lib/booking-runtime";
import { appearanceFor, type AppearanceOverrides, type ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import { loadClientTheme } from "@/lib/client-theme-load";
import { draftForPreview } from "@/lib/client-theme-store";
import { isDraftToken } from "@/lib/client-theme-requests";
import { orderBookingItems, themeBookingItem, type ResolvedClientTheme } from "@/lib/client-theme-spec";

/**
 * The booking menu under the company's page-designer theme (Pro): the
 * theme's item order, hidden items left off the menu (their own links keep
 * working), and its words on each row. Default theme = the menu as is.
 */
function themedMenu(types: PublicBookingType[], theme: ResolvedClientTheme): PublicBookingType[] {
  if (theme.isDefault) return menuTypes(types);
  return orderBookingItems(menuTypes(types), theme).map((t) => themeBookingItem(t, theme));
}

/**
 * Loaders for the public booking pages (/book, /embed and their APIs).
 * 'preview' is the owner looking at their own page from the settings editor:
 * inactive items render and the approval gate is skipped, but only for a
 * signed-in manager of that company — anyone else gets the public view.
 */

async function previewOpts(preview: boolean): Promise<{ opts: ResolveOpts; actorCompanyId: string | null }> {
  if (!preview) return { opts: {}, actorCompanyId: null };
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return { opts: {}, actorCompanyId: null };
  return { opts: { includeInactive: true, skipGate: true }, actorCompanyId: actor.companyId };
}

/**
 * The theme a page renders with: the published one, or — only for the owner
 * previewing their own page with ?theme=<draft token> (Settings → Client
 * pages) — that draft. A token for another company is ignored.
 */
async function themeFor(companyId: string, previewing: boolean, themeToken: string | undefined): Promise<ResolvedClientTheme> {
  if (previewing && isDraftToken(themeToken)) {
    const draft = await draftForPreview(themeToken, { companyId, manager: true });
    if (draft && draft.companyId === companyId) return draft.theme;
  }
  return loadClientTheme(companyId);
}

/** The company's booking page: every active item + the ones the menu shows. */
export async function loadBookingPage(companySlug: string, params: { preview?: boolean; overrides?: AppearanceOverrides; themeToken?: string } = {}) {
  const { opts, actorCompanyId } = await previewOpts(Boolean(params.preview));
  const listed = await listPublicBookingTypes(companySlug, opts);
  if (!listed) return null;
  const previewing = actorCompanyId === listed.company.id;
  if (opts.skipGate && !previewing) {
    // A manager of some other company asked to preview: fall back to the public view
    const pub = await listPublicBookingTypes(companySlug);
    if (!pub) return null;
    const theme = await loadClientTheme(pub.company.id);
    return { company: pub.company, appearance: appearanceFor(pub.company, params.overrides, theme), types: pub.types, menu: themedMenu(pub.types, theme), previewing: false };
  }
  const theme = await themeFor(listed.company.id, previewing, params.themeToken);
  return {
    company: listed.company,
    appearance: appearanceFor(listed.company, params.overrides, theme),
    types: listed.types,
    menu: themedMenu(listed.types, theme),
    previewing,
  };
}

export type LoadedItem = {
  company: NonNullable<Awaited<ReturnType<typeof resolvePublicBookingType>>>["company"];
  type: NonNullable<Awaited<ReturnType<typeof resolvePublicBookingType>>>["type"];
  pub: PublicBookingType;
  appearance: ScheduleAppearance;
  previewing: boolean;
  /** How many items the menu lists — decides whether "book something else" shows */
  menuCount: number;
};

/** One item by slug, with its appearance and whether the viewer is previewing. */
export async function loadBookingItem(
  companySlug: string,
  itemSlug: string,
  params: { preview?: boolean; overrides?: AppearanceOverrides; themeToken?: string } = {}
): Promise<LoadedItem | null> {
  const { opts, actorCompanyId } = await previewOpts(Boolean(params.preview));
  let resolved = await resolvePublicBookingType(companySlug, itemSlug, opts);
  let previewing = Boolean(resolved && actorCompanyId === resolved.company.id);
  if (resolved && opts.skipGate && !previewing) {
    resolved = await resolvePublicBookingType(companySlug, itemSlug);
    previewing = false;
  }
  if (!resolved) return null;
  const listed = await listPublicBookingTypes(companySlug, previewing ? opts : {});
  const theme = await themeFor(resolved.company.id, previewing, params.themeToken);
  return {
    company: resolved.company,
    type: resolved.type,
    pub: themeBookingItem(toPublicBookingType(resolved.type, resolved.company), theme),
    appearance: appearanceFor(resolved.company, params.overrides, theme),
    previewing,
    menuCount: listed ? themedMenu(listed.types, theme).length : 0,
  };
}
