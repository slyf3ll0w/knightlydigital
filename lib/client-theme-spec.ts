import { contrastRatio, shade } from "@/lib/branding";

/**
 * The AI page designer's theme spec, version 1
 * (docs/plans/ai-portal-designer-2026-11-20.md → "The theme spec").
 *
 * A company on Pro can restyle its four client pages (portal login, client
 * portal, booking page, the booking forms) through a structured spec that
 * Atlas, an outside AI or the Settings page edits — never HTML, CSS or code.
 * Everything here is pure (no Prisma, no React), so the routes, the Atlas
 * tools, the settings page and the renderers all run the same rules:
 *
 *   parseClientTheme(raw, ctx) → { theme, problems, ignored }   (validate + clean)
 *   mergeThemePatch(draft, patch)                               (an AI's partial edit)
 *   resolveTheme(spec | null)                                   (fully defaulted, for rendering)
 *
 * resolveTheme(null) is today's look exactly: every renderer treats the
 * defaults as "do what you did before", so a company without a published
 * theme (or off Pro) sees no change at all.
 *
 * Locked, never in the spec: SMS consent wording, required fields and the
 * address step, captcha + honeypot, legal pages, the "Built with WorkBench"
 * note under embedded forms, sign-in wording, pay and sign steps, status
 * colors, form questions (BookingType.intake), any URL / CSS / code.
 */

export const THEME_SPEC_VERSION = 1;
/** The whole spec, serialized, may not pass this. */
export const THEME_SPEC_MAX_BYTES = 8 * 1024;

/**
 * Display fonts the designer may pick: readable, Latin, with 400 / 600 / 700
 * on Google Fonts (the href asks for exactly those, and Google refuses a
 * request for a weight a family lacks — so nothing goes on this list without
 * all three). The font only dresses headings, the band title and buttons;
 * body text stays Lexend and money stays Inter (see THEME_FONT_SCOPE).
 */
export const THEME_FONTS = [
  "Lexend",
  "Archivo",
  "Barlow",
  "Bitter",
  "Cabin",
  "DM Sans",
  "Exo 2",
  "Figtree",
  "Fraunces",
  "IBM Plex Sans",
  "Inter",
  "Josefin Sans",
  "Kanit",
  "Libre Franklin",
  "Lora",
  "Manrope",
  "Montserrat",
  "Mulish",
  "Nunito Sans",
  "Open Sans",
  "Oswald",
  "Outfit",
  "Plus Jakarta Sans",
  "Poppins",
  "Raleway",
  "Roboto",
  "Roboto Slab",
  "Rubik",
  "Source Sans 3",
  "Space Grotesk",
  "Work Sans",
  "Zilla Slab",
] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];
export const THEME_FONT_SCOPE = "Headings, the band title and buttons. Body text stays Lexend; amounts stay Inter.";

export const LOGO_SIZES = ["sm", "md", "lg"] as const;
export const LOGO_PLACEMENTS = ["band-left", "band-center"] as const;
export const BAND_STYLES = ["solid", "gradient", "photo"] as const;
/** "outline" = an outline button that fills solid on hover. */
export const BUTTON_STYLES = ["solid", "outline", "pill"] as const;
/** round = today's 12 px cards (the most docs/site-design.md allows). */
export const CORNER_STYLES = ["square", "soft", "round"] as const;
export const LOGIN_LAYOUTS = ["band-top", "split", "photo-full"] as const;
export const BOOKING_HEROES = ["plain", "photo-left", "photo-behind"] as const;

export type LogoSize = (typeof LOGO_SIZES)[number];
export type LogoPlacement = (typeof LOGO_PLACEMENTS)[number];
export type BandStyle = (typeof BAND_STYLES)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type CornerStyle = (typeof CORNER_STYLES)[number];
export type LoginLayout = (typeof LOGIN_LAYOUTS)[number];
export type BookingHero = (typeof BOOKING_HEROES)[number];

/** The portal home's sections, in today's order. */
export const PORTAL_SECTIONS = ["balance", "todo", "requestWork", "comingUp", "completedWork", "agreements", "records"] as const;
export type PortalSectionId = (typeof PORTAL_SECTIONS)[number];
/**
 * Always shown and always first, in this order: what the client owes, then
 * what needs them (quote, next visit, agreement to sign, new messages).
 * Messages also stays in the tab bar whatever the theme says.
 */
export const PORTAL_PINNED_SECTIONS: readonly PortalSectionId[] = ["balance", "todo"];
export const PORTAL_SECTION_LABEL: Record<PortalSectionId, string> = {
  balance: "Balance due",
  todo: "To do (quotes, next visit, agreements, new messages)",
  requestWork: "Request work",
  comingUp: "Coming up",
  completedWork: "Completed work",
  agreements: "Agreements",
  records: "Your records",
};

