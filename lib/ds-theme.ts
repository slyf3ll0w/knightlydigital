/**
 * WorkBench design system ("ds") — brand tokens.
 *
 * Every company picks two colors (Settings → Brand & client pages): PRIMARY drives the
 * app (buttons, active states, links, the Up-next hero, charts) and
 * SECONDARY is the occasional highlight (appointment markers, the hero's
 * status pill, today's bar in a chart, the orange sparks on hand-drawn
 * arrows). Unset = WorkBench blue + orange. Status colors (good / warn /
 * bad) are fixed and never come from the brand.
 *
 * A brand color is only moved when it can't be read: on light surfaces it is
 * darkened, on dark surfaces lightened, step by step, until it clears 3:1
 * contrast (the WCAG bar for UI) — so a yellow brand stays yellow-ish
 * instead of flipping to some unrelated fallback.
 *
 * The CSS that reads these lives in app/ds.css (scoped to `.ds`).
 */
import { contrastRatio, shade, textOn } from "@/lib/branding";

export const DS_DEFAULT_PRIMARY = "#0B57D8";
export const DS_DEFAULT_SECONDARY = "#F86A0A";

/** Surfaces the tokens are guarded against (match app/ds.css). */
const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#161D2B";

const HEX = /^#?([0-9a-f]{6})$/i;

function normalize(hex: string | null | undefined): string | null {
  const m = hex ? HEX.exec(hex.trim()) : null;
  return m ? `#${m[1].toUpperCase()}` : null;
}

function tint(hex: string, amount: number): string {
  const m = HEX.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`;
}

/** Nudge `hex` darker (light surface) or lighter (dark surface) until it reads. */
export function readableOn(hex: string, surface: "light" | "dark", min = 3): string {
  const ground = surface === "light" ? LIGHT_SURFACE : DARK_SURFACE;
  let c = hex;
  for (let i = 0; i < 14; i++) {
    const ratio = contrastRatio(c, ground);
    if (ratio !== null && ratio >= min) return c.toUpperCase();
    c = surface === "light" ? shade(c, 0.12) : tint(c, 0.14);
  }
  return surface === "light" ? "#0A1328" : "#FFFFFF";
}

/** `a` mixed into `b` by `t` (0..1 of a), like CSS color-mix in srgb. */
function mix(a: string, b: string, t: number): string {
  const ma = HEX.exec(a), mb = HEX.exec(b);
  if (!ma || !mb) return a;
  const x = parseInt(ma[1], 16), y = parseInt(mb[1], 16);
  const ch = (sh: number) => Math.round(((x >> sh) & 255) * t + ((y >> sh) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0").toUpperCase()}`;
}

/**
 * Home's band is a deep gradient made from the PRIMARY, so the secondary on
 * it (accent word, main button, 4px stripe) is checked against the band's
 * own colors, not the page: a secondary close to the primary (navy on navy)
 * is lightened until it clears 3:1 against every band shade (light, Dusk
 * and each time of day). These mixes match app/ds-brand.css.
 */
function bandSecondary(primary: string, secondary: string): string {
  const bp = readableOn(primary, "light"); // the band is built from --bb-p, the light-theme primary
  const grounds = (
    [[0.34, "#050A18"], [0.64, "#050A18"], [0.24, "#03060E"], [0.5, "#03060E"], [0.52, "#0B1430"],
      [0.8, "#0B1430"], [0.24, "#04070F"], [0.5, "#04070F"], [0.16, "#02040A"], [0.36, "#02040A"]] as const
  ).map(([t, g]) => mix(bp, g, t));
  let c = readableOn(secondary, "dark");
  for (let i = 0; i < 14; i++) {
    if (grounds.every((g) => (contrastRatio(c, g) ?? 0) >= 3)) return c.toUpperCase();
    c = tint(c, 0.14);
  }
  return "#FFFFFF";
}

function alpha(hex: string, a: number): string {
  return `${hex}${Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}

function role(name: "primary" | "secondary", raw: string): Record<string, string> {
  const l = readableOn(raw, "light");
  const d = readableOn(raw, "dark");
  return {
    [`--ds-${name}-l`]: l,
    [`--ds-${name}-strong-l`]: shade(l, 0.14).toUpperCase(),
    [`--ds-${name}-soft-l`]: alpha(l, 0.1),
    [`--ds-on-${name}-l`]: textOn(l),
    [`--ds-${name}-d`]: d,
    [`--ds-${name}-strong-d`]: tint(d, 0.16),
    [`--ds-${name}-soft-d`]: alpha(d, 0.18),
    [`--ds-on-${name}-d`]: textOn(d),
  };
}

/**
 * The CSS custom properties for a company's two brand colors (and optional
 * brand font), to spread onto the app shell's root `style`. Defaults are
 * WorkBench's own colors, so an unbranded company gets the same tokens.
 */
export function dsBrandVars(
  primary?: string | null,
  secondary?: string | null,
  font?: string | null
): Record<string, string> {
  const p = normalize(primary) ?? DS_DEFAULT_PRIMARY;
  const s = normalize(secondary) ?? DS_DEFAULT_SECONDARY;
  const band = bandSecondary(p, s);
  return {
    ...role("primary", p),
    ...role("secondary", s),
    "--ds-secondary-band": band,
    "--ds-on-secondary-band": textOn(band),
    ...(font ? { "--ds-font": `"${font}", "Lexend", system-ui, sans-serif` } : {}),
  };
}
