/**
 * One-shot migration to chat channels: per company, ensure the Everyone
 * channel and attach legacy broadcast messages (recipientId null) to it;
 * turn each legacy DM pair with history into a 2-member DM channel, carrying
 * ChatThreadState read markers over. Idempotent — safe to re-run.
 * Run: DATABASE_URL=... node scripts/migrate-chat-channels.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const companies = await prisma.teamMessage.groupBy({ by: ["companyId"] });
for (const { companyId } of companies) {
  // Everyone channel + legacy broadcasts
  let everyone = await prisma.chatChannel.findFirst({ where: { companyId, isEveryone: true } });
  if (!everyone) {
    everyone = await prisma.chatChannel.create({ data: { companyId, isEveryone: true } });
  }
  const swept = await prisma.teamMessage.updateMany({
    where: { companyId, channelId: null, recipientId: null },
    data: { channelId: everyone.id },
  });
  const lastEveryone = await prisma.teamMessage.findFirst({
    where: { channelId: everyone.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastEveryone) {
    await prisma.chatChannel.update({
      where: { id: everyone.id },
      data: { lastMessageAt: lastEveryone.createdAt },
    });
  }

  // Legacy DM pairs
  const dmMsgs = await prisma.teamMessage.findMany({
    where: { companyId, channelId: null, recipientId: { not: null } },
    select: { id: true, userId: true, recipientId: true, createdAt: true },
  });
  const pairs = new Map(); // "a:b" sorted -> message ids + last stamp
  for (const m of dmMsgs) {
    const key = [m.userId, m.recipientId].sort().join(":");
    const entry = pairs.get(key) ?? { ids: [], last: m.createdAt, users: key.split(":") };
    entry.ids.push(m.id);
    if (m.createdAt > entry.last) entry.last = m.createdAt;
    pairs.set(key, entry);
  }
  for (const { ids, last, users } of pairs.values()) {
    // Reuse an existing DM channel for this pair if one exists
    let channel = await prisma.chatChannel.findFirst({
      where: {
        companyId,
        isEveryone: false,
        name: null,
        AND: users.map((userId) => ({ members: { some: { userId } } })),
      },
      include: { _count: { select: { members: true } } },
    });
    if (channel && channel._count.members !== 2) channel = null;
    if (!channel) {
      // Read markers: each user's ChatThreadState for the peer
      const states = await prisma.chatThreadState.findMany({
        where: {
          OR: [
            { userId: users[0], threadKey: users[1] },
            { userId: users[1], threadKey: users[0] },
          ],
        },
      });
      const seenFor = (u) => states.find((s) => s.userId === u)?.lastSeenAt ?? null;
      channel = await prisma.chatChannel.create({
        data: {
          companyId,
          isEveryone: false,
          lastMessageAt: last,
          members: {
            create: users.map((userId) => ({ userId, lastSeenAt: seenFor(userId) })),
          },
        },
      });
    }
    await prisma.teamMessage.updateMany({
      where: { id: { in: ids } },
      data: { channelId: channel.id },
    });
  }
  console.log(
    `company ${companyId}: swept ${swept.count} broadcasts, ${pairs.size} DM pair(s)`
  );
}
await prisma.$disconnect();
console.log("done");
