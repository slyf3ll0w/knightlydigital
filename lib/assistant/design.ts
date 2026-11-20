import { prisma } from "../db";
import { isManager } from "../permissions";
import { featureAllowedFor } from "../plan-gate";
import { siteBase, str, stage, type Tool } from "./core";
import { draftPreviewPath, getThemeState, saveDraft, specFingerprint, ThemeError, type ThemeRow } from "../client-theme-store";
import { themeContextFor } from "../client-theme-load";
import {
  BAND_STYLES,
  BOOKING_HEROES,
  BUTTON_STYLES,
  CORNER_STYLES,
  LOGIN_LAYOUTS,
  LOGO_PLACEMENTS,
  LOGO_SIZES,
  PORTAL_PINNED_SECTIONS,
  PORTAL_SECTION_LABEL,
  PORTAL_SECTIONS,
  THEME_FONTS,
  parseClientTheme,
  themeSpecGuide,
  type ClientThemeSpec,
  type ThemeProblem,
} from "../client-theme-spec";

/**
 * The AI page designer's tools (docs/plans/ai-portal-designer-2026-11-20.md
 * → "Atlas + connector tools"). One job each:
 *
 *   get_client_theme      READ    the live look, the draft, what is allowed, the booking items, the photos, history
 *   draft_client_theme    DRAFT   saves the company's ONE draft directly (no card — David 2026-11-20: clients never
 *                                 see a draft); returns the problems to fix and the preview links
 *   publish_client_theme  card    POST /api/app/client-theme/publish { draft: true }
 *   revert_client_theme   card    the same route, { version } or { reset: true }
 *
 * The write path is lib/client-theme-store.ts (the same one Settings → Client
 * pages uses); publishing only ever happens from a person's Confirm on the card,
 * through the route, so the role, plan and rate-limit checks run once.
 *
 * Photos: the drawer has no attachment channel, and outside AIs cannot upload
 * or point at a URL, so a theme can only use photos already uploaded in
 * Settings → Client pages (their ids come back from get_client_theme).
 */

/** What every design tool answers off Pro (lib/plans.ts "page_designer"). */
export const DESIGN_GATE_NOTE =
  "Custom client pages (the page designer) are part of the Pro plan, which isn't on this account. The booking page's basic look and the brand colors still work through update_company_settings.";

const SETTINGS_PATH = "/app/settings/client-pages";
const PUBLISH_ENDPOINT = "/api/app/client-theme/publish";

/** Absolute preview links for a draft's token, one per surface. */
export function previewLinks(token: string): Record<"portal" | "login" | "booking" | "form", string> {
  const base = siteBase();
  return {
    portal: `${base}${draftPreviewPath(token, "hub")}`,
    login: `${base}${draftPreviewPath(token, "login")}`,
    booking: `${base}${draftPreviewPath(token, "book")}`,
    form: `${base}${draftPreviewPath(token, "form")}`,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Top-level spec keys the draft tool takes as they are (itemWords is reshaped). */
const SPEC_KEYS = ["colors", "font", "logo", "band", "buttons", "corners", "portal", "login", "booking"] as const;

/**
 * The tool's arguments → a spec patch for saveDraft. Pure.
 * - the spec's own keys pass through (the store's checks clean them);
 * - itemWords comes as a list ({ itemId, description, button }) because a tool
 *   schema can't name a map keyed by ids; "" for a word = the item's own;
 * - clear = dotted paths put back to the default ("colors.accent",
 *   "booking.heading", "itemWords.<itemId>", "band").
 */
export function themePatchFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of SPEC_KEYS) if (args[k] !== undefined && args[k] !== null) patch[k] = args[k];
  if (Array.isArray(args.itemWords)) {
    const words: Record<string, unknown> = {};
    for (const w of args.itemWords.slice(0, 40)) {
      if (!isObj(w)) continue;
      const id = str(w.itemId ?? w.id, 40);
      if (!id) continue;
      const entry: Record<string, unknown> = {};
      if (typeof w.description === "string") entry.description = w.description;
      if (typeof w.button === "string") entry.button = w.button;
      words[id] = Object.keys(entry).length ? entry : null;
    }
    if (Object.keys(words).length) patch.itemWords = words;
  }
  if (Array.isArray(args.clear)) {
    for (const raw of args.clear.slice(0, 40)) {
      const path = str(raw, 80);
      if (!/^[A-Za-z][\w-]*(\.[\w-]+){0,2}$/.test(path)) continue;
      const parts = path.split(".");
      if (!(SPEC_KEYS as readonly string[]).includes(parts[0]) && parts[0] !== "itemWords") continue;
      let at = patch;
      for (const part of parts.slice(0, -1)) {
        if (!isObj(at[part])) at[part] = {};
        at = at[part] as Record<string, unknown>;
      }
      at[parts[parts.length - 1]] = null;
    }
  }
  return patch;
}

