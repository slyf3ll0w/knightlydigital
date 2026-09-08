import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions";

/**
 * Team chat (channels rework).
 *
 * Every conversation is a ChatChannel:
 *  - the built-in "Everyone" channel — one per company, no member rows,
 *    visible to every active user, read marker on User.chatLastSeenAt;
 *  - member-created DMs (2 members, unnamed — displays the peer's name) and
 *    group chats (2+ members, named), read markers on ChatChannelMember.
 * Nothing besides Everyone exists until a user creates it.
 */

export const TAPBACKS = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;

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

// ── Channels ─────────────────────────────────────────────────────────────────

// Companies whose legacy broadcast rows have been swept this process. The
// sweep is a one-time migration, but it used to run as an unconditional
// updateMany on EVERY chat poll and nav-count fetch — a write-lock probe on
// the fastest-growing table, thousands of times a minute at scale. Once per
// boot per company is plenty: a restart just re-checks a no-op.
const legacySwept = new Set<string>();

/** The company's Everyone channel, created on first use. Also sweeps any
 *  legacy channel-less broadcast messages into it (pre-channels rows). */
export async function ensureEveryoneChannel(companyId: string) {
  let channel = await prisma.chatChannel.findFirst({
    where: { companyId, isEveryone: true },
  });
  if (!channel) {
    channel = await prisma.chatChannel.create({
      data: { companyId, isEveryone: true },
    });
  }
  if (!legacySwept.has(companyId)) {
    legacySwept.add(companyId);
    await prisma.teamMessage.updateMany({
      where: { companyId, channelId: null, recipientId: null },
      data: { channelId: channel.id },
    });
  }
  return channel;
}

export type ResolvedChannel = {
  id: string;
  isEveryone: boolean;
  name: string | null;
  createdById: string | null;
  /** Everyone: every active user id. Else: the member ids. */
  memberIds: string[];
};

/** Load a channel the actor may read/write, or null. "everyone" resolves the
 *  built-in channel. */
export async function resolveChannel(
  actor: Actor,
  channelId: string | null
): Promise<ResolvedChannel | null> {
  if (!channelId || channelId === "everyone") {
    const everyone = await ensureEveryoneChannel(actor.companyId);
    const users = await prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    return {
      id: everyone.id,
      isEveryone: true,
      name: null,
      createdById: null,
      memberIds: users.map((u) => u.id),
    };
  }
  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, companyId: actor.companyId },
    include: { members: { select: { userId: true } } },
  });
  if (!channel) return null;
  if (channel.isEveryone) return resolveChannel(actor, "everyone");
  if (!channel.members.some((m) => m.userId === actor.id)) return null;
  return {
    id: channel.id,
    isEveryone: false,
    name: channel.name,
    createdById: channel.createdById,
    memberIds: channel.members.map((m) => m.userId),
  };
}

/** Create (or reuse) a conversation. One other member = DM (deduped against
 *  an existing one); more = group chat, named. */
export async function createChannel(
  actor: Actor,
  memberIds: string[],
  name: string | null
): Promise<{ id: string } | { error: string }> {
  const others = [...new Set(memberIds.filter((id) => id && id !== actor.id))];
  if (others.length === 0) return { error: "Pick at least one teammate." };
  if (others.length > 30) return { error: "That's too many people for one chat." };
  const valid = await prisma.user.findMany({
    where: { id: { in: others }, companyId: actor.companyId, isActive: true },
    select: { id: true },
  });
  if (valid.length !== others.length) {
    return { error: "Someone on that list isn't available." };
  }

  const allMembers = [actor.id, ...others];

  if (others.length === 1) {
    // DM — reuse the existing one with exactly these two members
    const existing = await prisma.chatChannel.findFirst({
      where: {
        companyId: actor.companyId,
        isEveryone: false,
        name: null,
        AND: allMembers.map((userId) => ({ members: { some: { userId } } })),
      },
      include: { _count: { select: { members: true } } },
    });
    if (existing && existing._count.members === 2) return { id: existing.id };
  }

  const channel = await prisma.chatChannel.create({
    data: {
      companyId: actor.companyId,
      isEveryone: false,
      name: others.length > 1 ? (name?.trim() ? name.trim().slice(0, 60) : null) : null,
      createdById: actor.id,
      members: { create: allMembers.map((userId) => ({ userId })) },
    },
  });
  return { id: channel.id };
}

