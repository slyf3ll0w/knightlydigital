import { contrastRatio, shade, textOn } from "@/lib/branding";
import { readableOn } from "@/lib/ds-theme";

/**
 * The Client Kit's brand resolver — ONE answer to "what color is this
 * business on the paper a client sees" (quote, invoice, receipt, and from
 * phase 2 on, emails, booking, the hub). It replaces the three helpers that
 * used to disagree (lib/branding.ts brandAccent/brandHeader, lib/hub-brand.ts
 * hubBrandVars, lib/ds-theme.ts dsBrandVars) for client surfaces.
 *
 * The business is the brand, WorkBench is the paper: the accent appears on
 * the letterhead rule, the total's rule, the primary button and the stamp —
 * and nowhere else. Everything else is ink on white.
 *
 * Accent order: the company's document color, then secondary, then primary,
 * then WorkBench's default — each nudged darker only as far as it takes to
 * read on white (3:1), so a yellow brand stays yellow-ish and a white
 * brand becomes ink instead of vanishing.
 */

export type ClientBrand = {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  documentColor?: string | null;
  /** Optional Google Font family the company chose (Settings → Branding). */
  brandFont?: string | null;
};

export const CLIENT_DEFAULT_ACCENT = "#0B57D8";
const WHITE = "#FFFFFF";
const INK = "#111827";
const HEX = /^#?([0-9a-f]{6})$/i;

function normalize(hex: string | null | undefined): string | null {
  const m = hex ? HEX.exec(hex.trim()) : null;
  return m ? `#${m[1].toUpperCase()}` : null;
}

/** A white or near-white "document color" means "no color" — the paper is already white. */
function meaningful(hex: string | null): string | null {
  if (!hex) return null;
  const ratio = contrastRatio(hex, WHITE);
  return ratio !== null && ratio >= 1.25 ? hex : null;
}

/** The one accent a client surface wears, guaranteed readable on white. */
export function clientAccent(brand: ClientBrand): string {
  const pick =
    meaningful(normalize(brand.documentColor)) ??
    meaningful(normalize(brand.brandColorSecondary)) ??
    meaningful(normalize(brand.brandColor)) ??
    CLIENT_DEFAULT_ACCENT;
  return readableOn(pick, "light");
}

export type ClientVars = Record<`--c-${string}`, string>;

/**
 * CSS custom properties for a `.client` root (app/client.css reads them).
 * Pure: safe in server components, emails (as hex via clientPalette) and tests.
 */
export function clientBrandVars(brand: ClientBrand): ClientVars {
  const accent = clientAccent(brand);
  const vars: ClientVars = {
    "--c-accent": accent,
    "--c-accent-strong": shade(accent, 0.14).toUpperCase(),
    "--c-accent-soft": `${accent}14`,
    "--c-on-accent": textOn(accent),
    "--c-ink": INK,
  };
  const font = brand.brandFont?.trim();
  if (font && /^[A-Za-z0-9 ]{2,40}$/.test(font)) {
    vars["--c-font-display"] = `"${font}", "Lexend", system-ui, sans-serif`;
  }
  return vars;
}

/** Flat hex palette for surfaces that can't read CSS variables (email, PDF). */
export function clientPalette(brand: ClientBrand): { accent: string; accentStrong: string; onAccent: string; ink: string; muted: string; rule: string } {
  const accent = clientAccent(brand);
  return {
    accent,
    accentStrong: shade(accent, 0.14).toUpperCase(),
    onAccent: textOn(accent),
    ink: INK,
    muted: "#6B7280",
    rule: "#E5E7EB",
  };
}
