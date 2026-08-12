/**
 * Brand CSS variables for the client hub — the same design-system tokens
 * AppShell injects for the operator app, computed the same way (identical
 * luminance guards), but only the LIGHT halves: the hub is pinned light by
 * ForceLightTheme, so the -dark/-d halves never resolve there.
 *
 * With these on the hub root, everything the hub already wears from
 * globals.css — .bg-paper's grid, .card-ledger hairlines and top-light, the
 * green→accent utility bridge, .stamp, .title-rule, the mobile tab inks —
 * picks up the tenant's colors instead of the WorkBench-blue fallbacks.
 */

function luminanceOf(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** Accents on light surfaces: too-light picks flip to console near-black. */
function surfaceAccent(hex: string): string {
  const luminance = luminanceOf(hex);
  return luminance === null || luminance > 200 ? "#0A1428" : hex;
}

/** Mix two hexes — `t` is the weight of `b`. */
function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a);
  const pb = /^#?([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  const r = ch((na >> 16) & 255, (nb >> 16) & 255);
  const g = ch((na >> 8) & 255, (nb >> 8) & 255);
  const bl = ch(na & 255, nb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/** Lighten toward white (hover shift on brand buttons). */
function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

/** Darken toward black (pressed shift). */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

function textOn(hex: string): string {
  const l = luminanceOf(hex);
  return l !== null && l > 160 ? "#111827" : "#ffffff";
}

export type HubBrandColors = {
  brandColor?: string | null;
  brandColorSecondary?: string | null;
};

/**
 * The light-half token set for a hub root `style` prop. Mirrors AppShell's
 * split: SECONDARY drives buttons/accents/ink, PRIMARY drives structure
 * (card hairlines, paper grid temperature, tool outlines) — each falling
 * back to the other, both to the WorkBench defaults when unset.
 */
export function hubBrandVars(company: HubBrandColors): React.CSSProperties {
  const vars: Record<string, string> = {};

  const rawAccent = company.brandColorSecondary || company.brandColor || null;
  if (rawAccent) {
    const accent = surfaceAccent(rawAccent);
    vars["--wb-accent-bright-light"] = tint(accent, 0.14);
    vars["--wb-accent-light"] = accent;
    vars["--wb-accent-strong-light"] = shade(accent, 0.14);
    vars["--wb-on-accent-light"] = textOn(accent);
    vars["--wb-ink-light"] = accent;
    vars["--wb-ink-strong-light"] = shade(accent, 0.14);
    // Mobile chrome (bottom tab bar inks)
    vars["--mobile-accent-light"] = accent;
    vars["--mobile-on-accent-light"] = textOn(accent);
    vars["--mobile-accent-soft-light"] = `${accent}1A`;
  }

  const rawPrimary = company.brandColor || company.brandColorSecondary || null;
  if (rawPrimary) {
    const primary = surfaceAccent(rawPrimary);
    vars["--wb-primary-l"] = primary;
    vars["--tool-line-l"] = mixHex(primary, "#0a1428", 0.25);
    vars["--tool-shadow-l"] = mixHex(primary, "#0a1428", 0.25);
  }

  return vars as React.CSSProperties;
}
