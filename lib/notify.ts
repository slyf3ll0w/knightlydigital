import { prisma } from "@/lib/db";

/**
 * Where company-facing notifications (new requests, client messages,
 * bookings…) should go by email — or null when no email should be sent.
 *
 * The address is Company.email, a Settings field many companies never fill
 * in, else the oldest owner's login email — so the notification is never
 * dropped on the floor for want of an inbox.
 *
 * Every caller of this also sends a PUSH to the owners for the same event.
 * When the inbox belongs to a member of this company who has push on for one
 * of their devices, the email is the same news twice, so it is skipped
 * unless they asked for it (User.emailAlerts, My Profile; David 2026-09-29:
 * "make the emails off by default when push is on"). A shared inbox nobody
 * signs in with, or a member with no push device, still gets the email.
 */
export async function companyNotifyAddress(
  companyId: string,
  companyEmail: string | null | undefined
): Promise<string | null> {
  const address = companyEmail || (await oldestOwnerEmail(companyId));
  if (!address) return null;
  return (await emailWanted(companyId, address)) ? address : null;
}

async function oldestOwnerEmail(companyId: string): Promise<string | null> {
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return owner?.email ?? null;
}

/**
 * Should the notification email go to `address`? Pure policy over the
 * address's owner: not a member → yes; member said always/never → that;
 * otherwise (automatic) only while none of their devices has push on.
 * Exported for the profile card's "what happens now" line.
 */
export async function emailWanted(companyId: string, address: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { companyId, isActive: true, email: { equals: address, mode: "insensitive" } },
    select: { id: true, accountId: true, emailAlerts: true },
  });
  if (!user) return true;
  if (user.emailAlerts !== null) return user.emailAlerts;
  return !(await hasPushDevice(user.id, user.accountId));
}

/**
 * Does this person have push on anywhere? Devices are subscribed under
 * whichever membership was active at the time (lib/push.ts delivers to the
 * whole account), so every row on the account counts. VoIP tokens only ring
 * the phone and never carry a notification.
 */
export async function hasPushDevice(userId: string, accountId: string | null): Promise<boolean> {
  const ids = accountId
    ? (await prisma.user.findMany({ where: { accountId }, select: { id: true } })).map((u) => u.id)
    : [userId];
  const n = await prisma.pushSubscription.count({
    where: { userId: { in: ids.length ? ids : [userId] }, platform: { not: "ios-voip" } },
  });
  return n > 0;
}