const SIZE_WORD = { sm: "small", md: "medium", lg: "large" } as const;
const PLACE_WORD = { "band-left": "on the left of the band", "band-center": "centered in the band" } as const;
const HERO_WORD = { plain: "plain heading", "photo-left": "photo beside the heading", "photo-behind": "photo behind the heading" } as const;
const LOGIN_WORD = { "band-top": "band on top", split: "photo beside the form", "photo-full": "photo behind the form" } as const;

/**
 * A spec in plain lines, for the publish / put-back cards (the person reads
 * these, the model does not). `itemNames` turns booking item ids into names. Pure.
 */
export function describeTheme(spec: ClientThemeSpec | null | undefined, itemNames: Record<string, string> = {}): string[] {
  if (!spec) return ["The default look: your logo and brand colors, nothing else changed"];
  const lines: string[] = [];
  const c = spec.colors ?? {};
  const colors = [c.band && `band ${c.band}`, c.accent && `buttons ${c.accent}`, c.ground && `page tint ${c.ground}`].filter(Boolean);
  if (colors.length) lines.push(`Colors: ${colors.join(", ")}`);
  if (spec.font) lines.push(`Headings font: ${spec.font}`);
  if (spec.logo?.size || spec.logo?.placement) {
    lines.push(`Logo: ${[spec.logo.size && SIZE_WORD[spec.logo.size], spec.logo.placement && PLACE_WORD[spec.logo.placement]].filter(Boolean).join(", ")}`);
  }
  if (spec.band?.style) lines.push(`Band: ${spec.band.style}${spec.band.style === "photo" ? ` (photo, ${Math.round((spec.band.overlay ?? 0.45) * 100)}% shade)` : ""}`);
  const shape = [spec.buttons && `${spec.buttons} buttons`, spec.corners && `${spec.corners} corners`].filter(Boolean);
  if (shape.length) lines.push(`Style: ${shape.join(", ")}`);
  if (spec.portal?.sections) {
    const shown = spec.portal.sections;
    const hidden = PORTAL_SECTIONS.filter((s) => !shown.includes(s));
    lines.push(`Portal home: ${shown.map((s) => PORTAL_SECTION_LABEL[s].replace(/ \(.*\)$/, "")).join(" → ")}${hidden.length ? ` (hidden: ${hidden.map((s) => PORTAL_SECTION_LABEL[s]).join(", ")})` : ""}`);
  }
  if (spec.portal?.welcome) lines.push(`Portal welcome: "${spec.portal.welcome}"`);
  if (spec.login?.layout || spec.login?.heading) {
    lines.push(`Portal sign-in: ${[spec.login.layout && LOGIN_WORD[spec.login.layout], spec.login.heading && `"${spec.login.heading}"`].filter(Boolean).join(", ")}`);
  }
  if (spec.booking?.hero) lines.push(`Booking page: ${HERO_WORD[spec.booking.hero]}`);
  if (spec.booking?.heading) lines.push(`Booking heading: "${spec.booking.heading}"`);
  if (spec.booking?.line) lines.push(`Booking line: "${spec.booking.line}"`);
  if (spec.booking?.thankYou) lines.push(`Thank-you message: "${spec.booking.thankYou}"`);
  if (spec.booking?.items?.length) {
    const name = (id: string) => itemNames[id] ?? "an item";
    const shown = spec.booking.items.filter((i) => i.show).map((i) => name(i.id));
    const hidden = spec.booking.items.filter((i) => !i.show).map((i) => name(i.id));
    lines.push(`Booking items: ${shown.join(", ") || "none listed"}${hidden.length ? ` (hidden from the menu: ${hidden.join(", ")})` : ""}`);
  }
  const words = Object.keys(spec.itemWords ?? {});
  if (words.length) lines.push(`Own words on: ${words.map((id) => itemNames[id] ?? "an item").join(", ")}`);
  return lines.length ? lines : ["The default look: your logo and brand colors, nothing else changed"];
}

