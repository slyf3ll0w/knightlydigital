import { DEFAULT_OVERLAY, OVERLAY_MAX, photoBandPasses, type BandStyle, type ButtonStyle, type ClientThemeSpec, type CornerStyle } from "./client-theme-spec";

/**
 * Settings → Client pages, the simple controls (David 2026-11-20: "very
 * confusing… could we simplify it?"). Pure, so the rules are unit-tested
 * (scripts/test-client-theme-presets.ts):
 *
 *  - three ready-made STYLES, each setting buttons + card corners + band style
 *    together (a photo band, when the Photo switch is on, wins over the style's
 *    band);
 *  - the PHOTO switch: one photo for the band and the booking page's top;
 *  - the UNDO stack: the drafts of this page session, newest last.
 *
 * Each function returns a new spec and never mutates its input. Defaults are
 * written as "nothing set" (the key is removed), so a spec stays as small as
 * the look it describes.
 */

type Spec = ClientThemeSpec & Record<string, unknown>;

export type StylePresetId = "clean" | "bold" | "soft";

export type StylePreset = {
  id: StylePresetId;
  label: string;
  buttons: ButtonStyle;
  corners: CornerStyle;
  /** The band when the Photo switch is off. */
  band: Exclude<BandStyle, "photo">;
};

/** Clean is the default look (nothing set). */
export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: "clean", label: "Clean", buttons: "solid", corners: "round", band: "solid" },
  { id: "bold", label: "Bold", buttons: "solid", corners: "square", band: "gradient" },
  { id: "soft", label: "Soft", buttons: "pill", corners: "round", band: "gradient" },
];

const DEFAULT_BUTTONS: ButtonStyle = "solid";
const DEFAULT_CORNERS: CornerStyle = "round";
const DEFAULT_BAND: BandStyle = "solid";

function copy(spec: ClientThemeSpec | null | undefined): Spec {
  return JSON.parse(JSON.stringify(spec ?? { v: 1 })) as Spec;
}

/** Write one key of a group; the default value (or null) removes it, and an empty group goes. */
function setGroup(s: Spec, group: "band" | "booking", key: string, value: unknown, dflt?: unknown) {
  const g = { ...((s[group] as Record<string, unknown> | undefined) ?? {}) };
  if (value === null || value === undefined || value === dflt) delete g[key];
  else g[key] = value;
  if (Object.keys(g).length) (s as Record<string, unknown>)[group] = g;
  else delete (s as Record<string, unknown>)[group];
}

/** Whether the Photo switch reads as on: a photo band, or a booking top that uses the band photo. */
export function photoOn(spec: ClientThemeSpec | null | undefined): boolean {
  return spec?.band?.style === "photo" || (spec?.booking?.hero !== undefined && spec.booking.hero !== "plain");
}

/** Which ready-made style the spec matches, or null for a mix of its own (set under More options). */
export function stylePresetOf(spec: ClientThemeSpec | null | undefined): StylePresetId | null {
  const buttons = spec?.buttons ?? DEFAULT_BUTTONS;
  const corners = spec?.corners ?? DEFAULT_CORNERS;
  const band = spec?.band?.style ?? DEFAULT_BAND;
  for (const p of STYLE_PRESETS) {
    if (p.buttons !== buttons || p.corners !== corners) continue;
    // With a photo band the band style can't tell the presets apart: buttons + corners decide
    if (band === "photo" || band === p.band) return p.id;
  }
  return null;
}

/** Apply a ready-made style: buttons, corners and (unless the photo band is on) the band. */
export function applyStylePreset(spec: ClientThemeSpec | null | undefined, id: StylePresetId): Spec {
  const p = STYLE_PRESETS.find((x) => x.id === id);
  const s = copy(spec);
  if (!p) return s;
  if (p.buttons === DEFAULT_BUTTONS) delete s.buttons;
  else s.buttons = p.buttons;
  if (p.corners === DEFAULT_CORNERS) delete s.corners;
  else s.corners = p.corners;
  if (s.band?.style !== "photo") setGroup(s, "band", "style", p.band, DEFAULT_BAND);
  return s;
}

/**
 * The lightest band-color layer (from the default up, in 5 % steps) that keeps
 * the band's text readable over a photo; the most allowed when none does.
 */