export type ChannelSummary = {
  id: string;
  kind: "everyone" | "dm" | "group";
  name: string; // display name resolved for the actor
  memberIds: string[];
  memberCount: number;
  unread: number;
  lastMessage: { body: string; userName: string; at: string; deleted: boolean } | null;
};

/**
 * Unread counts for many channels in ONE query. Each channel has its own
 * "seen" watermark, so the filter is an OR of (channel, since) pairs and the
 * result is grouped — replaces a count() per channel on every chat poll and
 * every nav-count fetch.
 */
async function unreadByChannel(
  actorId: string,
  channels: { id: string; since: Date | null }[]
): Promise<Map<string, number>> {
  if (channels.length === 0) return new Map();
  const rows = await prisma.teamMessage.groupBy({
    by: ["channelId"],
    where: {
      deletedAt: null,
      userId: { not: actorId },
      OR: channels.map((c) => ({
        channelId: c.id,
        ...(c.since ? { createdAt: { gt: c.since } } : {}),
      })),
    },
    _count: { _all: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r.channelId) out.set(r.channelId, r._count._all);
  return out;
}

/** Latest message per channel in ONE query (Postgres DISTINCT ON). */
async function lastMessageByChannel(
  channelIds: string[]
): Promise<Map<string, ChannelSummary["lastMessage"]>> {
  const out = new Map<string, ChannelSummary["lastMessage"]>();
  if (channelIds.length === 0) return out;
  const rows = await prisma.$queryRaw<
    { channelId: string; body: string; deletedAt: Date | null; createdAt: Date; userName: string }[]
  >`
    SELECT DISTINCT ON (m."channelId")
      m."channelId", m.body, m."deletedAt", m."createdAt", u.name AS "userName"
    FROM "TeamMessage" m
    JOIN "User" u ON u.id = m."userId"
    WHERE m."channelId" IN (${Prisma.join(channelIds)})
    ORDER BY m."channelId", m."createdAt" DESC`;
  for (const r of rows) {
    out.set(r.channelId, {
      body: r.deletedAt ? "" : r.body.slice(0, 120),
      userName: r.userName,
      at: r.createdAt.toISOString(),
      deleted: !!r.deletedAt,
    });
  }
  return out;
}

/** The actor's thread list: Everyone first, then their DMs/groups by recency. */
export async function listChannels(actor: Actor): Promise<ChannelSummary[]> {
  const everyone = await ensureEveryoneChannel(actor.companyId);
  const [me, users, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.id }, select: { chatLastSeenAt: true } }),
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.chatChannelMember.findMany({
      where: { userId: actor.id, channel: { companyId: actor.companyId, isEveryone: false } },
      select: {
        lastSeenAt: true,
        channel: {
          select: {
            id: true,
            name: true,
            lastMessageAt: true,
            members: { select: { userId: true, user: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  // Two queries for the whole list, however many threads the actor is in
  const watermarks = [
    { id: everyone.id, since: me?.chatLastSeenAt ?? null },
    ...memberships.map((ms) => ({ id: ms.channel.id, since: ms.lastSeenAt })),
  ];
  const [unread, last] = await Promise.all([
    unreadByChannel(actor.id, watermarks),
    lastMessageByChannel(watermarks.map((w) => w.id)),
  ]);

  const out: ChannelSummary[] = [];
  out.push({
    id: everyone.id,
    kind: "everyone",
    name: "Everyone",
    memberIds: users.map((u) => u.id),
    memberCount: users.length,
    unread: unread.get(everyone.id) ?? 0,
    lastMessage: last.get(everyone.id) ?? null,
  });

  const rest = memberships.map((ms) => {
    const c = ms.channel;
    const others = c.members.filter((m) => m.userId !== actor.id);
    const isGroup = c.members.length > 2 || !!c.name;
    const display = c.name
      ? c.name
      : isGroup
        ? others.map((o) => (nameById.get(o.userId) ?? o.user.name).split(" ")[0]).join(", ")
        : (others[0] ? nameById.get(others[0].userId) ?? others[0].user.name : "Chat");
    return {
      id: c.id,
      kind: (isGroup ? "group" : "dm") as "group" | "dm",
      name: display,
      memberIds: c.members.map((m) => m.userId),
      memberCount: c.members.length,
      unread: unread.get(c.id) ?? 0,
      lastMessage: last.get(c.id) ?? null,
      _sort: c.lastMessageAt?.getTime() ?? 0,
    };
  });
  rest.sort((a, b) => b._sort - a._sort);
  out.push(...rest.map(({ _sort, ...r }) => r));
  return out;
}

// ── Typing indicators ────────────────────────────────────────────────────────
// Ephemeral by design: an in-memory map (like the prisma singleton) that a
// poll reads back. Zero database writes; entries expire after a few seconds.

// Slightly longer than the poll interval so a "typing…" pill survives one
// missed tick; the client pings every 2.5 s while keys are moving.
const TYPING_TTL_MS = 9000;

type TypingMap = Map<string, Map<string, number>>; // channelId -> userId -> stamp

const globalForTyping = globalThis as unknown as { __chatTyping?: TypingMap };
const typing: TypingMap = (globalForTyping.__chatTyping ??= new Map());

// Expired entries used to be reaped only when a channel was READ, so a
// channel typed in once and never polled again leaked its entry for the
// life of the process. Sweep the whole map on write, at most once a minute.
let lastTypingSweep = 0;
function sweepTyping(now: number) {
  if (now - lastTypingSweep < 60_000) return;
  lastTypingSweep = now;
  for (const [channelId, users] of typing) {
    for (const [userId, stamp] of users) {
      if (now - stamp > TYPING_TTL_MS) users.delete(userId);
    }
    if (users.size === 0) typing.delete(channelId);
  }
}

export function markTyping(channelId: string, actorId: string): void {
  const now = Date.now();
  sweepTyping(now);
  const users = typing.get(channelId) ?? new Map<string, number>();
  users.set(actorId, now);
  typing.set(channelId, users);
}

export function activeTypers(channelId: string, actorId: string): string[] {
  const users = typing.get(channelId);
  if (!users) return [];
  const now = Date.now();
  const out: string[] = [];
  for (const [userId, stamp] of users) {
    if (now - stamp > TYPING_TTL_MS) users.delete(userId);
    else if (userId !== actorId) out.push(userId);
  }
  if (users.size === 0) typing.delete(channelId);
  return out;
}

// ── Read markers ─────────────────────────────────────────────────────────────

export async function markChannelSeen(actorId: string, channel: ResolvedChannel): Promise<void> {
  const now = new Date();
  if (channel.isEveryone) {
    await prisma.user.update({ where: { id: actorId }, data: { chatLastSeenAt: now } });
    return;
  }
  await prisma.chatChannelMember.updateMany({
    where: { channelId: channel.id, userId: actorId },
    data: { lastSeenAt: now },
  });
}

/** Total unread across every channel — the nav badge. */
export async function totalUnread(actor: Actor): Promise<number> {
  const everyone = await ensureEveryoneChannel(actor.companyId);
  const [me, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.id }, select: { chatLastSeenAt: true } }),
    prisma.chatChannelMember.findMany({
      where: { userId: actor.id, channel: { companyId: actor.companyId, isEveryone: false } },
      select: { channelId: true, lastSeenAt: true },
    }),
  ]);
  // One grouped query, not one count per channel
  const unread = await unreadByChannel(actor.id, [
    { id: everyone.id, since: me?.chatLastSeenAt ?? null },
    ...memberships.map((ms) => ({ id: ms.channelId, since: ms.lastSeenAt })),
  ]);
  let total = 0;
  for (const n of unread.values()) total += n;
  return total;
}
