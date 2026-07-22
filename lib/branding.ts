/**
 * Company branding for client-facing pages (quotes, invoices, hub, booking).
 * Companies set logoUrl + two brand colors in Settings: primary (brandColor)
 * drives headers/surfaces, secondary (brandColorSecondary) drives buttons and
 * accents. Secondary falls back to primary; everything falls back to
 * WorkBench defaults when unset.
 */

export type CompanyBrand = {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  /** Client-document override — quotes/invoices/emails keep their own color
   *  so the in-app primary can change freely. Falls back to brandColor. */
  documentColor?: string | null;
};

const DEFAULT_HEADER = "#0A1428";
const DEFAULT_ACCENT = "#0B57D8"; // WorkBench blue

/** Header background for branded client-page tops — the document color,
 *  falling back to the primary. */
export function brandHeader(company: CompanyBrand): string {
  return company.documentColor || company.brandColor || DEFAULT_HEADER;
}

/** Accent for primary buttons / highlights (secondary color, falls back to primary). */
export function brandAccent(company: CompanyBrand): string {
  return company.brandColorSecondary || company.brandColor || DEFAULT_ACCENT;
}

/**
 * Dark brand surface for in-app hero panels (e.g. the Payments balance card):
 * the company's primary color when it's dark enough to carry white text,
 * otherwise the WorkBench console navy. Mirrors brandHeader() on the client-
 * facing pages so "primary = surfaces" holds inside the app too.
 */
export function brandSurface(company: Pick<CompanyBrand, "brandColor">): string {
  const hex = company.brandColor;
  const m = hex ? /^#?([0-9a-f]{6})$/i.exec(hex) : null;
  if (!m) return DEFAULT_HEADER;
  const n = parseInt(m[1], 16);
  const luminance = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luminance > 160 ? DEFAULT_HEADER : `#${m[1]}`;
}

/** Darken a hex color by 0–1 (gradient depth on branded portal headers). */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Black or white text, whichever is readable on the given hex background. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Perceived luminance (ITU-R BT.709)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 160 ? "#111827" : "#ffffff";
}
