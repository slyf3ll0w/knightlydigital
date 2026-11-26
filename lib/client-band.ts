import { contrastRatio, shade } from "@/lib/branding";
import { clientAccent, CLIENT_DEFAULT_ACCENT, type ClientBrand } from "@/lib/client-theme";

/**
 * The "heavy" look's one strong band on client surfaces (docs/site-design.md
 * → "Carrying it into the client-facing pieces"): the client portal header
 * and the client emails wear the COMPANY's color as a solid band, with white
 * cards on a neutral tinted ground below it. Pure — used by server
 * components and by lib/email.ts (inline hex, no CSS variables).
 *
 * Band color: the company's client-document color, then primary, then
 * secondary — the same order the portal header has always used
 * (brandHeader) — skipping white / near-white picks (a white band on a pale
 * ground vanishes), then WorkBench blue.
 *
 * Band ink: white when it clears 3:1 on the band (large, bold text), else
 * near-black — so a navy band reads white, a pale yellow band reads dark.
 */

const HEX = /^#?([0-9a-f]{6})$/i;
const WHITE = "#FFFFFF";
const INK = "#0A1428";

/** The page ground under the white cards (neutral, so any brand sits on it). */
export const CLIENT_GROUND = "#F3F5F8";
/** Ring + deep soft shadow — the site's solid-card recipe. */
export const CLIENT_CARD_SHADOW =
  "0 0 0 1px rgba(10,20,40,0.08), 0 2px 0 rgba(10,20,40,0.05), 0 18px 34px -22px rgba(10,20,40,0.35)";

function normalize(hex: string | null | undefined): string | null {
  const m = hex ? HEX.exec(hex.trim()) : null;
  return m ? `#${m[1].toUpperCase()}` : null;
}

/** Drop white / near-white picks: they make no band at all. */
function bandable(hex: string | null): string | null {
  if (!hex) return null;
  const r = contrastRatio(hex, WHITE);
  return r !== null && r >= 1.25 ? hex : null;
}

export type ClientBand = {
  /** Solid band background. */
  band: string;
  /** Text on the band. */
  onBand: string;
  /** Quieter text on the band (company name over the greeting). */
  onBandQuiet: string;
  /** A hairline / badge ground on the band. */
  bandEdge: string;
  /** The primary button on a white card (readable on white, 3:1). */
  accent: string;
  /** Text on the primary button. */
  onAccent: string;
  /** Pressed / hover shade of the button. */
  accentStrong: string;
};

/** Text that reads on `bg`: white if it clears `min`, else near-black. */
function inkOn(bg: string, min = 3): string {
  const w = contrastRatio(WHITE, bg) ?? 21;
  return w >= min ? WHITE : INK;
}

export function clientBand(brand: Omit<ClientBrand, "name"> & { name?: string }): ClientBand {
  const band =
    bandable(normalize(brand.documentColor)) ??
    bandable(normalize(brand.brandColor)) ??
    bandable(normalize(brand.brandColorSecondary)) ??
    CLIENT_DEFAULT_ACCENT;
  const onBand = inkOn(band);
  const accent = clientAccent({ name: brand.name ?? "", ...brand });
  return {
    band,
    onBand,
    onBandQuiet: onBand === WHITE ? "rgba(255,255,255,0.78)" : "rgba(10,20,40,0.68)",
    bandEdge: onBand === WHITE ? "rgba(255,255,255,0.16)" : "rgba(10,20,40,0.10)",
    accent,
    onAccent: inkOn(accent, 3),
    accentStrong: shade(accent, 0.14).toUpperCase(),
  };
}

/**
 * The band as CSS custom properties for a `.ch-page` root
 * (app/client-heavy.css): booking page, its forms and the portal login read
 * them, so every client page brands the same way as the portal home.
 */
export function clientBandVars(b: ClientBand): Record<`--ch-${string}`, string> {
  return {
    "--ch-band": b.band,
    "--ch-on-band": b.onBand,
    "--ch-on-band-quiet": b.onBandQuiet,
    "--ch-band-edge": b.bandEdge,
    "--ch-accent": b.accent,
    "--ch-on-accent": b.onAccent,
    "--ch-accent-strong": b.accentStrong,
  };
}

/** `a` mixed into `b` by `t` (0..1 of a), like CSS color-mix in srgb. */
function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((x >> sh) & 255) * t + ((y >> sh) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0").toUpperCase()}`;
}
function lighten(hex: string, t: number): string {
  return mix("#FFFFFF", hex, t);
}

export type PortalBand = {
  /** The band's top (company color deepened, like the app's Home band). */
  deep: string;
  /** The band's middle. */
  mid: string;
  /** The gradient itself, deep → mid → the company color at the foot. */
  fill: string;
  /** The accent as it reads ON the band (accent word, main button, 4px stripe). */
  accent: string;
  /** Text on that accent. */
  onAccent: string;
  /** The company color as it reads on white (tab bar, links): darkened until 3:1. */
  tint: string;
};

/**
 * The portal's band in the app's new look (2026-11-25): the same gradient as
 * the app's Home band, made from the company's color, and the accent checked
 * against the band's own shades — a secondary close to the band color (navy
 * on navy) is lightened until it clears 3:1 on the deep and middle shades,
 * where the greeting and buttons sit (the app does the same in
 * lib/ds-theme.ts bandSecondary). White ink always reads on deep and mid.
 */
export function portalBand(b: Pick<ClientBand, "band" | "accent">): PortalBand {
  const band = normalize(b.band) ?? CLIENT_DEFAULT_ACCENT;
  const deep = mix(band, "#050A18", 0.34);
  const mid = mix(band, "#050A18", 0.64);
  let accent = normalize(b.accent) ?? band;
  for (let i = 0; i < 14; i++) {
    if ([deep, mid].every((g) => (contrastRatio(accent, g) ?? 0) >= 3)) break;
    accent = lighten(accent, 0.14);
  }
  if (![deep, mid].every((g) => (contrastRatio(accent, g) ?? 0) >= 3)) accent = WHITE;
  let tint = band;
  for (let i = 0; i < 10 && (contrastRatio(tint, WHITE) ?? 0) < 3; i++) tint = mix(tint, "#050A18", 0.86);
  return {
    deep,
    mid,
    fill: `linear-gradient(180deg, ${deep} 0%, ${mid} 62%, ${band} 100%)`,
    accent,
    onAccent: (contrastRatio(WHITE, accent) ?? 0) >= 4.5 ? WHITE : INK,
    tint,
  };
}
