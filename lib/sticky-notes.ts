import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { isManager } from "@/lib/permissions";
import {
  STICKY_BODY_MAX,
  STICKY_COLORS,
  STICKY_OWN_CAP,
  STICKY_TEAM_CAP,
  monogram,
  type StickyColor,
  type StickyNoteDTO,
} from "@/lib/sticky-shared";

export * from "@/lib/sticky-shared";

/**
 * Sticky notes on Home (docs/plans/tasks-schedule-send-sticky-notes-2026-10-03.md § 3).
 * A note is the author's; `shared` pins it to the team board where everyone
 * in the company sees it. Positions on the desktop board are per viewer
 * (StickyNotePlacement), so my moves never move yours.
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
  userId: string;
  updatedAt: Date;
  user: { id: string; name: string };
};

export function canEditNote(actor: Actor, note: { userId: string; shared: boolean }): boolean {
  return note.userId === actor.id || (note.shared && isManager(actor.role));
}

export function serializeNote(
  row: NoteRow,
  actor: Actor,
  placement: { x: number; y: number; z: number } | null | undefined
): StickyNoteDTO {
  return {
    id: row.id,
    body: row.body,
    color: row.color,
    rotation: row.rotation,
    shared: row.shared,
    authorId: row.userId,
    authorName: row.user.name,
    authorMonogram: monogram(row.user.name),
    canEdit: canEditNote(actor, row),
    x: placement?.x ?? null,
    y: placement?.y ?? null,
    z: placement?.z ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Everything this viewer's board shows: their own live notes + the team's. Last touched first. */
export async function listNotes(actor: Actor): Promise<StickyNoteDTO[]> {
  const rows = await prisma.stickyNote.findMany({
    where: {
      companyId: actor.companyId,
      archivedAt: null,
      OR: [{ userId: actor.id }, { shared: true }],
    },
    include: noteInclude,
    orderBy: { updatedAt: "desc" },
    take: STICKY_OWN_CAP + STICKY_TEAM_CAP,
  });
  if (rows.length === 0) return [];
  const placements = await prisma.stickyNotePlacement.findMany({
    where: { userId: actor.id, noteId: { in: rows.map((r) => r.id) } },
  });
  const byNote = new Map(placements.map((p) => [p.noteId, p]));
  return rows.map((r) => serializeNote(r, actor, byNote.get(r.id)));
}

/** For the 20-second poll: changes when any note the viewer can see is touched. */
export async function notesVersion(actor: Actor): Promise<string | null> {
  const latest = await prisma.stickyNote.findFirst({
    where: { companyId: actor.companyId, OR: [{ userId: actor.id }, { shared: true }] },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true, archivedAt: true, id: true },
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

/** Caps: 30 live notes per person, 30 team notes per company. */
export async function capReached(actor: Actor, shared: boolean, excludeId?: string): Promise<string | null> {
  if (shared) {
    const n = await prisma.stickyNote.count({
      where: { companyId: actor.companyId, shared: true, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (n >= STICKY_TEAM_CAP) return `The team board is full (${STICKY_TEAM_CAP} notes). Take one down first.`;
  } else {
    const n = await prisma.stickyNote.count({
      where: { userId: actor.id, shared: false, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (n >= STICKY_OWN_CAP) return `You have ${STICKY_OWN_CAP} notes up already. Take one down first.`;
  }
  return null;
}
