import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions";

/**
 * Team chat shared helpers. A "thread" is either the company-wide channel
 * ("company") or a DM identified by the peer's user id.
 */

export const TAPBACKS = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;

export type ThreadKey = string; // "company" | peer userId

export const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  userId: true,
  user: { select: { name: true } },
  reactions: { select: { emoji: true, userId: true } },
} as const;

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  userId: string;
  user: { name: string };
  reactions: { emoji: string; userId: string }[];
};

export function serializeMessage(m: MessageRow) {
  return {
    id: m.id,
    // Defense in depth: never ship a deleted message's text even if a write
    // path forgot to blank it
    body: m.deletedAt ? "" : m.body,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    userId: m.userId,
    userName: m.user.name,
    reactions: m.deletedAt ? [] : m.reactions,
  };
}

/** Validate a thread key for this actor; returns the DM peer id or null for the channel. */
export async function resolveThread(
  actor: Actor,
  thread: string | null
): Promise<{ peerId: string | null } | { error: string }> {
  if (!thread || thread === "company") return { peerId: null };
  const peer = await prisma.user.findFirst({
    where: { id: thread, companyId: actor.companyId, isActive: true },
    select: { id: true },
  });
  if (!peer || peer.id === actor.id) return { error: "That teammate isn't available." };
  return { peerId: peer.id };
}

/** Prisma where-clause for a thread's messages. */
export function threadWhere(actor: Actor, peerId: string | null): Record<string, unknown> {
  if (peerId === null) return { companyId: actor.companyId, recipientId: null };
  return {
    companyId: actor.companyId,
    OR: [
      { userId: actor.id, recipientId: peerId },
      { userId: peerId, recipientId: actor.id },
    ],
  };
}

// ── Typing indicators ────────────────────────────────────────────────────────
// Ephemeral by design: an in-memory map (like the prisma singleton) that a
// poll reads back. Zero database writes; entries expire after a few seconds.

const TYPING_TTL_MS = 5000;

type TypingMap = Map<string, Map<string, number>>; // threadScope -> userId -> stamp

const globalForTyping = globalThis as unknown as { __chatTyping?: TypingMap };
const typing: TypingMap = (globalForTyping.__chatTyping ??= new Map());

function typingScope(companyId: string, actorId: string, peerId: string | null): string {
  if (peerId === null) return `co:${companyId}`;
  const [a, b] = [actorId, peerId].sort();
  return `dm:${a}:${b}`;
}

export function markTyping(companyId: string, actorId: string, peerId: string | null): void {
  const scope = typingScope(companyId, actorId, peerId);
  const users = typing.get(scope) ?? new Map<string, number>();
  users.set(actorId, Date.now());
  typing.set(scope, users);
}

export function activeTypers(
  companyId: string,
  actorId: string,
  peerId: string | null
): string[] {
  const scope = typingScope(companyId, actorId, peerId);
  const users = typing.get(scope);
  if (!users) return [];
  const now = Date.now();
  const out: string[] = [];
  for (const [userId, stamp] of users) {
    if (now - stamp > TYPING_TTL_MS) users.delete(userId);
    else if (userId !== actorId) out.push(userId);
  }
  if (users.size === 0) typing.delete(scope);
  return out;
}

// ── Read markers ─────────────────────────────────────────────────────────────

/** Stamp a thread as read: channel → User.chatLastSeenAt, DM → ChatThreadState. */
export async function markThreadSeen(actorId: string, peerId: string | null): Promise<void> {
  const now = new Date();
  if (peerId === null) {
    await prisma.user.update({ where: { id: actorId }, data: { chatLastSeenAt: now } });
    return;
  }
  await prisma.chatThreadState.upsert({
    where: { userId_threadKey: { userId: actorId, threadKey: peerId } },
    create: { userId: actorId, threadKey: peerId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
}

/**
 * Unread counts per thread for the actor: the channel plus one entry per DM
 * peer with anything new. Single groupBy for all DMs.
 */
export async function unreadByThread(
  actor: Actor
): Promise<{ company: number; dms: Record<string, number> }> {
  const [me, states] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.id }, select: { chatLastSeenAt: true } }),
    prisma.chatThreadState.findMany({
      where: { userId: actor.id },
      select: { threadKey: true, lastSeenAt: true },
    }),
  ]);
  const seen = new Map(states.map((s) => [s.threadKey, s.lastSeenAt]));
  const epoch = new Date(0);

  const [company, dmGroups] = await Promise.all([
    prisma.teamMessage.count({
      where: {
        companyId: actor.companyId,
        recipientId: null,
        userId: { not: actor.id },
        deletedAt: null,
        ...(me?.chatLastSeenAt ? { createdAt: { gt: me.chatLastSeenAt } } : {}),
      },
    }),
    prisma.teamMessage.groupBy({
      by: ["userId"],
      _count: { _all: true },
      where: {
        recipientId: actor.id,
        deletedAt: null,
        // per-sender cutoff: only messages newer than that thread's marker
        OR: [
          ...[...seen.entries()].map(([peer, at]) => ({
            userId: peer,
            createdAt: { gt: at },
          })),
          { userId: { notIn: [...seen.keys()] } },
        ],
        createdAt: { gt: epoch },
      },
    }),
  ]);

  const dms: Record<string, number> = {};
  for (const g of dmGroups) dms[g.userId] = g._count._all;
  return { company, dms };
}
