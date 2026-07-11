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
  await prisma.teamMessage.updateMany({
    where: { companyId, channelId: null, recipientId: null },
    data: { channelId: channel.id },
  });
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

  const lastMessageFor = async (channelId: string) => {
    const m = await prisma.teamMessage.findFirst({
      where: { channelId },
      orderBy: { createdAt: "desc" },
      select: { body: true, deletedAt: true, createdAt: true, user: { select: { name: true } } },
    });
    return m
      ? {
          body: m.deletedAt ? "" : m.body.slice(0, 120),
          userName: m.user.name,
          at: m.createdAt.toISOString(),
          deleted: !!m.deletedAt,
        }
      : null;
  };

  const unreadCount = (channelId: string, since: Date | null) =>
    prisma.teamMessage.count({
      where: {
        channelId,
        deletedAt: null,
        userId: { not: actor.id },
        ...(since ? { createdAt: { gt: since } } : {}),
      },
    });

  const out: ChannelSummary[] = [];
  out.push({
    id: everyone.id,
    kind: "everyone",
    name: "Everyone",
    memberIds: users.map((u) => u.id),
    memberCount: users.length,
    unread: await unreadCount(everyone.id, me?.chatLastSeenAt ?? null),
    lastMessage: await lastMessageFor(everyone.id),
  });

  const rest = await Promise.all(
    memberships.map(async (ms) => {
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
        unread: await unreadCount(c.id, ms.lastSeenAt),
        lastMessage: await lastMessageFor(c.id),
        _sort: c.lastMessageAt?.getTime() ?? 0,
      };
    })
  );
  rest.sort((a, b) => b._sort - a._sort);
  out.push(...rest.map(({ _sort, ...r }) => r));
  return out;
}

// ── Typing indicators ────────────────────────────────────────────────────────
// Ephemeral by design: an in-memory map (like the prisma singleton) that a
// poll reads back. Zero database writes; entries expire after a few seconds.

const TYPING_TTL_MS = 5000;

type TypingMap = Map<string, Map<string, number>>; // channelId -> userId -> stamp

const globalForTyping = globalThis as unknown as { __chatTyping?: TypingMap };
const typing: TypingMap = (globalForTyping.__chatTyping ??= new Map());

export function markTyping(channelId: string, actorId: string): void {
  const users = typing.get(channelId) ?? new Map<string, number>();
  users.set(actorId, Date.now());
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
  const counts = await Promise.all([
    prisma.teamMessage.count({
      where: {
        channelId: everyone.id,
        deletedAt: null,
        userId: { not: actor.id },
        ...(me?.chatLastSeenAt ? { createdAt: { gt: me.chatLastSeenAt } } : {}),
      },
    }),
    ...memberships.map((ms) =>
      prisma.teamMessage.count({
        where: {
          channelId: ms.channelId,
          deletedAt: null,
          userId: { not: actor.id },
          ...(ms.lastSeenAt ? { createdAt: { gt: ms.lastSeenAt } } : {}),
        },
      })
    ),
  ]);
  return counts.reduce((s, n) => s + n, 0);
}