/** Problems as the model gets them: what, where, and the color that would pass. */
function problemList(problems: ThemeProblem[]) {
  return problems.slice(0, 20).map((p) => ({
    path: p.path,
    problem: p.message,
    ...(p.ratio !== undefined ? { ratio: p.ratio, needed: p.needed } : {}),
    ...(p.suggestion ? { useInstead: p.suggestion } : {}),
  }));
}

function rowSummary(r: ThemeRow) {
  return { version: r.version, note: r.note, status: r.status, source: r.source, publishedAt: r.publishedAt?.toISOString() ?? null };
}

async function itemNameMap(companyId: string): Promise<Record<string, string>> {
  const rows = await prisma.bookingType.findMany({ where: { companyId }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

const gate = async (companyId: string) => featureAllowedFor(companyId, "page_designer");

const STR = { type: "string" } as const;
const SPEC_PROPERTIES = {
  colors: {
    type: "object",
    description: "#RRGGBB only. band = the top band; accent = buttons (needs 3:1 on white and readable button text); ground = the page tint (must be near-white). A failing color comes back with the nearest one that passes.",
    properties: { band: STR, accent: STR, ground: STR },
  },
  font: { type: "string", enum: [...THEME_FONTS], description: "Headings, the band title and buttons; body text stays as it is" },
  logo: { type: "object", properties: { size: { type: "string", enum: [...LOGO_SIZES] }, placement: { type: "string", enum: [...LOGO_PLACEMENTS] } } },
  band: {
    type: "object",
    properties: {
      style: { type: "string", enum: [...BAND_STYLES] },
      imageId: { type: "string", description: "a photo id from get_client_theme's photos (style photo)" },
      overlay: { type: "number", description: "band color laid over the photo, 0 to 0.7" },
    },
  },
  buttons: { type: "string", enum: [...BUTTON_STYLES] },
  corners: { type: "string", enum: [...CORNER_STYLES] },
  portal: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: { type: "string", enum: [...PORTAL_SECTIONS] },
        description: `the portal home's sections in order; leaving one out hides it. ${PORTAL_PINNED_SECTIONS.join(" and ")} must stay`,
      },
      welcome: { type: "string", description: "one welcome line, plain text, no links or phone numbers" },
    },
  },
  login: {
    type: "object",
    properties: {
      layout: { type: "string", enum: [...LOGIN_LAYOUTS] },
      imageId: { type: "string", description: "a photo id from get_client_theme's photos" },
      heading: STR,
    },
  },
  booking: {
    type: "object",
    properties: {
      hero: { type: "string", enum: [...BOOKING_HEROES] },
      items: {
        type: "array",
        description: "the booking menu's order; show false hides an item from the menu (its own link still works). ids from get_client_theme's bookingItems",
        items: { type: "object", properties: { id: STR, show: { type: "boolean" } }, required: ["id", "show"] },
      },
      heading: STR,
      line: { type: "string", description: "one line under the heading" },
      thankYou: { type: "string", description: "the thank-you message after a form is sent (items with their own keep theirs)" },
    },
  },
} as const;

