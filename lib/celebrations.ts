import { prisma } from "@/lib/db";
import type { CelebrationKind } from "@prisma/client";

// Only celebrate moments fresh enough to still feel like news — without this,
// switching to per-user tracking would confetti every historical paid invoice
// and approved quote the first time each teammate opened it.
export const CELEBRATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when this user hasn't seen the moment yet and it happened within the
 * freshness window. The page passes the result to <Celebration>, which fires
 * the confetti and stamps the seen row via the matching celebrated endpoint.
 */
export async function shouldCelebrate(
  userId: string,
  kind: CelebrationKind,
  entityId: string,
  happenedAt: Date | null
): Promise<boolean> {
  if (!happenedAt) return false;
  if (Date.now() - happenedAt.getTime() > CELEBRATION_WINDOW_MS) return false;
  const seen = await prisma.celebrationSeen.findUnique({
    where: { userId_kind_entityId: { userId, kind, entityId } },
    select: { id: true },
  });
  return !seen;
}
