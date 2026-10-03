import { prisma } from "@/lib/db";
import { ONLINE_WINDOW_MS } from "@/lib/presence";
import { isAndroidShellUserAgent, isIosShellUserAgent } from "@/lib/sign-in-options";

/**
 * One active device per login (David, 2026-10-02).
 *
 * WorkBench prices by the seat, so a crew sharing one owner login is the
 * leak to close. There is no session table (NextAuth runs on JWTs), so the
 * rule rides the presence heartbeat instead: every browser or app install
 * carries a random `wb_device` cookie (set by /api/app/presence on its first
 * beat), and the User row remembers which device beat last
 * (activeDeviceId / activeDeviceAt / activeDeviceLabel).
 *
 *   - A beat from the holding device, or from any device once the holder
 *     has been quiet for the online window (3 min — beats only come from a
 *     VISIBLE page, so a backgrounded tab or pocketed phone lets go), keeps
 *     or takes the lock.
 *   - A beat from another device while the holder is active is turned
 *     away: the route answers `busy` and components/PresenceBeacon.tsx covers
 *     the app with "in use on <label>" and a "Use it here" button, which
 *     beats again with `takeover: true` and claims the lock outright. The
 *     old device learns on its next beat (≤ 20 s, or its next touch) and gets the same screen.
 *
 * One person moving phone → desktop → phone never notices (the previous
 * device is idle or takes one tap). Two people at once bounce each other
 * every minute, which is the point. API routes are NOT gated: this is a
 * front-door rule, not a security boundary, and a queued offline write must
 * never be lost to it.
 *
 * Off switch: ONE_ACTIVE_DEVICE=0 on Railway makes every beat a plain
 * presence stamp again. Exempt regardless: superadmin rows (they never hold
 * a tenant session anyway) and the e2e harness owners — Playwright gives
 * every test a fresh cookie jar, so the suite would lock itself out.
 */

export const DEVICE_COOKIE = "wb_device";
/** Chrome caps cookie lifetimes at 400 days; a device that goes quiet that long simply gets a new id. */
export const DEVICE_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
/** The holding device re-stamps activeDeviceAt at most this often. */
export const HOLD_REFRESH_MS = 30 * 1000;
/** A holder quiet for longer than this has let go (same window as the green dot). */
export const HOLD_WINDOW_MS = ONLINE_WINDOW_MS;

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cookie value we minted (randomUUID), not something hand-typed. */
export function isDeviceId(value: string | null | undefined): value is string {
  return Boolean(value && DEVICE_ID_RE.test(value));
}

/** ONE_ACTIVE_DEVICE=0 turns the rule off without a deploy. */
export function deviceRuleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ONE_ACTIVE_DEVICE !== "0";
}

/** The e2e harness owners (e2e/env.ts) and anyone named in ONE_ACTIVE_DEVICE_EXEMPT (comma-separated). */
export function exemptEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (/^e2e-[^@]+@workbenchfsm\.com$/.test(e)) return true;
  const extra = (env.ONE_ACTIVE_DEVICE_EXEMPT ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(e);
}

export type DeviceHold = {
  activeDeviceId: string | null;
  activeDeviceAt: Date | null;
  activeDeviceLabel: string | null;
};

export type DeviceDecision =
  /** This device holds the lock; `refresh` = the stamp is old enough to rewrite. */
  | { kind: "held"; refresh: boolean }
  /** Nobody active holds it — take it. */
  | { kind: "claim" }
  /** Another device is active right now. */
  | { kind: "busy"; device: string; since: Date };

/**
 * Pure decision for one beat. `now` and the window are parameters so the
 * unit test (scripts/test-active-device.ts) can walk the clock.
 */
export function decideDevice(hold: DeviceHold, deviceId: string, now: Date = new Date(), windowMs = HOLD_WINDOW_MS): DeviceDecision {
  const at = hold.activeDeviceAt?.getTime() ?? 0;
  if (!hold.activeDeviceId || !hold.activeDeviceAt) return { kind: "claim" };
  if (hold.activeDeviceId === deviceId) return { kind: "held", refresh: now.getTime() - at >= HOLD_REFRESH_MS };
  if (now.getTime() - at > windowMs) return { kind: "claim" };
  return { kind: "busy", device: hold.activeDeviceLabel || "another device", since: hold.activeDeviceAt };
}

/**
 * "the iPhone app", "the Android app", "Chrome on Windows", "Safari on an
 * iPhone" — what the turned-away screen names. Deliberately coarse: it has
 * to make sense to the person reading it, not identify a machine.
 */
export function deviceLabel(ua: string | null | undefined): string {
  if (isIosShellUserAgent(ua)) return "the iPhone app";
  if (isAndroidShellUserAgent(ua)) return "the Android app";
  const s = ua ?? "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\//.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "a browser";
  const os = /iPhone/.test(s)
    ? "an iPhone"
    : /iPad/.test(s)
      ? "an iPad"
      : /Android/.test(s)
        ? "an Android phone"
        : /Windows/.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(s)
            ? "a Mac"
            : /CrOS/.test(s)
              ? "a Chromebook"
              : /Linux/.test(s)
                ? "Linux"
                : null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Apply one beat: read the hold, decide, and write when the decision says
 * so. The claim is a conditional update (still unheld, still ours, or
 * still stale) so two devices beating in the same instant can't both win —
 * the loser re-reads and is told who did. `takeover` writes unconditionally.
 */
export async function claimDevice(
  userId: string,
  deviceId: string,
  ua: string | null | undefined,
  takeover: boolean,
  now: Date = new Date()
): Promise<DeviceDecision> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, activeDeviceId: true, activeDeviceAt: true, activeDeviceLabel: true },
  });
  if (!row || row.role === "SUPERADMIN" || exemptEmail(row.email)) return { kind: "claim" };

  const data = { activeDeviceId: deviceId, activeDeviceAt: now, activeDeviceLabel: deviceLabel(ua) };
  if (takeover) {
    await prisma.user.update({ where: { id: userId }, data, select: { id: true } });
    return { kind: "claim" };
  }

  const decision = decideDevice(row, deviceId, now);
  if (decision.kind === "busy") return decision;
  if (decision.kind === "held" && !decision.refresh) return decision;

  const res = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ activeDeviceId: null }, { activeDeviceId: deviceId }, { activeDeviceAt: { lt: new Date(now.getTime() - HOLD_WINDOW_MS) } }],
    },
    data,
  });
  if (res.count > 0) return decision;

  // Lost the race: someone else claimed between our read and write.
  const again = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeDeviceId: true, activeDeviceAt: true, activeDeviceLabel: true },
  });
  return again ? decideDevice(again, deviceId, now) : { kind: "claim" };
}

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_S,
  };
}
