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
  // Settings → Business Info → "Notifications inbox" overrides the business
  // email for the company's OWN alerts (David 2026-10-02: a personal login
  // for WorkBench, a work address for clients). Looked up here rather than
  // threaded through the eight callers.
  const override = await prisma.company
    .findUnique({ where: { id: companyId }, select: { notifyEmail: true } })
    .then((c) => c?.notifyEmail?.trim() || null)
    .catch(() => null);
  const address = override || companyEmail || (await oldestOwnerEmail(companyId));
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
 * Should the notification email go to `address`? Pure policy over whoever
 * reads that inbox: the member whose login it is — else the company's
 * oldest owner, because a Settings "company email" that isn't anyone's
 * login (info@…, contact@…) is in practice the owner's own forwarding
 * inbox (David 2026-10-01: "still getting those notification emails
 * despite having push" — his company inbox was never his login, so the
 * 2026-09-29 rule never applied to it). That person said always/never →
 * that; otherwise (automatic) only while none of their devices has push on.
 * Nobody to ask (no owner at all) → send. Exported for the profile card's
 * "what happens now" line.
 */
export async function emailWanted(companyId: string, address: string): Promise<boolean> {
  const member = await prisma.user.findFirst({
    where: { companyId, isActive: true, email: { equals: address, mode: "insensitive" } },
    select: { id: true, accountId: true, emailAlerts: true },
  });
  const reader =
    member ??
    (await prisma.user.findFirst({
      where: { companyId, role: "OWNER", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, accountId: true, emailAlerts: true },
    }));
  if (!reader) return true;
  if (reader.emailAlerts !== null) return reader.emailAlerts;
  return !(await hasPushDevice(reader.id, reader.accountId));
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