/** Character caps per piece of copy. */
export const COPY_LIMITS = {
  heading: 60,
  welcome: 160,
  line: 160,
  itemDescription: 200,
  button: 24,
  thankYou: 200,
} as const;

export const OVERLAY_MIN = 0;
export const OVERLAY_MAX = 0.7;
export const DEFAULT_OVERLAY = 0.45;

/** Contrast bars (WCAG ratios). */
export const CONTRAST = {
  /** Band ink on the band (and on a photo band's overlay floor). */
  bandInk: 4.5,
  /** The accent against the white cards (a UI component). */
  accentOnWhite: 3,
  /** Text on the accent button. */
  buttonText: 4.5,
  /** Body ink on the page ground: ground must be near-white. */
  groundInk: 7,
} as const;

const WHITE = "#FFFFFF";
/** Dark ink used on light bands / buttons (lib/client-band.ts). */
export const THEME_INK = "#0A1428";
/** Body ink on the page ground (app/client-heavy.css --ch-ink, hub --hh-ink). */
export const BODY_INK = "#0A1428";
/**
 * What a photo band's overlay is measured over: a photo can't be measured
 * reliably, so the check assumes a bright patch of photo (sky, a white truck)
 * under white band text and a dark patch under dark band text, with the band
 * color laid over it at `overlay` opacity (the "overlay floor"). The band
 * text also gets a soft shadow on a photo (app/client-theme.css).
 */
export const PHOTO_FLOOR = { underWhiteInk: "#B0B0B0", underDarkInk: "#505050" } as const;

// ── Types ───────────────────────────────────────────────────────────────

export type ThemeItemOrder = { id: string; show: boolean };
export type ThemeItemWords = { description?: string; button?: string };

/** The stored spec: only what the designer set (everything optional but v). */
export type ClientThemeSpec = {
  v: 1;
  colors?: { band?: string; accent?: string; ground?: string };
  font?: ThemeFont;
  logo?: { size?: LogoSize; placement?: LogoPlacement };
  band?: { style?: BandStyle; imageId?: string; overlay?: number };
  buttons?: ButtonStyle;
  corners?: CornerStyle;
  portal?: { sections?: PortalSectionId[]; welcome?: string };
  login?: { layout?: LoginLayout; imageId?: string; heading?: string };
  booking?: { hero?: BookingHero; items?: ThemeItemOrder[]; heading?: string; line?: string; thankYou?: string };
  itemWords?: Record<string, ThemeItemWords>;
};

export type ThemeProblem = {
  /** Dotted path of the piece: "colors.accent", "booking.items[2].id". */
  path: string;
  /** Plain words, written for the AI (or the owner) to fix it. */
  message: string;
  /** Contrast failures: the measured ratio and the nearest color that passes. */
  ratio?: number;
  needed?: number;
  suggestion?: string;
  /** The whole spec was refused (not an object, wrong version, too big). */
  fatal?: boolean;
};

/** What the spec is checked against: this company's own records. */
export type ThemeContext = {
  /** This company's BookingType ids. */
  bookingItemIds: readonly string[];
  /** This company's ThemeAsset ids. */
  assetIds: readonly string[];
  /** The company's band color today (lib/client-band.ts clientBand(...).band) — a photo band without colors.band is checked on it. */
  defaultBand?: string;
};

export type ParsedClientTheme = {
  /** The clean spec: every piece that passed. Pieces with a problem are left out. */
  theme: ClientThemeSpec;
  problems: ThemeProblem[];
  /** Keys that are not part of the spec (dropped). */
  ignored: string[];
  ok: boolean;
};

// ── Color math ──────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function mix(a: string, b: string, t: number): string {
  // t = share of `a`
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * t + ((pb >> shift) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0").toUpperCase()}`;
}

function tint(hex: string, amount: number): string {
  return mix(WHITE, hex.toUpperCase(), amount);
}

