import type { CSSProperties } from "react";
import { shade } from "@/lib/branding";
import { readableOn } from "@/lib/ds-theme";
import type { ClientBand } from "@/lib/client-band";
import { bandInk, buttonInk, type ResolvedClientTheme } from "@/lib/client-theme-spec";

/**
 * A resolved theme (lib/client-theme-spec.ts) as what the client pages put
 * on their root: data attributes that switch the shapes in
 * app/client-theme.css, CSS custom properties, the display font's link.
 * Pure and client-safe. The default theme returns NOTHING (no attributes,
 * no variables, no font), so a page without a theme renders exactly as it
 * did before the designer existed.
 */

const WHITE = "#FFFFFF";

/** The band + accent colors with the theme's picks laid over the company's. */
export function themedBand(b: ClientBand, theme: ResolvedClientTheme | null | undefined): ClientBand {
  if (!theme || theme.isDefault) return b;
  let out = b;
  const band = theme.colors.band;
  if (band) {
    const onBand = bandInk(band);
    out = {
      ...out,
      band,
      onBand,
      onBandQuiet: onBand === WHITE ? "rgba(255,255,255,0.78)" : "rgba(10,20,40,0.68)",
      bandEdge: onBand === WHITE ? "rgba(255,255,255,0.16)" : "rgba(10,20,40,0.10)",
    };
  }
  const accent = theme.colors.accent;
  if (accent) out = { ...out, accent, onAccent: buttonInk(accent), accentStrong: shade(accent, 0.14).toUpperCase() };
  return out;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mixWhite(hex: string, t: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0").toUpperCase()}`;
}

/** A URL safe to drop into CSS url("…"): our own paths or data: images only. */
export function cssUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^(\/[^\s"'\\()]*|data:image\/[a-z+]+[;,][^\s"'\\]*)$/i.test(url)) return null;
  return `url("${url}")`;
}

const LOGO_H: Record<ResolvedClientTheme["logo"]["size"], { h: number; w: number }> = {
  sm: { h: 32, w: 120 },
  md: { h: 44, w: 160 },
  lg: { h: 64, w: 220 },
};

export type ThemeRoot = {
  /** data-ch-* attributes for the root element. */
  attrs: Record<string, string>;
  /** CSS custom properties for the root's style. */
  vars: Record<string, string>;
  /** Google Fonts stylesheet for the display font, or null. */
  fontHref: string | null;
};

/**
 * Root attributes + variables for a themed client page.
 *   surface "page"  = a page with a band (booking, login, portal)
 *   surface "embed" = an embedded form (no band, no ground: the host site's)
 * `band` = the themed band (themedBand). `bandStyle` overrides the theme's
 * band style for this page (the booking hero's photo-behind).
 */
export function themeRoot(
  theme: ResolvedClientTheme | null | undefined,
  band: Pick<ClientBand, "band" | "onBand" | "accent">,
  opts: { surface?: "page" | "embed"; dark?: boolean; bandStyle?: ResolvedClientTheme["band"]["style"] } = {}
): ThemeRoot {
  const attrs: Record<string, string> = {};
  const vars: Record<string, string> = {};
  if (!theme || theme.isDefault) return { attrs, vars, fontHref: null };
  const surface = opts.surface ?? "page";

  if (theme.corners !== "round") attrs["data-ch-corners"] = theme.corners;
  if (theme.buttons !== "solid") {
    attrs["data-ch-buttons"] = theme.buttons;
    // Outline buttons put the accent on white as TEXT, which needs 4.5:1
    if (theme.buttons === "outline") vars["--ch-accent-text"] = readableOn(band.accent, "light", 4.5);
  }
  if (theme.font && theme.font !== "Lexend") {
    attrs["data-ch-display"] = "";
    vars["--ch-display"] = `"${theme.font}", var(--font-lexend), "Lexend", system-ui, sans-serif`;
  }

  if (surface === "page") {
    if (theme.logo.size !== "md") {
      attrs["data-ch-logo"] = theme.logo.size;
      vars["--ch-logo-h"] = `${LOGO_H[theme.logo.size].h}px`;
      vars["--ch-logo-w"] = `${LOGO_H[theme.logo.size].w}px`;
    }
    if (theme.colors.ground && !opts.dark) {
      vars["--ch-ground"] = theme.colors.ground;
      vars["--hh-ground"] = theme.colors.ground;
    }
    const style = opts.bandStyle ?? theme.band.style;
    if (style === "gradient") {
      const end = band.onBand === WHITE ? shade(band.band, 0.3).toUpperCase() : mixWhite(band.band, 0.3);
      attrs["data-ch-band"] = "gradient";
      vars["--ch-band-fill"] = `linear-gradient(135deg, ${band.band} 0%, ${end} 100%)`;
    } else if (style === "photo") {
      const img = cssUrl(theme.band.imageUrl);
      if (img) {
        const scrim = rgba(band.band, theme.band.overlay);
        attrs["data-ch-band"] = "photo";
        vars["--ch-band-fill"] = `linear-gradient(${scrim}, ${scrim}), ${img} center / cover no-repeat, ${band.band}`;
        vars["--ch-band-shadow"] = band.onBand === WHITE ? "0 1px 3px rgba(0,0,0,0.45)" : "0 1px 2px rgba(255,255,255,0.5)";
      }
    }
  }

  const fontHref =
    theme.font && theme.font !== "Lexend" ? `https://fonts.googleapis.com/css2?family=${theme.font.replace(/ /g, "+")}:wght@400;600;700&display=swap` : null;
  return { attrs, vars, fontHref };
}

/** A CSS background for a theme photo (login split / photo-full, booking hero), or null. */
export function photoBackground(url: string | null | undefined): CSSProperties | null {
  const img = cssUrl(url);
  return img ? { backgroundImage: img, backgroundSize: "cover", backgroundPosition: "center" } : null;
}
