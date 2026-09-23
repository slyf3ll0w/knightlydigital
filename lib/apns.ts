import http2 from "http2";
import { createPrivateKey, sign as cryptoSign, type KeyObject } from "crypto";

/**
 * APNs, direct — for the one push FCM cannot carry: the VoIP push that
 * rings the iPhone app when it is closed (PushKit + CallKit, tier 3 of
 * docs/plans/business-line-voice-2026-09-18.md). Ordinary notifications
 * keep going through Firebase (lib/push.ts).
 *
 * Token-based auth: an ES256 JWT signed with an APNs key from the developer
 * portal, reused for ≤ 50 minutes (Apple wants a refresh within the hour
 * and no more often than every 20). One key can carry both APNs and Sign
 * in with Apple, so the sign-in key is the fallback when no APNs-specific
 * one is set:
 *
 *   APPLE_TEAM_ID
 *   APPLE_APNS_KEY_ID        (falls back to APPLE_SIGNIN_KEY_ID)
 *   APPLE_APNS_PRIVATE_KEY   (falls back to APPLE_SIGNIN_PRIVATE_KEY; PEM
 *                             with literal "\n", or base64 of the .p8)
 *
 * Environment: a build signed for the App Store / TestFlight registers a
 * production token, an Xcode build on a cable registers a sandbox one.
 * APNs answers BadDeviceToken when the two don't match, so a send tries
 * production first and falls through to sandbox — and remembers which
 * gateway a token belongs to.
 */

const VOIP_TOPIC = "com.streamflaire.hub.voip";
const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;
type Gateway = keyof typeof HOSTS;

function keyId(): string | undefined {
  return process.env.APPLE_APNS_KEY_ID || process.env.APPLE_SIGNIN_KEY_ID;
}
function keyPem(): string | undefined {
  const raw = (process.env.APPLE_APNS_PRIVATE_KEY || process.env.APPLE_SIGNIN_PRIVATE_KEY || "").trim();
  if (!raw) return undefined;
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64").toString("utf8");
}

export function apnsConfigured(): boolean {
  return Boolean(process.env.APPLE_TEAM_ID && keyId() && keyPem());
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let key: KeyObject | null = null;
let jwt: { value: string; iat: number } | null = null;

function providerToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (jwt && now - jwt.iat < 50 * 60) return jwt.value;
  const pem = keyPem();
  const kid = keyId();
  const teamId = process.env.APPLE_TEAM_ID;
  if (!pem || !kid || !teamId) throw new Error("APNs is not configured");
  key ??= createPrivateKey({ key: pem, format: "pem" });
  const header = b64url(JSON.stringify({ alg: "ES256", kid }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const input = `${header}.${payload}`;
  const sig = cryptoSign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  jwt = { value: `${input}.${b64url(sig)}`, iat: now };
  return jwt.value;
}

/** Which gateway each token answered on, so the second call doesn't probe again. */
const gatewayFor = new Map<string, Gateway>();

type ApnsReply = { status: number; reason: string | null };

function post(gateway: Gateway, path: string, headers: Record<string, string>, body: string): Promise<ApnsReply> {
  return new Promise((resolve, reject) => {
    const session = http2.connect(HOSTS[gateway]);
    const finish = (r: ApnsReply | Error) => {
      session.close();
      if (r instanceof Error) reject(r);
      else resolve(r);
    };
    session.on("error", finish);
    const req = session.request({ ":method": "POST", ":path": path, ...headers });
    let status = 0;
    let data = "";
    req.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      let reason: string | null = null;
      try {
        reason = data ? ((JSON.parse(data) as { reason?: string }).reason ?? null) : null;
      } catch {
        reason = null;
      }
      finish({ status, reason });
    });
    req.on("error", finish);
    req.setTimeout(8000, () => finish(new Error("APNs timed out")));
    req.end(body);
  });
}

export type VoipPushResult = "ok" | "dead" | "error";

/**
 * Ring a device. The payload is what the app's PushKit handler reads:
 * `{ callId, label, number }` — it must report a call to CallKit the moment
 * this lands (Apple throttles apps that receive a VoIP push and don't), so
 * the expiry is short: a push that can't be delivered within `ttlS` is
 * dropped by Apple rather than ringing a call that is long over.
 */
export async function sendVoipPush(
  deviceToken: string,
  payload: Record<string, unknown>,
  ttlS = 30
): Promise<VoipPushResult> {
  if (!apnsConfigured()) return "error";
  const body = JSON.stringify({ aps: { "content-available": 1 }, ...payload });
  const headers = {
    authorization: `bearer ${providerToken()}`,
    "apns-topic": VOIP_TOPIC,
    "apns-push-type": "voip",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(Date.now() / 1000) + ttlS),
    "content-type": "application/json",
  };
  const path = `/3/device/${deviceToken}`;
  const known = gatewayFor.get(deviceToken);
  const order: Gateway[] = known ? [known] : ["production", "sandbox"];

  for (const gateway of order) {
    let reply: ApnsReply;
    try {
      reply = await post(gateway, path, headers, body);
    } catch (err) {
      console.error(`[apns] ${gateway} send failed:`, err instanceof Error ? err.message : err);
      return "error";
    }
    if (reply.status === 200) {
      gatewayFor.set(deviceToken, gateway);
      return "ok";
    }
    if (reply.status === 410 || reply.reason === "Unregistered") {
      gatewayFor.delete(deviceToken);
      return "dead";
    }
    // Wrong environment for this token: try the other gateway (once).
    if (reply.status === 400 && reply.reason === "BadDeviceToken") {
      gatewayFor.delete(deviceToken);
      continue;
    }
    if (reply.status === 403 && reply.reason === "ExpiredProviderToken") jwt = null;
    console.error(`[apns] ${gateway} answered ${reply.status} ${reply.reason ?? ""}`);
    return "error";
  }
  // BadDeviceToken on both gateways: the token is garbage.
  return "dead";
}