function ratio(a: string, b: string): number {
  return contrastRatio(a, b) ?? 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Band ink, chosen as in lib/client-band.ts: white when it clears 3:1, else near-black. */
export function bandInk(band: string): string {
  return ratio(WHITE, band) >= 3 ? WHITE : THEME_INK;
}

/** Button text on a themed accent: whichever of white / ink reads better. */
export function buttonInk(accent: string): string {
  return ratio(WHITE, accent) >= ratio(THEME_INK, accent) ? WHITE : THEME_INK;
}

/** The band color under a photo, at the overlay, on the floor photo. */
export function photoFloor(band: string, overlay: number): string {
  const floor = bandInk(band) === WHITE ? PHOTO_FLOOR.underWhiteInk : PHOTO_FLOOR.underDarkInk;
  return mix(band.toUpperCase(), floor, overlay);
}

/**
 * The nearest color to `hex` that passes `test`: steps darker and lighter in
 * 3 % moves and takes whichever direction gets there first (`readableOn` in
 * lib/ds-theme.ts only walks one way).
 */
export function nearestPassing(hex: string, test: (c: string) => boolean): string | null {
  const base = hex.toUpperCase();
  if (test(base)) return base;
  for (let i = 1; i <= 33; i++) {
    const a = i * 0.03;
    const darker = shade(base, a).toUpperCase();
    if (test(darker)) return darker;
    const lighter = tint(base, a);
    if (test(lighter)) return lighter;
  }
  return null;
}

export function bandPasses(band: string): boolean {
  return ratio(WHITE, band) >= 1.25 && ratio(bandInk(band), band) >= CONTRAST.bandInk;
}
export function accentPasses(accent: string): boolean {
  return ratio(accent, WHITE) >= CONTRAST.accentOnWhite && ratio(buttonInk(accent), accent) >= CONTRAST.buttonText;
}
export function groundPasses(ground: string): boolean {
  return ratio(BODY_INK, ground) >= CONTRAST.groundInk;
}
export function photoBandPasses(band: string, overlay: number): boolean {
  return ratio(bandInk(band), photoFloor(band, overlay)) >= CONTRAST.bandInk;
}

// ── Copy ────────────────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|us|biz|info|app|dev|site|online|shop|me|ly|ai|xyz|gov|edu)\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// Seven or more digits in a run, allowing the usual separators: (469) 555-0142, 555-1234, +1 469…
const PHONE_RE = /(\+?\d[\s().-]*){7,}/;
const CODE_RE = /[<>{}`]/;

/**
 * Plain text only: newlines and runs of spaces collapse to one space, control
 * characters go. Refused (with a reason) when it carries a link, an email, a
 * phone number or markup, or runs past its cap. Empty = unset.
 */
export function cleanCopy(value: unknown, max: number): { text: string | null; problem: string | null } {
  if (value === undefined || value === null) return { text: null, problem: null };
  if (typeof value !== "string") return { text: null, problem: "must be plain text" };
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { text: null, problem: null };
  if (CODE_RE.test(text)) return { text: null, problem: "is plain text only: no <, >, {, } or backticks" };
  if (EMAIL_RE.test(text)) return { text: null, problem: "can't contain an email address (the company's real email is shown where it belongs)" };
  if (URL_RE.test(text)) return { text: null, problem: "can't contain a link or web address (links on these pages always come from the company's real details)" };
  if (PHONE_RE.test(text)) return { text: null, problem: "can't contain a phone number (the company's real phone is shown where it belongs)" };
  if (text.length > max) return { text: null, problem: `is ${text.length} characters; the most is ${max}` };
  return { text, problem: null };
}

// ── Parse ───────────────────────────────────────────────────────────────

const TOP_KEYS = ["v", "colors", "font", "logo", "band", "buttons", "corners", "portal", "login", "booking", "itemWords"] as const;
const SUB_KEYS: Record<string, readonly string[]> = {
  colors: ["band", "accent", "ground"],
  logo: ["size", "placement"],
  band: ["style", "imageId", "overlay"],
  portal: ["sections", "welcome"],
  login: ["layout", "imageId", "heading"],
  booking: ["hero", "items", "heading", "line", "thankYou"],
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], path: string, problems: ThemeProblem[]): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  problems.push({ path, message: `${path} must be one of: ${allowed.join(", ")}` });
  return undefined;
}

function pickHex(value: unknown, path: string, problems: ThemeProblem[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && HEX_RE.test(value.trim())) return value.trim().toUpperCase();
  problems.push({ path, message: `${path} must be a color written #RRGGBB (six hex digits)` });
  return undefined;
}

function pickCopy(value: unknown, max: number, path: string, problems: ThemeProblem[]): string | undefined {
  const { text, problem } = cleanCopy(value, max);
  if (problem) problems.push({ path, message: `${path} ${problem}` });
  return text ?? undefined;
}

function pickImage(value: unknown, ctx: ThemeContext, path: string, problems: ThemeProblem[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && ctx.assetIds.includes(value)) return value;
  problems.push({
    path,
    message: `${path} must be the id of a photo uploaded to this company's page designer (not a link). ${ctx.assetIds.length ? `Uploaded: ${ctx.assetIds.join(", ")}` : "No photos are uploaded yet."}`,
  });
  return undefined;
}

function contrastProblem(path: string, what: string, measured: number, needed: number, suggestion: string | null): ThemeProblem {
  return {
    path,
    message: `${what} is ${round2(measured)}:1; it needs ${needed}:1.${suggestion ? ` The nearest color that passes is ${suggestion}.` : ""}`,
    ratio: round2(measured),
    needed,
    ...(suggestion ? { suggestion } : {}),
  };
}

/**
 * Check and clean a theme spec. `raw` may be an object or its JSON text.
 * Every rule of the plan runs here; a piece that fails is LEFT OUT of
 * `theme` (never silently shifted) and named in `problems`, so the AI can
 * fix it. A fatal problem (not an object, wrong version, over 8 KB) returns
 * the empty spec.
 */
export function parseClientTheme(raw: unknown, ctx: ThemeContext): ParsedClientTheme {
  const problems: ThemeProblem[] = [];
  const ignored: string[] = [];
  const empty: ClientThemeSpec = { v: 1 };
  const fatal = (message: string): ParsedClientTheme => ({ theme: empty, problems: [{ path: "", message, fatal: true }], ignored, ok: false });

  let input: unknown = raw;
  if (typeof raw === "string") {
    if (byteLength(raw) > THEME_SPEC_MAX_BYTES) return fatal(`The theme is ${byteLength(raw)} bytes; the most is ${THEME_SPEC_MAX_BYTES}.`);
    try {
      input = JSON.parse(raw);
    } catch {
      return fatal("The theme is not valid JSON.");
    }
  }
  if (!isObj(input)) return fatal("The theme must be a JSON object.");
  let size = 0;
  try {
    size = byteLength(JSON.stringify(input));
  } catch {
    return fatal("The theme could not be read.");
  }
  if (size > THEME_SPEC_MAX_BYTES) return fatal(`The theme is ${size} bytes; the most is ${THEME_SPEC_MAX_BYTES}.`);
  if (input.v !== undefined && input.v !== THEME_SPEC_VERSION) return fatal(`Unknown theme version ${JSON.stringify(input.v)}; this is version ${THEME_SPEC_VERSION}.`);

  for (const k of Object.keys(input)) if (!(TOP_KEYS as readonly string[]).includes(k)) ignored.push(k);
  for (const [k, subs] of Object.entries(SUB_KEYS)) {
    const o = input[k];
    if (o !== undefined && o !== null && !isObj(o)) problems.push({ path: k, message: `${k} must be an object` });
    if (isObj(o)) for (const sk of Object.keys(o)) if (!subs.includes(sk)) ignored.push(`${k}.${sk}`);
  }
  const sub = (k: string): Record<string, unknown> => (isObj(input[k]) ? (input[k] as Record<string, unknown>) : {});

  const out: ClientThemeSpec = { v: 1 };

  // Colors
  const c = sub("colors");
  const colors: NonNullable<ClientThemeSpec["colors"]> = {};
  const band = pickHex(c.band, "colors.band", problems);
  if (band) {
    if (ratio(WHITE, band) < 1.25) {
      problems.push({ path: "colors.band", message: "colors.band is white or near-white, so the band would vanish into the page. Pick a real color.", suggestion: nearestPassing(band, bandPasses) ?? undefined });
    } else if (!bandPasses(band)) {
      const ink = bandInk(band);
      problems.push(contrastProblem("colors.band", `The band's ${ink === WHITE ? "white" : "dark"} text on ${band}`, ratio(ink, band), CONTRAST.bandInk, nearestPassing(band, bandPasses)));
    } else colors.band = band;
  }
  const accent = pickHex(c.accent, "colors.accent", problems);
  if (accent) {
    if (ratio(accent, WHITE) < CONTRAST.accentOnWhite) {
      problems.push(contrastProblem("colors.accent", `The button color ${accent} on the white cards`, ratio(accent, WHITE), CONTRAST.accentOnWhite, nearestPassing(accent, accentPasses)));
    } else if (!accentPasses(accent)) {
      problems.push(contrastProblem("colors.accent", `The button text on ${accent}`, ratio(buttonInk(accent), accent), CONTRAST.buttonText, nearestPassing(accent, accentPasses)));
    } else colors.accent = accent;
  }
  const ground = pickHex(c.ground, "colors.ground", problems);
  if (ground) {
    if (!groundPasses(ground)) {
      problems.push(contrastProblem("colors.ground", `Body text on the page background ${ground}`, ratio(BODY_INK, ground), CONTRAST.groundInk, nearestPassing(ground, groundPasses)));
    } else colors.ground = ground;
  }
  if (Object.keys(colors).length) out.colors = colors;

  // Font
  if (input.font !== undefined && input.font !== null && input.font !== "") {
    const f = typeof input.font === "string" ? THEME_FONTS.find((n) => n.toLowerCase() === (input.font as string).trim().toLowerCase()) : undefined;
    if (f) out.font = f;
    else problems.push({ path: "font", message: `font must be one of: ${THEME_FONTS.join(", ")}` });
  }

  // Logo
  const l = sub("logo");
  const logo: NonNullable<ClientThemeSpec["logo"]> = {};
  const size2 = pickEnum(l.size, LOGO_SIZES, "logo.size", problems);
  if (size2) logo.size = size2;
  const placement = pickEnum(l.placement, LOGO_PLACEMENTS, "logo.placement", problems);
  if (placement) logo.placement = placement;
  if (Object.keys(logo).length) out.logo = logo;

  // Band
  const b = sub("band");
  const bandOut: NonNullable<ClientThemeSpec["band"]> = {};
  const style = pickEnum(b.style, BAND_STYLES, "band.style", problems);
  const imageId = pickImage(b.imageId, ctx, "band.imageId", problems);
  if (imageId) bandOut.imageId = imageId;
  let overlay: number | undefined;
  if (b.overlay !== undefined && b.overlay !== null) {
    if (typeof b.overlay === "number" && Number.isFinite(b.overlay) && b.overlay >= OVERLAY_MIN && b.overlay <= OVERLAY_MAX) overlay = round2(b.overlay);
    else problems.push({ path: "band.overlay", message: `band.overlay must be a number from ${OVERLAY_MIN} to ${OVERLAY_MAX} (how strongly the band color covers the photo)` });
  }
  if (overlay !== undefined) bandOut.overlay = overlay;
  if (style === "photo") {
    const bandColor = colors.band ?? ctx.defaultBand ?? "#0B57D8";
    const ov = overlay ?? DEFAULT_OVERLAY;
    if (!imageId) {
      if (b.imageId === undefined || b.imageId === null || b.imageId === "") problems.push({ path: "band.style", message: "band.style photo needs band.imageId (an uploaded photo)." });
    } else if (!photoBandPasses(bandColor, ov)) {
      const ink = bandInk(bandColor);
      let need: number | null = null;
      for (let o = Math.ceil(ov * 20) / 20; o <= OVERLAY_MAX + 1e-9; o += 0.05) {
        if (photoBandPasses(bandColor, o)) {
          need = round2(o);
          break;
        }
      }
      const measured = ratio(ink, photoFloor(bandColor, ov));
      const other = need === null ? nearestPassing(bandColor, (x) => photoBandPasses(x, OVERLAY_MAX)) : null;
      const fix =
        need !== null
          ? `Use overlay ${need} or more.`
          : `No overlay up to ${OVERLAY_MAX} is enough on ${bandColor}: pick another band color${other ? ` such as ${other} (with overlay ${OVERLAY_MAX})` : ""}.`;
      problems.push({
        path: "band.overlay",
        message: `The band's text over the photo is ${round2(measured)}:1 at overlay ${ov}; it needs ${CONTRAST.bandInk}:1. ${fix}`,
        ratio: round2(measured),
        needed: CONTRAST.bandInk,
        ...(other ? { suggestion: other } : {}),
      });
    } else bandOut.style = style;
  } else if (style) bandOut.style = style;
  if (Object.keys(bandOut).length) out.band = bandOut;

  // Buttons + corners
  const buttons = pickEnum(input.buttons, BUTTON_STYLES, "buttons", problems);
  if (buttons) out.buttons = buttons;
  const corners = pickEnum(input.corners, CORNER_STYLES, "corners", problems);
  if (corners) out.corners = corners;

  // Portal
  const p = sub("portal");
  const portal: NonNullable<ClientThemeSpec["portal"]> = {};
  if (p.sections !== undefined && p.sections !== null) {
    const list = p.sections;
    const bad = (message: string) => problems.push({ path: "portal.sections", message });
    if (!Array.isArray(list)) bad("portal.sections must be a list of section ids");
    else {
      const unknown = list.filter((s) => typeof s !== "string" || !(PORTAL_SECTIONS as readonly string[]).includes(s));
      const dupes = list.filter((s, i) => list.indexOf(s) !== i);
      if (unknown.length) bad(`portal.sections has unknown ids (${unknown.map((s) => JSON.stringify(s)).join(", ")}). The ids are: ${PORTAL_SECTIONS.join(", ")}`);
      else if (dupes.length) bad(`portal.sections lists ${dupes.join(", ")} more than once`);
      else if (list[0] !== "balance" || list[1] !== "todo") {
        bad(`portal.sections must start with "balance" then "todo": Balance due and the to-do cards (quotes, next visit, agreements, new messages) are always shown, first. Anything after them can be moved or left out to hide it.`);
      } else portal.sections = list as PortalSectionId[];
    }
  }
  const welcome = pickCopy(p.welcome, COPY_LIMITS.welcome, "portal.welcome", problems);
  if (welcome) portal.welcome = welcome;
  if (Object.keys(portal).length) out.portal = portal;

  // Login
  const g = sub("login");
  const login: NonNullable<ClientThemeSpec["login"]> = {};
  const layout = pickEnum(g.layout, LOGIN_LAYOUTS, "login.layout", problems);
  const loginImage = pickImage(g.imageId, ctx, "login.imageId", problems);
  if (loginImage) login.imageId = loginImage;
  if (layout && layout !== "band-top" && !loginImage) {
    if (g.imageId === undefined || g.imageId === null || g.imageId === "") problems.push({ path: "login.layout", message: `login.layout ${layout} needs login.imageId (an uploaded photo).` });
  } else if (layout) login.layout = layout;
  const heading = pickCopy(g.heading, COPY_LIMITS.heading, "login.heading", problems);
  if (heading) login.heading = heading;
  if (Object.keys(login).length) out.login = login;

  // Booking
  const k = sub("booking");
  const booking: NonNullable<ClientThemeSpec["booking"]> = {};
  const hero = pickEnum(k.hero, BOOKING_HEROES, "booking.hero", problems);
  if (hero && hero !== "plain" && !bandOut.imageId) {
    problems.push({ path: "booking.hero", message: `booking.hero ${hero} uses the band photo: set band.imageId (an uploaded photo) first.` });
  } else if (hero) booking.hero = hero;
  if (k.items !== undefined && k.items !== null) {
    if (!Array.isArray(k.items)) problems.push({ path: "booking.items", message: "booking.items must be a list of { id, show }" });
    else {
      const items: ThemeItemOrder[] = [];
      k.items.forEach((it, i) => {
        const path = `booking.items[${i}]`;
        if (!isObj(it) || typeof it.id !== "string") return problems.push({ path, message: `${path} must be { "id": "<booking item id>", "show": true | false }` });
        if (!ctx.bookingItemIds.includes(it.id)) return problems.push({ path: `${path}.id`, message: `${path}.id ${JSON.stringify(it.id)} is not one of this company's booking items` });
        if (items.some((x) => x.id === it.id)) return problems.push({ path: `${path}.id`, message: `${path}.id ${it.id} is listed twice` });
        if (it.show !== undefined && typeof it.show !== "boolean") return problems.push({ path: `${path}.show`, message: `${path}.show must be true or false` });
        items.push({ id: it.id, show: it.show !== false });
      });
      const hiddenAll = items.length > 0 && ctx.bookingItemIds.every((id) => items.some((x) => x.id === id && !x.show));
      if (hiddenAll) problems.push({ path: "booking.items", message: "booking.items hides every item, so the booking page would be empty. Keep at least one shown." });
      else if (items.length) booking.items = items;
    }
  }
  const bHeading = pickCopy(k.heading, COPY_LIMITS.heading, "booking.heading", problems);
  if (bHeading) booking.heading = bHeading;
  const line = pickCopy(k.line, COPY_LIMITS.line, "booking.line", problems);
  if (line) booking.line = line;
  const thankYou = pickCopy(k.thankYou, COPY_LIMITS.thankYou, "booking.thankYou", problems);
  if (thankYou) booking.thankYou = thankYou;
  if (Object.keys(booking).length) out.booking = booking;

  // Item words
  if (input.itemWords !== undefined && input.itemWords !== null) {
    if (!isObj(input.itemWords)) problems.push({ path: "itemWords", message: "itemWords must be an object keyed by booking item id" });
    else {
      const words: Record<string, ThemeItemWords> = {};
      for (const [id, w] of Object.entries(input.itemWords)) {
        const path = `itemWords.${id}`;
        if (!ctx.bookingItemIds.includes(id)) {
          problems.push({ path, message: `${path}: ${JSON.stringify(id)} is not one of this company's booking items` });
          continue;
        }
        if (!isObj(w)) {
          problems.push({ path, message: `${path} must be { "description"?: text, "button"?: text }` });
          continue;
        }
        for (const sk of Object.keys(w)) if (sk !== "description" && sk !== "button") ignored.push(`${path}.${sk}`);
        const entry: ThemeItemWords = {};
        const d = pickCopy(w.description, COPY_LIMITS.itemDescription, `${path}.description`, problems);
        if (d) entry.description = d;
        const bt = pickCopy(w.button, COPY_LIMITS.button, `${path}.button`, problems);
        if (bt) entry.button = bt;
        if (Object.keys(entry).length) words[id] = entry;
      }
      if (Object.keys(words).length) out.itemWords = words;
    }
  }

  return { theme: out, problems, ignored, ok: problems.length === 0 };
}

// ── Merge ───────────────────────────────────────────────────────────────

/**
 * Lay an AI's partial edit over the current draft. Objects merge key by key
 * (colors, logo, band, portal, login, booking, each itemWords entry); lists
 * (portal.sections, booking.items) and plain values replace; `null` removes
 * the key, so it goes back to the default. The result is NOT checked: run it
 * through parseClientTheme.
 */
export function mergeThemePatch(draft: unknown, patch: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = isObj(draft) ? { ...draft } : { v: 1 };
  if (!isObj(patch)) return base;
  const deep = (a: Record<string, unknown>, b: Record<string, unknown>, depth: number): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...a };
    for (const [key, val] of Object.entries(b)) {
      if (val === null) delete out[key];
      else if (isObj(val) && isObj(out[key]) && depth < 3) out[key] = deep(out[key] as Record<string, unknown>, val, depth + 1);
      else if (isObj(val)) out[key] = deep({}, val, depth + 1);
      else out[key] = val;
    }
    return out;
  };
  const merged = deep(base, patch, 0);
  merged.v = THEME_SPEC_VERSION;
  return merged;
}