export function readableOverlay(band: string): number {
  for (let o = DEFAULT_OVERLAY; o <= OVERLAY_MAX + 1e-9; o += 0.05) {
    const v = Math.round(o * 100) / 100;
    if (photoBandPasses(band, v)) return v;
  }
  return OVERLAY_MAX;
}

/**
 * The Photo switch. On with a photo id: the band shows the photo and the
 * booking page's top uses it (keeping a photo layout already picked under
 * More options). Off: the band goes back to the style's band, the booking
 * top to plain; the photo id is kept so switching back on restores it.
 * On with no photo yet only remembers nothing (the picker asks for one).
 * `bandColor` (the band color in use) lets "on" pick a readable layer of
 * color over the photo when the default one would fail the contrast check.
 */
export function setThemePhoto(spec: ClientThemeSpec | null | undefined, on: boolean, imageId?: string | null, bandColor?: string): Spec {
  const s = copy(spec);
  const id = imageId === undefined ? (s.band?.imageId ?? null) : imageId;
  if (on && id) {
    setGroup(s, "band", "imageId", id);
    setGroup(s, "band", "style", "photo");
    if (bandColor && !photoBandPasses(bandColor, s.band?.overlay ?? DEFAULT_OVERLAY)) setGroup(s, "band", "overlay", readableOverlay(bandColor));
    const hero = s.booking?.hero;
    if (hero !== "photo-left" && hero !== "photo-behind") setGroup(s, "booking", "hero", "photo-behind");
    return s;
  }
  if (imageId === null) setGroup(s, "band", "imageId", null);
  if (s.band?.style === "photo") {
    const preset = STYLE_PRESETS.find((p) => p.buttons === (s.buttons ?? DEFAULT_BUTTONS) && p.corners === (s.corners ?? DEFAULT_CORNERS));
    setGroup(s, "band", "style", preset?.band ?? DEFAULT_BAND, DEFAULT_BAND);
    // The overlay only means something over a photo
    setGroup(s, "band", "overlay", null);
  }
  setGroup(s, "booking", "hero", null);
  return s;
}

// ── Undo ────────────────────────────────────────────────────────────────

/** How many earlier drafts one page session keeps. */
export const UNDO_LIMIT = 30;

/** The drafts before the current one, oldest first. */
export type UndoStack = readonly string[];

/**
 * Remember `previous` (the spec before a change) on the stack. Stored as JSON
 * so a later edit can never reach back into it; a repeat of the top entry is
 * not stored twice; the oldest fall off past UNDO_LIMIT.
 */
export function pushUndo(stack: UndoStack, previous: ClientThemeSpec | null | undefined): UndoStack {
  const json = JSON.stringify(previous ?? { v: 1 });
  if (stack[stack.length - 1] === json) return stack;
  const next = [...stack, json];
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next;
}

/** Step back once: the spec to restore and the shorter stack, or null when there is nothing to undo. */
export function popUndo(stack: UndoStack): { spec: Spec; stack: UndoStack } | null {
  if (!stack.length) return null;
  return { spec: JSON.parse(stack[stack.length - 1]) as Spec, stack: stack.slice(0, -1) };
}

// ── Atlas on the page ───────────────────────────────────────────────────

export type DesignTurn = { role: "user" | "assistant"; content: string; recap?: string };

/** Turns the page sends to Atlas: the last few, the last two replies with their recaps (so "it" resolves). */
export const DESIGN_TURNS_SENT = 8;

export function designTurnsToSend(turns: readonly DesignTurn[]): { role: "user" | "assistant"; content: string }[] {
  const recent = turns.slice(-DESIGN_TURNS_SENT);
  // The API wants the first turn to be the person's
  while (recent.length && recent[0].role !== "user") recent.shift();
  const replies = recent.map((t, i) => (t.role === "assistant" ? i : -1)).filter((i) => i >= 0);
  const withRecap = new Set(replies.slice(-2));
  return recent.map((t, i) => ({
    role: t.role,
    content: t.role === "assistant" && t.recap && withRecap.has(i) ? `${t.content}\n\n[Behind this reply: ${t.recap}]` : t.content,
  }));
}
