/**
 * Web push via VAPID. Env-gated like email: without VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY every send is a silent no-op, so send points can ship
 * before keys exist in an environment.
 *
 * Delivery targets are team USERS (not clients) — each PushSubscription row
 * is one browser/device a user turned notifications on for. Dead endpoints
 * (push service answers 404/410) are pruned on send.
 */

import webpush from "web-push";
import { prisma } from "@/lib/db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const CONTACT = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? "notifications@streamflaremedia.com";

const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(`mailto:${CONTACT}`, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

/** The public key the browser needs to subscribe; null until keys are set. */
export const pushPublicKey = configured ? VAPID_PUBLIC_KEY! : null;

export interface PushPayload {
  title: string;
  body?: string;
  /** In-app path the notification opens (e.g. "/app/requests/abc"). */
  url?: string;
  /** Same tag = later notifications replace earlier ones (per chat thread). */
  tag?: string;
}

/**
 * Send a push to every device each of these users has subscribed. Never
 * throws — push is best-effort on top of the email/in-app paths.
 */
export async function notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!configured || userIds.length === 0) return;
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    if (subs.length === 0) return;

    const json = JSON.stringify(payload);
    const dead: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            json,
            { TTL: 3600, urgency: "normal" }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(sub.id);
          else console.error("[push] send failed:", status ?? err);
        }
      })
    );
    if (dead.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    }
  } catch (err) {
    console.error("[push] notify threw:", err);
  }
}

export async function notifyUser(userId: string, payload: PushPayload): Promise<void> {
  return notifyUsers([userId], payload);
}

/** Active OWNER + ADMIN user ids — the "managers" audience for approvals/money. */
export async function companyManagerIds(companyId: string): Promise<string[]> {
  const managers = await prisma.user.findMany({
    where: { companyId, role: { in: ["OWNER", "ADMIN"] }, isActive: true },
    select: { id: true },
  });
  return managers.map((m) => m.id);
}

/**
 * Who hears about a new lead/request: active owners plus the company's
 * preset lead assignee (and optionally the contact's assigned salesperson).
 */
export async function requestNotifyUserIds(
  companyId: string,
  extraUserId?: string | null
): Promise<string[]> {
  const [owners, company] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, role: "OWNER", isActive: true },
      select: { id: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultLeadUserId: true },
    }),
  ]);
  const ids = new Set(owners.map((o) => o.id));
  const candidates = [company?.defaultLeadUserId, extraUserId].filter(
    (id): id is string => !!id && !ids.has(id)
  );
  if (candidates.length > 0) {
    const active = await prisma.user.findMany({
      where: { id: { in: candidates }, companyId, isActive: true },
      select: { id: true },
    });
    for (const u of active) ids.add(u.id);
  }
  return [...ids];
}
