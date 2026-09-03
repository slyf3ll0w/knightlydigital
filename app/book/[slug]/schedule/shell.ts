import { brandAccent } from "@/lib/branding";
import { FONT_SIZE_ZOOM, GOOGLE_FONT_RE, googleFontHref, sanitizeBookingPage } from "@/lib/booking-page";
import { resolvePublicCompany } from "@/lib/public-company";
import { prisma } from "@/lib/db";

/**
 * Appearance for every public booking surface: the company's booking page
 * look (Settings → Online booking → Look) decides theme, font, size and
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
};

export type AppearanceOverrides = { theme?: string; transparent?: string; accent?: string; font?: string };

export function appearanceFor(
  company: { name: string; brandColor: string | null; brandColorSecondary: string | null; bookingPage: unknown },
  overrides: AppearanceOverrides = {}
): ScheduleAppearance {
  const look = sanitizeBookingPage(company.bookingPage);
  const theme =
    overrides.transparent === "1"
      ? "transparent"
      : overrides.theme === "dark" || overrides.theme === "light"
        ? overrides.theme
        : look.theme;
  const accent = /^#?[0-9a-fA-F]{6}$/.test(overrides.accent ?? "")
    ? `#${(overrides.accent as string).replace("#", "")}`
    : (look.accent ?? brandAccent(company));
  const fontName = GOOGLE_FONT_RE.test(overrides.font ?? "") ? (overrides.font as string).trim() : (look.font ?? null);
  return {
    dark: theme === "dark",
    transparent: theme === "transparent",
    accent,
    fontName,
    fontHref: googleFontHref(fontName),
    zoom: FONT_SIZE_ZOOM[look.fontSize],
    title: look.title,
    description: look.description,
  };
}

/** Company gate + appearance, for pages that have no item of their own (manage). */
export async function resolveScheduleAppearance(
  companySlug: string,
  overrides: AppearanceOverrides = {},
  opts: { skipGate?: boolean } = {}
) {
  const company = opts.skipGate ? await prisma.company.findUnique({ where: { slug: companySlug } }) : await resolvePublicCompany(companySlug);
  if (!company) return null;
  return { company, appearance: appearanceFor(company, overrides) };
}
