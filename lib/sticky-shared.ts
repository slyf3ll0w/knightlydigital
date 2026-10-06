/** Sticky notes — types and constants safe for client components (no Prisma). */

export const STICKY_BODY_MAX = 400;
/** Live notes per person, and team notes per company — keeps the board and the query small. */
export const STICKY_OWN_CAP = 30;
export const STICKY_TEAM_CAP = 30;
/** Custom sizing bounds (px). */
export const STICKY_MIN = 120;
export const STICKY_MAX = 480;
export const STICKY_DEFAULT = 168;

export type StickyColor = "YELLOW" | "PINK" | "BLUE" | "GREEN" | "ORANGE";

export const STICKY_COLORS: { key: StickyColor; label: string }[] = [
  { key: "YELLOW", label: "Yellow" },
  { key: "PINK", label: "Pink" },
  { key: "BLUE", label: "Blue" },
  { key: "GREEN", label: "Green" },
  { key: "ORANGE", label: "Orange" },
];

/** The editor's size chips; desktop can also drag the corner to any size in between. */
export const STICKY_SIZES: { key: "S" | "M" | "L"; label: string; px: number }[] = [
  { key: "S", label: "Small", px: 136 },
  { key: "M", label: "Medium", px: STICKY_DEFAULT },
  { key: "L", label: "Large", px: 232 },
];

export type ExpiryChoice = "none" | "today" | "tomorrow" | "week" | "custom";

export const EXPIRY_CHOICES: { key: ExpiryChoice; label: string }[] = [
  { key: "none", label: "Keeps until taken down" },
  { key: "today", label: "End of today" },
  { key: "tomorrow", label: "End of tomorrow" },
  { key: "week", label: "In a week" },
  { key: "custom", label: "Pick a day…" },
];

export type StickyNoteDTO = {
  id: string;
  body: string;
  color: StickyColor;
  rotation: number;
  shared: boolean;
  /** The page it's stuck to ("/app/jobs/abc"); the old board reads as "/app/dashboard". */
  page: string;
  /** Position on that page in px from the scrolling content's top-left; null = not placed yet. */
  x: number | null;
  y: number | null;
  z: number;
  width: number;
  height: number;
  expiresAt: string | null;
  /** "Until Fri, Oct 10" — null when it keeps. */
  expiryLabel: string | null;
  /** Editor field for a custom expiry (YYYY-MM-DD in the company's zone). */
  expiryDate: string;
  authorId: string;
  authorName: string;
  /** "DL" — shown on team notes */
  authorMonogram: string;
  /** May this viewer edit / delete it (author, or a manager for team notes). */
  canEdit: boolean;
  updatedAt: string;
};

/** The pathname a note belongs to: no query, no hash, no trailing slash. */
export function normalizePage(raw: string): string {
  let p = raw.split(/[?#]/)[0] || "/app/dashboard";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.slice(0, 200);
}

export function clampSize(v: unknown, fallback = STICKY_DEFAULT): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(STICKY_MAX, Math.max(STICKY_MIN, n));
}

/** The first line (or the first ~80 chars) of a note becomes the task title. */
export function taskTitleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const t = firstLine || body.trim();
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t;
}

export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable tilt for a new note: −3° … +3°, never exactly flat. */
export function randomRotation(rand: () => number = Math.random): number {
  const r = (rand() * 6 - 3);
  return Math.abs(r) < 0.4 ? (r < 0 ? -0.6 : 0.6) : Math.round(r * 10) / 10;
}

/** Turn bare URLs into links; everything else is plain text (no formatting). */
export function splitLinks(body: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  for (const m of body.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: body.slice(last, i) });
    out.push({ text: m[0], href: m[0] });
    last = i + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/** True when the pointer is on something that already does something on click/right-click. */
export function isInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  return Boolean(
    el.closest(
      'a, button, input, textarea, select, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="dialog"], [contenteditable="true"], .ds-sticky, [data-notes-skip]'
    )
  );
}