// ── Resolve ─────────────────────────────────────────────────────────────

/** Every piece filled in, for the renderers. */
export type ResolvedClientTheme = {
  /** True when nothing differs from the default look (no theme, or an empty one). */
  isDefault: boolean;
  /** Null = the company's own colors (lib/client-band.ts), as today. */
  colors: { band: string | null; accent: string | null; ground: string | null };
  /** Null = Lexend everywhere, as today. */
  font: ThemeFont | null;
  logo: { size: LogoSize; placement: LogoPlacement };
  band: { style: BandStyle; imageId: string | null; imageUrl: string | null; overlay: number };
  buttons: ButtonStyle;
  corners: CornerStyle;
  portal: { sections: PortalSectionId[]; welcome: string | null };
  login: { layout: LoginLayout; imageId: string | null; imageUrl: string | null; heading: string | null };
  booking: { hero: BookingHero; items: ThemeItemOrder[]; heading: string | null; line: string | null; thankYou: string | null };
  itemWords: Record<string, ThemeItemWords>;
};

export const DEFAULT_THEME: ResolvedClientTheme = Object.freeze({
  isDefault: true,
  colors: { band: null, accent: null, ground: null },
  font: null,
  logo: { size: "md", placement: "band-left" },
  band: { style: "solid", imageId: null, imageUrl: null, overlay: DEFAULT_OVERLAY },
  buttons: "solid",
  corners: "round",
  portal: { sections: [...PORTAL_SECTIONS], welcome: null },
  login: { layout: "band-top", imageId: null, imageUrl: null, heading: null },
  booking: { hero: "plain", items: [], heading: null, line: null, thankYou: null },
  itemWords: {},
}) as ResolvedClientTheme;

