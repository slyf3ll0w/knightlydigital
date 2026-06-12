/**
 * Company branding for client-facing pages (quotes, invoices, hub, booking).
 * Companies set logoUrl + brandColor in Settings; everything falls back to
 * Streamflaire Hub defaults when unset.
 */

export type CompanyBrand = {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
};

const DEFAULT_HEADER = "#0C0F0C";
const DEFAULT_ACCENT = "#16A34A"; // green-600

/** Header background for branded page tops. */
export function brandHeader(company: CompanyBrand): string {
  return company.brandColor || DEFAULT_HEADER;
}

/** Accent for primary buttons / highlights. */
export function brandAccent(company: CompanyBrand): string {
  return company.brandColor || DEFAULT_ACCENT;
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
