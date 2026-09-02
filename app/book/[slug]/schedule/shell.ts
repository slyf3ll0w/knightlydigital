import { resolveWebForm } from "@/lib/web-forms";
import { brandAccent } from "@/lib/branding";
import { bookingAccent, FONT_SIZE_ZOOM, GOOGLE_FONT_RE } from "@/lib/booking-form";

/**
 * Appearance for the public scheduling pages: the company's default form
 * decides theme, font, size and accent, so /book/[slug]/schedule and the
 * company's forms read as one family. Query params (embeds) may override.
 */
export type ScheduleAppearance = {
  dark: boolean;
  transparent: boolean;
  accent: string;
  fontName: string | null;
  fontHref: string | null;
  zoom: number;
};

export async function resolveScheduleAppearance(
  companySlug: string,
  overrides: { theme?: string; transparent?: string; accent?: string; font?: string } = {}
): Promise<{ company: NonNullable<Awaited<ReturnType<typeof resolveWebForm>>>["company"]; appearance: ScheduleAppearance } | null> {
  const resolved = await resolveWebForm(companySlug);
  if (!resolved) return null;
  const { company, form } = resolved;
  const config = form.config;
  const theme =
    overrides.transparent === "1"
      ? "transparent"
      : overrides.theme === "dark" || overrides.theme === "light"
        ? overrides.theme
        : config.appearance.theme;
  const accent = /^#?[0-9a-fA-F]{6}$/.test(overrides.accent ?? "")
    ? `#${(overrides.accent as string).replace("#", "")}`
    : bookingAccent(config, brandAccent(company));
  const fontName = GOOGLE_FONT_RE.test(overrides.font ?? "") ? (overrides.font as string).trim() : (config.appearance.font ?? null);
  return {
    company,
    appearance: {
      dark: theme === "dark",
      transparent: theme === "transparent",
      accent,
      fontName,
      fontHref: fontName ? `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}:wght@400;500;600;700&display=swap` : null,
      zoom: FONT_SIZE_ZOOM[config.appearance.fontSize],
    },
  };
}