export const designTools: Tool[] = [
  {
    decl: {
      name: "get_client_theme",
      description:
        "The look of the business's client pages (client portal, portal sign-in, booking page and its forms): the live published look (null = the default look), the current draft with its preview links, the last versions, every allowed value (fonts, styles, layouts, portal section ids, word limits, contrast rules), this company's booking items with their ids, and the photos uploaded for the pages.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor) => {
      if (!(await gate(actor.companyId))) return { error: DESIGN_GATE_NOTE };
      const [state, items, photos, company] = await Promise.all([
        getThemeState(actor.companyId),
        prisma.bookingType.findMany({
          where: { companyId: actor.companyId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, kind: true, description: true, isActive: true, showOnPage: true },
          take: 60,
        }),
        prisma.themeAsset.findMany({ where: { companyId: actor.companyId }, orderBy: { createdAt: "desc" }, select: { id: true, width: true, height: true, createdAt: true }, take: 40 }),
        prisma.company.findUnique({ where: { id: actor.companyId }, select: { brandColor: true, brandColorSecondary: true, hubBookingTypeId: true } }),
      ]);
      const draft = state.draft;
      return {
        published: state.published ? { ...rowSummary(state.published), spec: state.published.spec } : null,
        draft: draft
          ? {
              ...rowSummary(draft),
              savedAt: draft.createdAt.toISOString(),
              spec: draft.spec,
              ...(draft.previewToken ? { previewLinks: previewLinks(draft.previewToken) } : {}),
            }
          : null,
        history: state.versions.slice(0, 5).map((v) => ({ ...rowSummary(v), live: v.id === state.published?.id })),
        allowed: themeSpecGuide(),
        brandColors: { primary: company?.brandColor ?? null, secondary: company?.brandColorSecondary ?? null },
        bookingItems: items.map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          description: i.description,
          active: i.isActive,
          onMenu: i.showOnPage,
          ...(company?.hubBookingTypeId === i.id ? { clientPortalForm: true } : {}),
        })),
        photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, added: p.createdAt.toISOString().slice(0, 10) })),
        note: `Photos are added in Settings → Client pages (${SETTINGS_PATH}); a theme can only use these ids. Form questions are edited with manage_booking_item, not here.`,
      };
    },
  },
  {
    decl: {
      name: "draft_client_theme",
      description:
        "Save changes to the DRAFT look of the client pages (portal, portal sign-in, booking page, forms). Only the pieces given change; the rest of the draft is kept (or, with no draft yet, the live look). Clients see nothing: the draft shows only on its preview links until a person publishes it. Returns the problems with any piece that was refused (with the color to use instead), the pieces ignored, and the preview links. Copy is plain text: no links, emails or phone numbers.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "a short name for this look, e.g. 'Dark green, crew photo' (shown on the publish card and in history)" },
          ...SPEC_PROPERTIES,
          itemWords: {
            type: "array",
            description: "display words for booking items: the menu description and the button. '' = the item's own words",
            items: { type: "object", properties: { itemId: STR, description: STR, button: STR }, required: ["itemId"] },
          },
          clear: { type: "array", items: STR, description: "pieces to put back to the default, as dotted paths: 'colors.accent', 'booking.heading', 'band', 'itemWords.<itemId>'" },
          startOver: { type: "boolean", description: "true = the draft becomes ONLY what is given here (everything else back to the default)" },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      if (!(await gate(actor.companyId))) return { error: DESIGN_GATE_NOTE };
      const patch = themePatchFromArgs(args);
      const note = typeof args.note === "string" ? str(args.note, 80) : undefined;
      if (Object.keys(patch).length === 0 && note === undefined && args.startOver !== true) {
        return { error: "Nothing to change — give at least one piece of the look (colors, font, portal, login, booking…)." };
      }
      try {
        const saved = await saveDraft(actor.companyId, patch, {
          note,
          source: ctx.via === "connector" ? "connector" : "atlas",
          userId: actor.id,
          replace: args.startOver === true,
        });
        return {
          saved: true,
          draftVersion: saved.draft.version,
          note: saved.draft.note,
          spec: saved.draft.spec,
          ...(saved.problems.length ? { problems: problemList(saved.problems) } : {}),
          ...(saved.ignored.length ? { ignored: saved.ignored.slice(0, 20) } : {}),
          previewLinks: saved.draft.previewToken ? previewLinks(saved.draft.previewToken) : null,
          next: saved.problems.length
            ? "The pieces named in problems were left out of the draft. Fix them (use the suggested color) and call draft_client_theme again, then share a preview link."
            : "Draft saved; clients see nothing yet. Share a preview link; publish_client_theme prepares the card that puts it live.",
        };
      } catch (err) {
        if (err instanceof ThemeError) return { error: err.message, ...(err.problems.length ? { problems: problemList(err.problems) } : {}) };
        throw err;
      }
    },
  },
  {
    decl: {
      name: "publish_client_theme",
      description:
        "Stage the card that publishes the current draft look, so clients see it on the client portal, the portal sign-in, the booking page and its forms. The page that was live goes into history and can be put back with revert_client_theme. Confirmation card required.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, _args, ctx) => {
      if (!(await gate(actor.companyId))) return { error: DESIGN_GATE_NOTE };
      const state = await getThemeState(actor.companyId);
      const draft = state.draft;
      if (!draft) return { error: "There is no draft to publish. Save one with draft_client_theme first." };
      const [checkCtx, names] = await Promise.all([themeContextFor(actor.companyId), itemNameMap(actor.companyId)]);
      const parsed = parseClientTheme(draft.spec, checkCtx);
      if (parsed.problems.some((p) => p.fatal)) return { error: "The draft can't be published as it is.", problems: problemList(parsed.problems) };
      const lines = [
        ...describeTheme(parsed.theme, names),
        ...(parsed.problems.length ? [`Left out because it no longer passes: ${parsed.problems.map((p) => p.path).join(", ")}`] : []),
        "Goes live on the client portal, portal sign-in, booking page and forms. Quotes, invoices, pay pages and emails don't change.",
        ...(draft.previewToken ? [`Preview: ${draftPreviewPath(draft.previewToken, "hub")}`] : []),
      ];
      return stage(ctx, {
        kind: "publish_client_theme",
        title: `Publish new look (v${draft.version})${draft.note ? `: ${draft.note}` : ""}`,
        lines,
        endpoint: PUBLISH_ENDPOINT,
        method: "POST",
        payload: { draft: true, expect: specFingerprint(draft.spec) },
        confirmLabel: "Publish",
        href: SETTINGS_PATH,
      });
    },
  },
  {
    decl: {
      name: "revert_client_theme",
      description:
        "Stage the card that puts an earlier look of the client pages back live (a version from get_client_theme's history; it comes back as a new version, so nothing is lost), or goes back to the default look ('default': the company's logo and brand colors). Confirmation card required.",
      parameters: {
        type: "object",
        properties: { version: { type: "string", description: "a version number from the history, or 'default'" } },
        required: ["version"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      if (!(await gate(actor.companyId))) return { error: DESIGN_GATE_NOTE };
      const raw = String(args.version ?? "").trim().toLowerCase().replace(/^v/, "");
      const state = await getThemeState(actor.companyId);
      if (raw === "default") {
        if (!state.published) return { error: "The client pages already use the default look." };
        return stage(ctx, {
          kind: "revert_client_theme",
          title: "Go back to the default look",
          lines: [
            `Takes down the live look (v${state.published.version}${state.published.note ? `: ${state.published.note}` : ""})`,
            "The client portal, sign-in, booking page and forms go back to your logo and brand colors",
            "The look stays in history and can be put back",
          ],
          endpoint: PUBLISH_ENDPOINT,
          method: "POST",
          payload: { reset: true },
          confirmLabel: "Reset",
          href: SETTINGS_PATH,
        });
      }
      const version = Number(raw);
      if (!Number.isInteger(version) || version < 1) return { error: "version must be a version number from get_client_theme's history, or 'default'." };
      const row = state.versions.find((v) => v.version === version);
      if (!row) return { error: `Version ${version} isn't in this company's history (it keeps the last 20). Check get_client_theme.` };
      if (row.id === state.published?.id) return { error: `Version ${version} is already the live look.` };
      const names = await itemNameMap(actor.companyId);
      return stage(ctx, {
        kind: "revert_client_theme",
        title: `Put back look v${version}${row.note ? `: ${row.note}` : ""}`,
        lines: [
          ...describeTheme(row.spec, names),
          state.published ? `Replaces the live look (v${state.published.version}), which stays in history` : "Replaces the default look",
        ],
        endpoint: PUBLISH_ENDPOINT,
        method: "POST",
        payload: { version },
        confirmLabel: "Put it back",
        href: SETTINGS_PATH,
      });
    },
  },
];