export type ResolveOptions = {
  /** Turn a ThemeAsset id into the URL the page loads it from; missing = no photo (photo pieces fall back to the plain look). */
  imageUrl?: (assetId: string) => string | null;
};

/**
 * The spec with every default filled in. Pure and forgiving: it trusts a spec
 * that came out of parseClientTheme, and a photo piece whose image can't be
 * turned into a URL falls back to the plain version of that piece.
 * resolveTheme(null) === today's look.
 */
export function resolveTheme(spec: ClientThemeSpec | null | undefined, opts: ResolveOptions = {}): ResolvedClientTheme {
  if (!spec) return cloneDefault();
  const url = (id: string | undefined | null) => (id && opts.imageUrl ? opts.imageUrl(id) : null);
  const bandUrl = url(spec.band?.imageId);
  const loginUrl = url(spec.login?.imageId);
  const sections = spec.portal?.sections?.length ? [...spec.portal.sections] : [...PORTAL_SECTIONS];
  const r: ResolvedClientTheme = {
    isDefault: false,
    colors: { band: spec.colors?.band ?? null, accent: spec.colors?.accent ?? null, ground: spec.colors?.ground ?? null },
    font: spec.font ?? null,
    logo: { size: spec.logo?.size ?? "md", placement: spec.logo?.placement ?? "band-left" },
    band: {
      style: spec.band?.style === "photo" && !bandUrl ? "solid" : (spec.band?.style ?? "solid"),
      imageId: spec.band?.imageId ?? null,
      imageUrl: bandUrl,
      overlay: spec.band?.overlay ?? DEFAULT_OVERLAY,
    },
    buttons: spec.buttons ?? "solid",
    corners: spec.corners ?? "round",
    portal: { sections, welcome: spec.portal?.welcome ?? null },
    login: {
      layout: spec.login?.layout && spec.login.layout !== "band-top" && !loginUrl ? "band-top" : (spec.login?.layout ?? "band-top"),
      imageId: spec.login?.imageId ?? null,
      imageUrl: loginUrl,
      heading: spec.login?.heading ?? null,
    },
    booking: {
      hero: spec.booking?.hero && spec.booking.hero !== "plain" && !bandUrl ? "plain" : (spec.booking?.hero ?? "plain"),
      items: spec.booking?.items ? spec.booking.items.map((i) => ({ ...i })) : [],
      heading: spec.booking?.heading ?? null,
      line: spec.booking?.line ?? null,
      thankYou: spec.booking?.thankYou ?? null,
    },
    itemWords: spec.itemWords ? Object.fromEntries(Object.entries(spec.itemWords).map(([k, v]) => [k, { ...v }])) : {},
  };
  r.isDefault = sameAsDefault(r);
  return r;
}

