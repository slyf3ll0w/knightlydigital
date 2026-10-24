import { textOn } from "@/lib/branding";

/**
 * Website style matching for embedded forms (public/embed.js → /embed/*).
 *
 * The forms paint their accent through these CSS custom properties with the
 * saved accent as the fallback, so hosted pages (where nothing sets the vars)
 * look exactly as before, and an embed can be restyled live once the host
 * page's look arrives (app/embed/[slug]/EmbedStyleMatch.tsx) without
 * re-rendering server data. `--wb-accent` is taken by the app chrome, hence
 * the `--embed-` prefix.
 */
export const embedAccent = (saved: string) => `var(--embed-accent, ${saved})`;
export const embedOnAccent = (saved: string) => `var(--embed-on-accent, ${textOn(saved)})`;
/** A translucent wash of the (possibly matched) accent; pct 13 ≈ the old `${hex}22`. */
export const embedWash = (saved: string, pct: number) => `color-mix(in srgb, ${embedAccent(saved)} ${pct}%, transparent)`;

/** What public/embed.js sends (raw computed values from the host page). */
export type HostStyleMessage = {
  type: "workbench:style";
  font?: unknown;
  headingFont?: unknown;
  fontSize?: unknown;
  color?: unknown;
  background?: unknown;
  accent?: unknown;
  accentText?: unknown;
  radius?: unknown;
};

export type Rgb = [number, number, number];

/** Parses a computed CSS color (rgb()/rgba()/#hex). Mostly-transparent colors count as none. */
export function parseCssColor(v: unknown): Rgb | null {
  if (typeof v !== "string" || v.length > 64) return null;
  const s = v.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 128) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
  if (!fn) return null;
  if (fn[4] !== undefined) {
    const a = parseFloat(fn[4]) / (fn[5] ? 100 : 1);
    if (!(a >= 0.5)) return null;
  }
  const ch = [fn[1], fn[2], fn[3]].map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))));
  if (ch.some((n) => !Number.isFinite(n))) return null;
  return ch as Rgb;
}

export const rgbToHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

export function luminance([r, g, b]: Rgb): number {
  const ch = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Same threshold public/embed.js uses to ask for ?theme=dark. */
export const isDarkGround = (c: Rgb) => luminance(c) < 0.179;

const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"]);
/** Installed everywhere — never fetched from Google Fonts. */
const SYSTEM = new Set([
  "arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman", "verdana", "tahoma", "trebuchet ms", "courier", "courier new",
  "segoe ui", "roboto flex", "-apple-system", "blinkmacsystemfont", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji",
  "garamond", "palatino", "palatino linotype", "book antiqua", "baskerville", "gill sans", "optima", "futura", "avenir", "avenir next", "menlo", "monaco", "consolas",
]);

/**
 * A computed font-family list cut to safe characters: at most four families,
 * quoted names, generic keywords bare, always ending in a generic so a font
 * the host loads with its own @font-face (unreachable from the iframe) still
 * lands on the right kind of face.
 */
export function sanitizeFontStack(v: unknown): { stack: string; first: string } | null {
  if (typeof v !== "string" || !v.trim() || v.length > 400) return null;
  const names = v
    .split(",")
    .map((n) => n.replace(/["']/g, "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 4);
  if (names.length === 0) return null;
  const parts = names.map((n) => (GENERIC.has(n.toLowerCase()) ? n.toLowerCase() : `"${n}"`));
  if (!names.some((n) => GENERIC.has(n.toLowerCase()))) {
    parts.push(/serif|georgia|times|garamond|baskerville|playfair|merriweather|lora|slab/i.test(names[0]) && !/sans/i.test(names[0]) ? "serif" : "sans-serif");
  }
  return { stack: parts.join(", "), first: names[0] };
}

/** Google Fonts stylesheet for a family name, or null for generics / system faces. */
export function googleFontFor(name: string): string | null {
  const n = name.trim();
  if (!/^[a-zA-Z0-9 ]{2,40}$/.test(n)) return null;
  const k = n.toLowerCase();
  if (GENERIC.has(k) || SYSTEM.has(k)) return null;
  return `https://fonts.googleapis.com/css2?family=${n.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;
}

export function clampRadius(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(24, Math.round(n)));
}

export function clampFontSize(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(14, Math.min(18, Math.round(n)));
}

/** Black or white text on a solid accent, unless the host's own button text reads clearly. */
export function onAccentFor(accent: Rgb, hostText: Rgb | null): string {
  if (hostText && contrast(accent, hostText) >= 4.5) return rgbToHex(hostText);
  return contrast(accent, [255, 255, 255]) >= contrast(accent, [17, 24, 39]) ? "#ffffff" : "#111827";
}

/**
 * The copy-paste snippet for a website form: a placeholder + public/embed.js,
 * which builds the iframe, sizes it, and matches the site's look. Old
 * `<iframe data-jobflow>` snippets on customer sites keep working untouched.
 */
export function embedCode(baseUrl: string, slug: string, path = "", title = ""): string {
  const origin = baseUrl ? new URL(baseUrl).origin : "";
  const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<div data-workbench-form="${attr(slug)}"${path ? ` data-path="${attr(path)}"` : ""}${title ? ` data-title="${attr(title)}"` : ""}></div><script src="${origin}/embed.js" async></script>`;
}
