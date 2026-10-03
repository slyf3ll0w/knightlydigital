import { prisma } from "@/lib/db";

/**
 * Who is using WorkBench right now, for the platform console.
 *
 * There is no session table (NextAuth runs on JWTs). Since 2026-10-02 the
 * stamp comes from an explicit heartbeat: components/PresenceBeacon.tsx
 * (platform layout) posts /api/app/presence every 20 s while the page is
 * VISIBLE, and once more the moment it comes back to the front. Hidden tabs
 * and a phone app in the background send nothing, so a forgotten tab no
 * longer keeps someone "online" (the old stamp rode every request through
 * loadActor, and the shell's counts poll keeps running while hidden).
 *
 * Presence is per membership (User row), and a person with one login at
 * several companies is online at ONE of them: the membership they used most
 * recently (`loadElsewhere`). Switching companies stamps the new membership
 * on its first request, so the old company drops them at once.
 *
 * Which device: the native shell appends `StreamflaireHubShell` to its user
 * agent (capacitor.config.ts), so iOS / Android / web is a UA sniff — no
 * store build needed.
 */

/** Seen within this window = the green dot. */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;
/** Minimum gap between two stamps for the same user (per server process). */
const TOUCH_INTERVAL_MS = 30 * 1000;

export type SeenVia = "web" | "ios" | "android";

/** "iPhone app" / "Android app" / "Web" for a stored lastSeenVia. */
export function viaLabel(via: string | null | undefined): string | null {
  return via === "ios" ? "iPhone app" : via === "android" ? "Android app" : via === "web" ? "Web" : null;
}

/** ios / android for the store apps, web for everything else. */
export function viaFromUserAgent(ua: string | null | undefined): SeenVia {
  if (!ua || !/StreamflaireHubShell/i.test(ua)) return "web";
  return /Android/i.test(ua) ? "android" : "ios";
}

const lastTouch = new Map<string, number>();
/** The 5-minute slot each user last got a PresenceSample for (per process). */
const lastSlot = new Map<string, number>();
let lastPrune = 0;

/** History slot size for the console online graph (lib/presence-history.ts). */
const SAMPLE_SLOT_MS = 5 * 60 * 1000;
const SAMPLE_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * One PresenceSample row per person per 5-minute slot they were in the app:
 * the history behind the console's "People online" graph. Insert-or-ignore,
 * so two processes (or a restart) never double count. Prunes rows past 90
 * days at most once an hour from here, since the cron service is not to be
 * relied on.
 */
function recordSample(userId: string, companyId: string, now: number): void {
  const slot = Math.floor(now / SAMPLE_SLOT_MS) * SAMPLE_SLOT_MS;
  if (lastSlot.get(userId) === slot) return;
  lastSlot.set(userId, slot);
  if (lastSlot.size > 5000) {
    for (const [id, at] of lastSlot) if (at < slot) lastSlot.delete(id);
  }
  prisma.presenceSample
    .createMany({ data: [{ userId, companyId, at: new Date(slot) }], skipDuplicates: true })
    .catch(() => {
      lastSlot.delete(userId);
    });
  if (now - lastPrune > 60 * 60 * 1000) {
    lastPrune = now;
    prisma.presenceSample.deleteMany({ where: { at: { lt: new Date(now - SAMPLE_KEEP_MS) } } }).catch(() => {});
  }
}

/**
 * Stamp lastSeenAt / lastSeenVia for this user, throttled to one write a
 * minute. Never awaited by callers; a failed write just retries on the next
 * request. The throttle map is per process — Railway runs one container, and
 * a second one would merely double the (tiny) write rate.
 */
export function touchPresence(userId: string, companyId: string, ua: string | null | undefined): void {
  const now = Date.now();
  recordSample(userId, companyId, now);
  if (now - (lastTouch.get(userId) ?? 0) < TOUCH_INTERVAL_MS) return;
  lastTouch.set(userId, now);
  if (lastTouch.size > 5000) {
    for (const [id, at] of lastTouch) if (now - at > 10 * TOUCH_INTERVAL_MS) lastTouch.delete(id);
  }
  prisma.user
    .update({
      where: { id: userId },
      data: { lastSeenAt: new Date(now), lastSeenVia: viaFromUserAgent(ua) },
      select: { id: true },
    })
    .catch(() => {
      lastTouch.delete(userId);
    });
}

/**
 * The three-state dot David asked for (2026-09-30): green = in the app now,
 * hollow = active today (in the account's own timezone), grey = older or
 * never. `today` is judged in the company's timezone so a shop in Denver
 * that opened the app at 7 am is "today" even when the server's UTC day
 * has rolled over.
 */
export type PresenceState = "online" | "today" | "away" | "never";

function dayIn(tz: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/**
 * `elsewhere` = this person has since been using another company on the same
 * login (see loadElsewhere): never the green dot here, even inside the window.
 */
export function presenceOf(
  lastSeenAt: Date | null | undefined,
  tz: string,
  now: Date = new Date(),
  elsewhere = false
): PresenceState {
  if (!lastSeenAt) return "never";
  if (!elsewhere && now.getTime() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS) return "online";
  if (dayIn(tz, lastSeenAt) === dayIn(tz, now)) return "today";
  return "away";
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 d ago", "Aug 3", "never". */
export function relativeSeen(at: Date | null | undefined, now: Date = new Date()): string {
  if (!at) return "never";
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} d ago`;
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d > 300 ? { year: "numeric" } : {}) });
}

/** The newest of a set of stamps (a company's presence is its most recent member). */
export function latest(dates: (Date | null | undefined)[]): Date | null {
  let out: Date | null = null;
  for (const d of dates) if (d && (!out || d > out)) out = d;
  return out;
}

const RANK: Record<PresenceState, number> = { online: 3, today: 2, away: 1, never: 0 };

/** A company's state is its most present member's. */
export function bestPresence(states: PresenceState[]): PresenceState {
  let out: PresenceState = "never";
  for (const st of states) if (RANK[st] > RANK[out]) out = st;
  return out;
}

/**
 * Of these memberships, the ones whose person is now on ANOTHER company:
 * same Account, and a sibling membership was stamped more recently. Maps the
 * membership id to the name of the company they are on now. Only rows inside
 * the online window can be affected, so this reads just the handful of
 * recently-seen siblings.
 */
export async function loadElsewhere(
  users: { id: string; accountId: string | null; lastSeenAt: Date | null }[],
  now: Date = new Date()
): Promise<Map<string, string>> {
  const since = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const recent = users.filter((u) => u.accountId && u.lastSeenAt && u.lastSeenAt >= since);
  const out = new Map<string, string>();
  if (recent.length === 0) return out;
  const siblings = await prisma.user.findMany({
    where: { accountId: { in: [...new Set(recent.map((u) => u.accountId!))] }, lastSeenAt: { gte: since } },
    select: { id: true, accountId: true, lastSeenAt: true, company: { select: { name: true } } },
  });
  const newest = new Map<string, { id: string; at: number; company: string }>();
  for (const s of siblings) {
    const at = s.lastSeenAt!.getTime();
    const cur = newest.get(s.accountId!);
    if (!cur || at > cur.at) newest.set(s.accountId!, { id: s.id, at, company: s.company?.name ?? "another company" });
  }
  for (const u of recent) {
    const top = newest.get(u.accountId!);
    if (top && top.id !== u.id) out.set(u.id, top.company);
  }
  return out;
}
