/**
 * The company's booking page — one look and one set of words for every
 * public booking surface (/book/[slug], every item page, every embed).
 * Stored as JSON on `Company.bookingPage`. Client-safe.
 *
 * Before v3 the look hung off whichever web form happened to be the default;
 * the migration copied that form's appearance here once.
 */

export type BookingPageTheme = "light" | "dark" | "transparent";
export type BookingPageFontSize = "sm" | "md" | "lg";

export type BookingPageLook = {
  theme: BookingPageTheme;
  /** Google Font family name; undefined = the app default */
  font?: string;
  fontSize: BookingPageFontSize;
  /** Accent hex; undefined = the company's brand color */
  accent?: string;
  /** Menu heading; "" = company name */
  title: string;
  /** Line under the heading; "" = a default */
  description: string;
};

export const DEFAULT_BOOKING_PAGE: BookingPageLook = {
  theme: "light",
  fontSize: "md",
  title: "",
  description: "",
};

/** Page scale per font size — applied as CSS zoom so everything tracks. */
export const FONT_SIZE_ZOOM: Record<BookingPageFontSize, number> = { sm: 0.9, md: 1, lg: 1.15 };

export const GOOGLE_FONT_RE = /^[a-zA-Z0-9 ]{2,40}$/;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

export function sanitizeBookingPage(raw: unknown): BookingPageLook {
  if (!raw || typeof raw !== "object") return DEFAULT_BOOKING_PAGE;
  const r = raw as Record<string, unknown>;
  const font = str(r.font, 40);
  const accent = str(r.accent, 7);
  return {
    theme: r.theme === "dark" || r.theme === "transparent" ? r.theme : "light",
    font: GOOGLE_FONT_RE.test(font) ? font : undefined,
    fontSize: r.fontSize === "sm" || r.fontSize === "lg" ? r.fontSize : "md",
    accent: HEX_RE.test(accent) ? accent : undefined,
    title: str(r.title, 100),
    description: str(r.description, 300),
  };
}

export function googleFontHref(font: string | undefined | null): string | null {
  return font ? `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}:wght@400;500;600;700&display=swap` : null;
}
