import type { CSSProperties } from "react";
import { textOn } from "@/lib/branding";

/**
 * Entity hues — the app's standardized color language. One hue per section,
 * used everywhere that section shows its face: nav icon tiles (AppShell),
 * the More/Create sheets, page-title tiles, active filter pills, KPI rules,
 * and empty-state art. Brand colors (Company.brandColor/Secondary) stay the
 * voice of buttons, links, and hero surfaces; these hues are the wayfinding.
 *
 * Every render site references the hue through a CSS custom property
 * (`var(--sh-<key>)`) rather than the raw hex: globals.css holds the
 * defaults below per theme, and AppShell overrides the vars for companies
 * that customized their section colors (Company.sectionColors) — with each
 * half luminance-guarded so a near-white pick stays visible on the light
 * theme and a near-black pick stays visible on the dark one.
 */
export const SECTION_HUE_DEFAULTS = {
  schedule: "#8B5CF6", // violet — appointments live here
  clients: "#3B82F6", // blue
  requests: "#F59E0B", // amber
  leads: "#84CC16", // lime — between request amber and quote green
  quotes: "#22C55E", // green
  jobs: "#F97316", // orange
  invoices: "#0EA5E9", // sky
  payments: "#14B8A6", // teal
  subscriptions: "#14B8A6", // teal, money family
  business: "#6366F1", // indigo
  services: "#EC4899", // pink
  contracts: "#A855F7", // purple
  chat: "#F43F5E", // rose
  forms: "#06B6D4", // cyan
  team: "#10B981", // emerald
} as const;

export type SectionKey = keyof typeof SECTION_HUE_DEFAULTS;

export const SECTION_KEYS = Object.keys(SECTION_HUE_DEFAULTS) as SectionKey[];

/** Section labels for the Settings customization UI. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  schedule: "Schedule",
  clients: "Clients",
  requests: "Requests",
  leads: "Leads",
  quotes: "Quotes",
  jobs: "Jobs",
  invoices: "Invoices",
  payments: "Payments",
  subscriptions: "Subscriptions",
  business: "Business",
  services: "Products & Services",
  contracts: "Contracts",
  chat: "Team Chat",
  forms: "Booking Forms",
  team: "Team",
};

/** What render sites consume: `var(--sh-<key>)` per section. */
export const SECTION_HUES = Object.fromEntries(
  SECTION_KEYS.map((k) => [k, `var(--sh-${k})`])
) as Record<SectionKey, string>;

/**
 * Ink that reads on a section-hue tile. Section vars resolve to their
 * paired `--sh-<key>-on` custom property (kept in sync per theme by
 * globals.css / AppShell); raw hexes fall back to plain black-or-white.
 */
export function hueInk(hue: string): string {
  const m = /^var\(--sh-([a-z]+)\)$/.exec(hue);
  return m ? `var(--sh-${m[1]}-on)` : textOn(hue);
}

/** The hue at low alpha (icon-tile backgrounds) — hex or var() input. */
export function hueTint(hue: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hue);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return `color-mix(in srgb, ${hue} ${Math.round(alpha * 100)}%, transparent)`;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function luminanceOf(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** Light surfaces: a near-white pick disappears — flip to console navy. */
export function guardHueLight(hex: string): string {
  const lum = luminanceOf(hex);
  return lum === null || lum > 200 ? "#0A1428" : hex;
}

/** Dark surfaces: a near-black pick disappears — flip to paper gray. */
export function guardHueDark(hex: string): string {
  const lum = luminanceOf(hex);
  return lum === null || lum < 60 ? "#E5E7EB" : hex;
}

/**
 * Company.sectionColors sanitizer (API write path): keeps only known
 * section keys with 6-digit hex values. Always an object — {} = defaults.
 */
export function sanitizeSectionColors(raw: unknown): Partial<Record<SectionKey, string>> {
  const out: Partial<Record<SectionKey, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of SECTION_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && HEX_RE.test(v)) out[k] = v.toUpperCase();
  }
  return out;
}

/**
 * CSS custom properties AppShell injects for a company's overrides — four
 * vars per overridden section (light/dark halves + their on-colors), each
 * theme-guarded. Untouched sections keep the globals.css defaults.
 */
export function sectionColorVars(
  overrides: Partial<Record<SectionKey, string>> | null | undefined
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!overrides) return vars;
  for (const k of SECTION_KEYS) {
    const hex = overrides[k];
    if (!hex || !HEX_RE.test(hex)) continue;
    const light = guardHueLight(hex);
    const dark = guardHueDark(hex);
    vars[`--sh-${k}-l`] = light;
    vars[`--sh-${k}-on-l`] = textOn(light);
    vars[`--sh-${k}-d`] = dark;
    vars[`--sh-${k}-on-d`] = textOn(dark);
  }
  return vars;
}

/**
 * Theme-guarded ink/background for ARBITRARY user-picked colors (pipeline
 * stage colors and future custom palettes). Pair with the app-wide
 * `.ink-themed` / `.bg-themed` classes in globals.css: light mode renders
 * the -l var, dark mode the -d var, so a black pick never vanishes on the
 * dark theme (or a white one on light). This is the one sanctioned way to
 * put a stored color into an inline style.
 */
export function themedInkVars(hex: string | null | undefined): CSSProperties {
  const safe = hex && HEX_RE.test(hex) ? hex : "#0C0F0C";
  return {
    "--ink-l": guardHueLight(safe),
    "--ink-d": guardHueDark(safe),
  } as CSSProperties;
}

export function themedBgVars(hex: string | null | undefined): CSSProperties {
  const safe = hex && HEX_RE.test(hex) ? hex : "#0C0F0C";
  return {
    "--bg-l": guardHueLight(safe),
    "--bg-d": guardHueDark(safe),
  } as CSSProperties;
}