function cloneDefault(): ResolvedClientTheme {
  return JSON.parse(JSON.stringify(DEFAULT_THEME)) as ResolvedClientTheme;
}

function sameAsDefault(r: ResolvedClientTheme): boolean {
  const { isDefault: _a, ...x } = r;
  const { isDefault: _b, ...d } = DEFAULT_THEME;
  void _a;
  void _b;
  return JSON.stringify(x) === JSON.stringify(d);
}

// ── Helpers the renderers share ─────────────────────────────────────────

/** The portal home's sections to render, in order (pinned ones guaranteed). */
export function portalSectionOrder(theme: Pick<ResolvedClientTheme, "portal">): PortalSectionId[] {
  const list = theme.portal.sections.filter((s) => (PORTAL_SECTIONS as readonly string[]).includes(s));
  const rest = list.filter((s) => !PORTAL_PINNED_SECTIONS.includes(s));
  return [...PORTAL_PINNED_SECTIONS, ...rest];
}

/**
 * The booking menu in the theme's order: listed items first in the listed
 * order (hidden ones dropped), then every item the theme doesn't name, in
 * the company's own order. `show: false` only hides from the menu: the
 * item's own link keeps working, nothing is deactivated.
 */
export function orderBookingItems<T extends { id: string }>(items: readonly T[], theme: Pick<ResolvedClientTheme, "booking">): T[] {
  const order = theme.booking.items;
  if (!order.length) return [...items];
  const named = new Map(order.map((o, i) => [o.id, { i, show: o.show }]));
  const listed = items.filter((t) => named.has(t.id) && named.get(t.id)!.show).sort((a, b) => named.get(a.id)!.i - named.get(b.id)!.i);
  const rest = items.filter((t) => !named.has(t.id));
  return [...listed, ...rest];
}

