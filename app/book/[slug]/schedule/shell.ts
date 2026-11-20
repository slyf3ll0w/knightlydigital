import { readableAccent } from "@/lib/branding";
import { clientBand } from "@/lib/client-band";
import { FONT_SIZE_ZOOM, GOOGLE_FONT_RE, googleFontHref, sanitizeBookingPage } from "@/lib/booking-page";
import { resolvePublicCompany } from "@/lib/public-company";
import { companyBySlug } from "@/lib/company-slug";
import { prisma } from "@/lib/db";
import type { ResolvedClientTheme } from "@/lib/client-theme-spec";
import { loadClientTheme } from "@/lib/client-theme-load";

/**
 * Appearance for every public booking surface: the company's booking page
 * look (Settings → Booking & forms → Look) decides theme, font, size and
 * accent, so the menu, every item page and every embed read as one family.
 * Query params (embeds) may override per placement.
 */
export type ScheduleAppearance = {
  dark: boolean;
  transparent: boolean;
  accent: string;
  fontName: string | null;
  fontHref: string | null;
  zoom: number;
  /** Menu heading ("" = company name) and the line under it */
  title: string;
  description: string;
  /**
   * The company's published page-designer theme (Pro; lib/client-theme-load.ts),
   * when the page loaded one. Absent / default = today's look.
   */
  theme?: ResolvedClientTheme;
};

export type AppearanceOverrides = { theme?: string; transparent?: string; accent?: string; font?: string };

export function appearanceFor(
  company: { name: string; brandColor: string | null; brandColorSecondary: string | null; documentColor?: string | null; bookingPage: unknown },
  overrides: AppearanceOverrides = {},
  clientTheme?: ResolvedClientTheme
): ScheduleAppearance {
  const look = sanitizeBookingPage(company.bookingPage);
  const theme =
    overrides.transparent === "1"
      ? "transparent"
      : overrides.theme === "dark" || overrides.theme === "light"
        ? overrides.theme
        : look.theme;
  const chosen = /^#?[0-9a-fA-F]{6}$/.test(overrides.accent ?? "")
    ? `#${(overrides.accent as string).replace("#", "")}`
    : // No saved accent: the client pages' button color (lib/client-band.ts), same as the portal
      // A published theme's button color comes first: it is the one way a Pro company styles these pages
      (clientTheme?.colors.accent ?? look.accent ?? clientBand(company).accent);
  const dark = theme === "dark";
  // Black-and-white brands (or any accent near the page ground) would otherwise
  // paint icons, links and selected chips in an invisible color.
  const accent = readableAccent(chosen, [company.brandColorSecondary, company.brandColor], dark);
  const fontName = GOOGLE_FONT_RE.test(overrides.font ?? "") ? (overrides.font as string).trim() : (look.font ?? null);
  return {
    dark,
    transparent: theme === "transparent",
    accent,
    fontName,
    fontHref: googleFontHref(fontName),
    zoom: FONT_SIZE_ZOOM[look.fontSize],
    title: look.title,
    description: look.description,
    ...(clientTheme && !clientTheme.isDefault ? { theme: clientTheme } : {}),
  };
}

/**
 * Company gate + appearance, for pages that have no item of their own
 * (manage, about, legal). `theme` = wear the page-designer theme (about,
 * manage); legal pages leave it off (locked: they stay as they are).
 */
export async function resolveScheduleAppearance(
  companySlug: string,
  overrides: AppearanceOverrides = {},
  opts: { skipGate?: boolean; theme?: boolean } = {}
) {
  const company = opts.skipGate ? await companyBySlug(companySlug) : await resolvePublicCompany(companySlug);
  if (!company) return null;
  const clientTheme = opts.theme ? await loadClientTheme(company.id) : undefined;
  return { company, appearance: appearanceFor(company, overrides, clientTheme) };
}
