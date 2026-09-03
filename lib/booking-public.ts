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

/**
 * Loaders for the public booking pages (/book, /embed and their APIs).
 * `preview` is the owner looking at their own page from the settings editor:
 * inactive items render and the approval gate is skipped, but only for a
 * signed-in manager of that company — anyone else gets the public view.
 */

async function previewOpts(preview: boolean): Promise<{ opts: ResolveOpts; actorCompanyId: string | null }> {
  if (!preview) return { opts: {}, actorCompanyId: null };
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return { opts: {}, actorCompanyId: null };
  return { opts: { includeInactive: true, skipGate: true }, actorCompanyId: actor.companyId };
}

/** The company's booking page: every active item + the ones the menu shows. */
export async function loadBookingPage(companySlug: string, params: { preview?: boolean; overrides?: AppearanceOverrides } = {}) {
  const { opts, actorCompanyId } = await previewOpts(Boolean(params.preview));
  const listed = await listPublicBookingTypes(companySlug, opts);
  if (!listed) return null;
  const previewing = actorCompanyId === listed.company.id;
  if (opts.skipGate && !previewing) {
    // A manager of some other company asked to preview: fall back to the public view
    const pub = await listPublicBookingTypes(companySlug);
    if (!pub) return null;
    return { company: pub.company, appearance: appearanceFor(pub.company, params.overrides), types: pub.types, menu: menuTypes(pub.types), previewing: false };
  }
  return {
    company: listed.company,
    appearance: appearanceFor(listed.company, params.overrides),
    types: listed.types,
    menu: menuTypes(listed.types),
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
  params: { preview?: boolean; overrides?: AppearanceOverrides } = {}
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
  return {
    company: resolved.company,
    type: resolved.type,
    pub: toPublicBookingType(resolved.type, resolved.company),
    appearance: appearanceFor(resolved.company, params.overrides),
    previewing,
    menuCount: listed ? menuTypes(listed.types).length : 0,
  };
}
