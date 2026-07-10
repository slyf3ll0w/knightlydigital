/**
 * Push notifications, env-gated like email so send points ship before keys
 * exist in an environment:
 * - Web subscriptions send via VAPID web push (VAPID_PUBLIC_KEY/_PRIVATE_KEY).
 * - Native (ios/android) subscriptions send via FCM HTTP v1
 *   (FIREBASE_SERVICE_ACCOUNT = the service-account JSON, raw or base64).
 *
 * Delivery targets are team USERS (not clients) — each PushSubscription row
 * is one browser/device a user turned notifications on for. Dead endpoints
 * (push service answers 404/410, or FCM says UNREGISTERED) are pruned on send.
 */

import crypto from "crypto";
import webpush from "web-push";
import { prisma } from "@/lib/db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const CONTACT = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? "notifications@streamflaremedia.com";

const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(`mailto:${CONTACT}`, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

// ─── FCM (native apps) ───────────────────────────────────────────────────────

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed.project_id && parsed.client_email && parsed.private_key) return parsed;
  } catch {
    /* fall through */
  }
  console.error("[push] FIREBASE_SERVICE_ACCOUNT is set but not valid service-account JSON");
  return null;
}

const fcmAccount = loadServiceAccount();

let fcmToken: { value: string; expiresAt: number } | null = null;

/** OAuth2 access token for FCM via signed JWT — no SDK dependency needed. */
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.expiresAt > Date.now() + 60_000) return fcmToken.value;

  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key);
  const assertion = `${unsigned}.${signature.toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/** Send one FCM message; "dead" means the device token is gone and the row should be pruned. */
async function sendFcm(
  sa: ServiceAccount,
  deviceToken: string,
  payload: PushPayload
): Promise<"ok" | "dead" | "error"> {
  const accessToken = await fcmAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: payload.title, ...(payload.body ? { body: payload.body } : {}) },
          // data.url is read by the notification-tap handler in the shell
          data: { ...(payload.url ? { url: payload.url } : {}), ...(payload.tag ? { tag: payload.tag } : {}) },
          ...(payload.tag
            ? {
                android: { notification: { tag: payload.tag } },
                apns: { headers: { "apns-collapse-id": payload.tag.slice(0, 64) } },
              }
            : {}),
        },
      }),
    }
  );
  if (res.ok) return "ok";
  // 404 = UNREGISTERED (token invalid/expired). 400 INVALID_ARGUMENT on a
  // well-formed request also means a garbage token.
  if (res.status === 404) return "dead";
  console.error("[push] FCM send failed:", res.status, (await res.text()).slice(0, 300));
  return "error";
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
  if ((!configured && !fcmAccount) || userIds.length === 0) return;
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
          if (sub.platform === "web") {
            if (!configured || !sub.p256dh || !sub.auth) return;
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              json,
              { TTL: 3600, urgency: "normal" }
            );
          } else {
            if (!fcmAccount) return;
            if ((await sendFcm(fcmAccount, sub.endpoint, payload)) === "dead") dead.push(sub.id);
          }
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
