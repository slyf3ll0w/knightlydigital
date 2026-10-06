import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { isManager } from "@/lib/permissions";
import { zonedMidnight, zonedParts } from "@/lib/timezone";
import {
  EXPIRY_CHOICES,
  STICKY_BODY_MAX,
  STICKY_COLORS,
  STICKY_OWN_CAP,
  STICKY_TEAM_CAP,
  clampSize,
  monogram,
  normalizePage,
  type ExpiryChoice,
  type StickyColor,
  type StickyNoteDTO,
} from "@/lib/sticky-shared";

export * from "@/lib/sticky-shared";

/**
 * Sticky notes (docs/plans/tasks-schedule-send-sticky-notes-2026-10-03.md § 3,
 * v4 2026-10-06): a note is stuck to a PAGE at a spot the author chose —
 * any /app page, from a right-click on empty space (desktop) or the
 * "Notes on this page" strip (phone). Personal by default; `shared` shows
 * it to everyone on that page. A teammate dragging a team note moves only
 * their own copy (StickyNotePlacement). Notes can expire.
 */

export const noteInclude = {
  user: { select: { id: true, name: true } },
} as const;

type NoteRow = {
  id: string;
  body: string;
  color: StickyColor;
  rotation: number;
  shared: boolean;
  page: string | null;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  expiresAt: Date | null;
  userId: string;
  updatedAt: Date;
  user: { id: string; name: string };
};

export function canEditNote(actor: Actor, note: { userId: string; shared: boolean }): boolean {
  return note.userId === actor.id || (note.shared && isManager(actor.role));
}

function expiryLabel(tz: string, at: Date | null): string | null {
  if (!at) return null;
  return `Until ${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(at)}`;
}

function expiryDate(tz: string, at: Date | null): string {
  if (!at) return "";
  const p = zonedParts(tz, at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function serializeNote(
  row: NoteRow,
  actor: Actor,
  placement: { x: number; y: number; z: number } | null | undefined,
  tz: string
): StickyNoteDTO {
  return {
    id: row.id,
    body: row.body,
    color: row.color,
    rotation: row.rotation,
    shared: row.shared,
    page: row.page ?? "/app/dashboard",
    // A teammate's own drag wins over the author's spot
    x: placement?.x ?? row.x,
    y: placement?.y ?? row.y,
    z: placement?.z ?? 0,
    width: row.width,
    height: row.height,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    expiryLabel: expiryLabel(tz, row.expiresAt),
    expiryDate: expiryDate(tz, row.expiresAt),
    authorId: row.userId,
    authorName: row.user.name,
    authorMonogram: monogram(row.user.name),
    canEdit: canEditNote(actor, row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The viewer's notes on one page: their own + the team's, unexpired. Last touched first. */
export async function listNotes(actor: Actor, page: string, tz: string, now: Date = new Date()): Promise<StickyNoteDTO[]> {
  const p = normalizePage(page);
  const rows = await prisma.stickyNote.findMany({
    where: {
      companyId: actor.companyId,
      archivedAt: null,
      OR: [{ userId: actor.id }, { shared: true }],
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        // The pre-v4 board had no page: it lives on Home
        { OR: [{ page: p }, ...(p === "/app/dashboard" ? [{ page: null }] : [])] },
      ],
    },
    include: noteInclude,
    orderBy: { updatedAt: "desc" },
    take: STICKY_OWN_CAP + STICKY_TEAM_CAP,
  });
  if (rows.length === 0) return [];
  const placements = await prisma.stickyNotePlacement.findMany({
    where: { userId: actor.id, noteId: { in: rows.map((r) => r.id) } },
  });
  const byNote = new Map(placements.map((pl) => [pl.noteId, pl]));
  return rows.map((r) => serializeNote(r, actor, byNote.get(r.id), tz));
}

/** For the 20-second poll: changes when any note the viewer can see is touched. */
export async function notesVersion(actor: Actor): Promise<string | null> {
  const latest = await prisma.stickyNote.findFirst({
    where: { companyId: actor.companyId, OR: [{ userId: actor.id }, { shared: true }] },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true, id: true },
  });
  return latest ? `${latest.id}:${latest.updatedAt.getTime()}` : null;
}

export function validateBody(raw: unknown): { body: string } | { error: string } {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { error: "Write something on the note." };
  if (body.length > STICKY_BODY_MAX) return { error: `Keep it under ${STICKY_BODY_MAX} characters.` };
  return { body };
}

export function validateColor(raw: unknown): StickyColor | null {
  return STICKY_COLORS.some((c) => c.key === raw) ? (raw as StickyColor) : null;
}

export function validatePage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = normalizePage(raw);
  return p.startsWith("/app/") && !p.includes("..") ? p : null;
}

export function validatePos(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100000, Math.round(raw))) : null;
}

/**
 * Expiry from the editor: a choice (end of today / tomorrow / a week, in
 * the company's zone — the note lasts through that whole day) or a custom
 * day. Returns undefined when the body didn't mention expiry.
 */
export function parseExpiry(
  choice: unknown,
  customDate: unknown,
  tz: string,
  now: Date = new Date()
): { expiresAt: Date | null } | { error: string } | undefined {
  if (choice === undefined) return undefined;
  if (!EXPIRY_CHOICES.some((c) => c.key === choice)) return { error: "That expiry option doesn't exist." };
  const k = choice as ExpiryChoice;
  if (k === "none") return { expiresAt: null };
  const p = zonedParts(tz, now);
  const endOf = (y: number, m: number, d: number) => new Date(zonedMidnight(tz, y, m, d + 1).getTime() - 1000);
  if (k === "today") return { expiresAt: endOf(p.y, p.m, p.d) };
  if (k === "tomorrow") return { expiresAt: endOf(p.y, p.m, p.d + 1) };
  if (k === "week") return { expiresAt: endOf(p.y, p.m, p.d + 7) };
  if (typeof customDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return { error: "Pick a day for the note to come down." };
  const [y, m, d] = customDate.split("-").map(Number);
  const at = endOf(y, m, d);
  if (at.getTime() <= now.getTime()) return { error: "That day has already passed." };
  return { expiresAt: at };
}

/** Caps: 30 live notes per person, 30 team notes per company. */
export async function capReached(actor: Actor, shared: boolean, excludeId?: string): Promise<string | null> {
  if (shared) {
    const n = await prisma.stickyNote.count({
      where: { companyId: actor.companyId, shared: true, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (n >= STICKY_TEAM_CAP) return `The team has ${STICKY_TEAM_CAP} notes up already. Take one down first.`;
  } else {
    const n = await prisma.stickyNote.count({
      where: { userId: actor.id, shared: false, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (n >= STICKY_OWN_CAP) return `You have ${STICKY_OWN_CAP} notes up already. Take one down first.`;
  }
  return null;
}

/** Hourly cron: expired notes are archived (reads already hide them). */
export async function archiveExpiredNotes(now: Date = new Date()): Promise<number> {
  const r = await prisma.stickyNote.updateMany({
    where: { archivedAt: null, expiresAt: { lte: now } },
    data: { archivedAt: now },
  });
  return r.count;
}

export { clampSize };
