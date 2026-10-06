/** Sticky notes — types and constants safe for client components (no Prisma). */

export const STICKY_BODY_MAX = 400;
/** Live notes per person, and team notes per company — keeps the board and the query small. */
export const STICKY_OWN_CAP = 30;
export const STICKY_TEAM_CAP = 30;

export type StickyColor = "YELLOW" | "PINK" | "BLUE" | "GREEN" | "ORANGE";

export const STICKY_COLORS: { key: StickyColor; label: string }[] = [
  { key: "YELLOW", label: "Yellow" },
  { key: "PINK", label: "Pink" },
  { key: "BLUE", label: "Blue" },
  { key: "GREEN", label: "Green" },
  { key: "ORANGE", label: "Orange" },
];

export type StickyNoteDTO = {
  id: string;
  body: string;
  color: StickyColor;
  rotation: number;
  shared: boolean;
  authorId: string;
  authorName: string;
  /** "DL" — shown on team notes */
  authorMonogram: string;
  /** May this viewer edit / delete it (author, or a manager for team notes). */
  canEdit: boolean;
  /** This viewer's placement on the desktop board (0–1), null = not placed yet. */
  x: number | null;
  y: number | null;
  z: number;
  updatedAt: string;
};

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