/** An item's display words under the theme: blank = the item's own. */
export function themedItemWords(theme: Pick<ResolvedClientTheme, "itemWords">, id: string, own: { description: string | null; button: string }): { description: string | null; button: string } {
  const w = theme.itemWords[id];
  return { description: w?.description || own.description, button: w?.button || own.button };
}

/** Plain-language summary of the allowed values, for the AI tools (phase 4) and the settings page. */
export function themeSpecGuide() {
  return {
    version: THEME_SPEC_VERSION,
    maxBytes: THEME_SPEC_MAX_BYTES,
    fonts: [...THEME_FONTS],
    fontScope: THEME_FONT_SCOPE,
    logoSizes: [...LOGO_SIZES],
    logoPlacements: [...LOGO_PLACEMENTS],
    bandStyles: [...BAND_STYLES],
    buttonStyles: [...BUTTON_STYLES],
    cornerStyles: [...CORNER_STYLES],
    loginLayouts: [...LOGIN_LAYOUTS],
    bookingHeroes: [...BOOKING_HEROES],
    portalSections: PORTAL_SECTIONS.map((id) => ({ id, label: PORTAL_SECTION_LABEL[id], pinned: PORTAL_PINNED_SECTIONS.includes(id) })),
    copyLimits: { ...COPY_LIMITS },
    overlay: { min: OVERLAY_MIN, max: OVERLAY_MAX, default: DEFAULT_OVERLAY },
    contrast: { ...CONTRAST },
  };
}

/**
 * A public booking item with the theme's words laid on, for display only:
 * itemWords' description and button, and booking.thankYou as the done
 * screen's message where the item has none of its own. The item's heading,
 * questions, required fields and consent are untouched.
 */
export function themeBookingItem<T extends { id: string; description: string | null; buttonLabel: string; intake: { done: { body: string } } }>(
  item: T,
  theme: Pick<ResolvedClientTheme, "itemWords" | "booking" | "isDefault"> | null | undefined
): T {
  if (!theme || theme.isDefault) return item;
  const words = themedItemWords(theme, item.id, { description: item.description, button: item.buttonLabel });
  const thankYou = theme.booking.thankYou;
  const needsThanks = Boolean(thankYou && !item.intake.done.body);
  if (words.description === item.description && words.button === item.buttonLabel && !needsThanks) return item;
  return {
    ...item,
    description: words.description,
    buttonLabel: words.button,
    intake: needsThanks ? { ...item.intake, done: { ...item.intake.done, body: thankYou as string } } : item.intake,
  };
}
