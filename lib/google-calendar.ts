/**
 * Google Calendar push (tier 2 of calendar sync — design in
 * docs/plans/google-calendar-sync-2026-09-11.md).
 *
 * One connection per USER (not per company): a tech connects their own
 * Google account and Workbench writes their schedule — the same events the
 * .ics feed renders (lib/calendar-events.ts) — into that account's primary
 * calendar. The other direction — Google busy time mirrored into Workbench
 * as read-only time blocks — lives in lib/google-calendar-pull.ts.
 *
 * Sync is a RECONCILE, not write-through: `syncUserGoogleCalendar` diffs the
 * user's current events against the GoogleCalendarEvent link rows
 * (fingerprint per event) and inserts / patches / deletes only what changed.
 * It runs (a) seconds after any schedule write, debounced per company via the
 * Prisma middleware in lib/db.ts, (b) hourly from the cron, (c) from the
 * "Sync now" button. Every path is idempotent.
 *
 * OAuth mirrors lib/quickbooks.ts: signed state, AES-256-GCM tokens keyed off
 * AUTH_SECRET, refresh on expiry. Env (feature invisible until both set):
 *   GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET
 * Redirect URI: `${NEXTAUTH_URL}/api/app/integrations/google-calendar/callback`.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { GoogleCalendarConnection, CalendarEventKind as DbKind } from "@prisma/client";
import {
  allDayRange,
  calendarEventFingerprint,
  loadCalendarEventsByIds,
  loadUserCalendarEvents,
  resolveUserCalendarScope,
  type CalendarEvent,
  type UserCalendarScope,
} from "@/lib/calendar-events";

// ─── Config ──────────────────────────────────────────────────────────────────

const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];
/** Marker on every event we create, so a reconnect can adopt instead of duplicate. */
const PRIVATE_MARK_KEY = "workbench";

const DAY = 86_400_000;
const PUSH_PAST_DAYS = 30;
const PUSH_FUTURE_DAYS = 180;
/** Parallel Google calls per sync — well under the per-user quota. */
const CONCURRENCY = 4;
/** Debounce after a schedule write before the reconcile runs. */
const DEBOUNCE_MS = 4_000;

export function isGoogleCalendarConfigured(): boolean {
  return !!(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/app/integrations/google-calendar/callback`;
}

// ─── Token encryption (AES-256-GCM, key derived from AUTH_SECRET) ────────────

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to store Google Calendar tokens");
  return createHash("sha256").update(`gcal-token:${secret}`).digest();
}

function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

function decryptToken(stored: string): string {
  const [version, iv, tag, ct] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized token format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

// ─── OAuth: authorize URL + signed state ─────────────────────────────────────

// state = userId.expiresAtMs.hmac — 10-minute lifetime. The callback ALSO
// requires the signed-in user to be that user; the HMAC just stops a forged
// callback from binding a stranger's Google grant to someone's account.
function stateSignature(userId: string, expiresAt: number): string {
  return createHmac("sha256", encryptionKey()).update(`${userId}.${expiresAt}`).digest("hex");
}

export function buildAuthorizeUrl(userId: string): string {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const state = `${userId}.${expiresAt}.${stateSignature(userId, expiresAt)}`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    response_type: "code",
    scope: SCOPES.join(" "),
    redirect_uri: redirectUri(),
    state,
    // offline + consent = a refresh token every time, not just the first
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export function verifyState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!userId || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return sig === stateSignature(userId, expiresAt) ? userId : null;
}

// ─── OAuth: token exchange / refresh / revoke ────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public readonly reconnect: boolean
  ) {
    super(message);
  }
}

async function requestTokens(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...body,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    // invalid_grant = revoked at Google / password change / 6-month idle
    const reconnect = json.error === "invalid_grant";
    throw new GoogleAuthError(json.error_description ?? json.error ?? `Google token request failed (${res.status})`, reconnect);
  }
  return json;
}

export async function connectUser(opts: { userId: string; companyId: string; code: string }): Promise<GoogleCalendarConnection> {
  const tokens = await requestTokens({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: redirectUri(),
  });
  if (!tokens.refresh_token) {
    throw new Error("Google didn't return a refresh token — try connecting again.");
  }
  const who = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const info = (await who.json().catch(() => ({}))) as { email?: string };
  const googleEmail = info.email ?? "Google account";

  const now = Date.now();
  const data = {
    companyId: opts.companyId,
    googleEmail,
    accessTokenEnc: encryptToken(tokens.access_token),
    refreshTokenEnc: encryptToken(tokens.refresh_token),
    accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
    scope: tokens.scope ?? SCOPES.join(" "),
    syncEnabled: true,
    lastSyncError: null,
    // A (re)connect may be a different Google account — start the mirror over
    pullSyncToken: null,
    lastPullError: null,
  };
  const connection = await prisma.googleCalendarConnection.upsert({
    where: { userId: opts.userId },
    create: { userId: opts.userId, ...data },
    update: data,
  });
  invalidateConnectionsCache();
  return connection;
}

export async function accessTokenFor(connection: GoogleCalendarConnection): Promise<{ token: string; connection: GoogleCalendarConnection }> {
  if (connection.accessTokenExpiresAt.getTime() - Date.now() > 60_000) {
    return { token: decryptToken(connection.accessTokenEnc), connection };
  }
  const tokens = await requestTokens({
    grant_type: "refresh_token",
    refresh_token: decryptToken(connection.refreshTokenEnc),
  });
  const updated = await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptToken(tokens.access_token),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptToken(tokens.refresh_token) } : {}),
    },
  });
  return { token: tokens.access_token, connection: updated };
}

async function revoke(connection: GoogleCalendarConnection): Promise<void> {
  try {
    await fetch(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(decryptToken(connection.refreshTokenEnc))}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best effort — the user can also revoke from their Google account page
  }
}

// ─── Google Calendar API ─────────────────────────────────────────────────────

type GoogleEventBody = {
  summary: string;
  description: string;
  location?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  status: "confirmed" | "tentative";
  transparency?: "opaque" | "transparent";
  reminders: { useDefault: boolean };
  extendedProperties: { private: Record<string, string> };
  source: { title: string; url: string };
};

/** What one of our events looks like on the wire. Pure (unit-tested). */
export function toGoogleEvent(ev: CalendarEvent): GoogleEventBody {
  const when = ev.allDay
    ? (() => {
        const r = allDayRange(ev);
        return { start: { date: r.start }, end: { date: r.end } };
      })()
    : {
        start: { dateTime: ev.start.toISOString(), timeZone: ev.tz },
        end: { dateTime: ev.end.toISOString(), timeZone: ev.tz },
      };
  return {
    summary: ev.title,
    description: ev.description,
    ...(ev.location ? { location: ev.location } : {}),
    ...when,
    status: ev.status === "TENTATIVE" ? "tentative" : "confirmed",
    ...(ev.status === "TENTATIVE" ? { transparency: "transparent" as const } : {}),
    // Workbench already reminds the crew (tech heads-up push); Google
    // shouldn't pile a second alert on top.
    reminders: { useDefault: false },
    extendedProperties: { private: { [PRIVATE_MARK_KEY]: ev.uid, wb: "1" } },
    source: { title: "Open in Workbench", url: ev.url },
  };
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function googleFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    let message = `Google Calendar ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      // keep the status message
    }
    throw new GoogleApiError(message, res.status);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const calPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;

// ─── Reconcile ───────────────────────────────────────────────────────────────

export type SyncSummary = { created: number; updated: number; deleted: number; adopted: number; errors: number };

// One sync per user at a time in this process; a second request while one
// runs just re-queues itself after (a write may have landed mid-sync).
const inflight = new Map<string, Promise<SyncSummary>>();
const rerun = new Set<string>();

export async function syncUserGoogleCalendar(userId: string): Promise<SyncSummary> {
  const running = inflight.get(userId);
  if (running) {
    rerun.add(userId);
    return running;
  }
  const p = runSync(userId).finally(() => {
    inflight.delete(userId);
    if (rerun.delete(userId)) {
      syncUserGoogleCalendar(userId).catch(() => {});
    }
  });
  inflight.set(userId, p);
  return p;
}

export async function mapLimit<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function runSync(userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = { created: 0, updated: 0, deleted: 0, adopted: 0, errors: 0 };
  if (!isGoogleCalendarConfigured()) return summary;
  let connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection || !connection.syncEnabled) return summary;

  const scope = await resolveUserCalendarScope(userId);
  if (!scope) {
    // Deactivated user / suspended company: leave Google alone, stop syncing
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { syncEnabled: false, lastSyncError: "Account inactive — sync paused." },
    });
    return summary;
  }

  let token: string;
  try {
    ({ token, connection } = await accessTokenFor(connection));
  } catch (err) {
    await recordError(connection.id, err);
    summary.errors++;
    return summary;
  }
  const calendarId = connection.calendarId;
  const connectionId = connection.id;
  const now = new Date();

  try {
    const events = await loadUserCalendarEvents(scope, {
      from: new Date(now.getTime() - PUSH_PAST_DAYS * DAY),
      to: new Date(now.getTime() + PUSH_FUTURE_DAYS * DAY),
    });
    const links = await prisma.googleCalendarEvent.findMany({ where: { connectionId } });
    const linkByKey = new Map(links.map((l) => [`${l.kind}:${l.localId}`, l]));

    // First sync after a (re)connect: adopt anything we pushed before, so a
    // disconnect → reconnect doesn't double every event.
    const adoptable = links.length === 0 ? await listMarkedEvents(token, calendarId) : new Map<string, string>();

    // 1. Inserts + updates
    const errors: unknown[] = [];
    await mapLimit(events, CONCURRENCY, async (ev) => {
      const key = `${ev.kind}:${ev.id}`;
      const fingerprint = calendarEventFingerprint(ev);
      const link = linkByKey.get(key);
      try {
        if (!link) {
          const adoptedId = adoptable.get(ev.uid);
          let googleEventId: string;
          if (adoptedId) {
            await googleFetch(token, `${calPath(calendarId)}/${encodeURIComponent(adoptedId)}`, {
              method: "PATCH",
              body: JSON.stringify(toGoogleEvent(ev)),
            });
            googleEventId = adoptedId;
            summary.adopted++;
          } else {
            const created = await googleFetch<{ id: string }>(token, calPath(calendarId), {
              method: "POST",
              body: JSON.stringify(toGoogleEvent(ev)),
            });
            googleEventId = created.id;
            summary.created++;
          }
          await prisma.googleCalendarEvent.upsert({
            where: { connectionId_kind_localId: { connectionId, kind: ev.kind as DbKind, localId: ev.id } },
            create: { connectionId, kind: ev.kind as DbKind, localId: ev.id, googleEventId, fingerprint },
            update: { googleEventId, fingerprint },
          });
        } else if (link.fingerprint !== fingerprint) {
          try {
            await googleFetch(token, `${calPath(calendarId)}/${encodeURIComponent(link.googleEventId)}`, {
              method: "PATCH",
              body: JSON.stringify(toGoogleEvent(ev)),
            });
          } catch (err) {
            // The user deleted our copy in Google — put it back
            if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) {
              const created = await googleFetch<{ id: string }>(token, calPath(calendarId), {
                method: "POST",
                body: JSON.stringify(toGoogleEvent(ev)),
              });
              await prisma.googleCalendarEvent.update({
                where: { id: link.id },
                data: { googleEventId: created.id, fingerprint },
              });
              summary.created++;
              return;
            }
            throw err;
          }
          await prisma.googleCalendarEvent.update({ where: { id: link.id }, data: { fingerprint } });
          summary.updated++;
        }
      } catch (err) {
        errors.push(err);
      }
    });

    // 2. Deletes: links whose event isn't in the window any more. Re-resolve
    //    them — gone/cancelled/unassigned → delete in Google; merely outside
    //    the window → keep.
    const present = new Set(events.map((ev) => `${ev.kind}:${ev.id}`));
    const stale = links.filter((l) => !present.has(`${l.kind}:${l.localId}`));
    if (stale.length > 0) {
      const ids = { JOB: [] as string[], APPOINTMENT: [] as string[], BLOCK: [] as string[] };
      for (const l of stale) ids[l.kind].push(l.localId);
      const stillValid = new Set((await loadCalendarEventsByIds(scope, ids)).map((ev) => `${ev.kind}:${ev.id}`));
      const toDelete = stale.filter((l) => !stillValid.has(`${l.kind}:${l.localId}`));
      await mapLimit(toDelete, CONCURRENCY, async (link) => {
        try {
          try {
            await googleFetch(token, `${calPath(calendarId)}/${encodeURIComponent(link.googleEventId)}`, {
              method: "DELETE",
            });
          } catch (err) {
            if (!(err instanceof GoogleApiError && (err.status === 404 || err.status === 410))) throw err;
          }
          await prisma.googleCalendarEvent.delete({ where: { id: link.id } }).catch(() => {});
          summary.deleted++;
        } catch (err) {
          errors.push(err);
        }
      });
    }

    summary.errors = errors.length;
    if (errors.length > 0) {
      const first = errors[0];
      // An auth failure mid-run means the grant is gone — say so plainly
      if (first instanceof GoogleApiError && first.status === 401) {
        await recordError(connectionId, new GoogleAuthError("Google signed us out — reconnect to keep syncing.", true));
      } else {
        await prisma.googleCalendarConnection.update({
          where: { id: connectionId },
          data: {
            lastSyncAt: now,
            lastSyncError: `${errors.length} of ${events.length} events didn't sync: ${
              first instanceof Error ? first.message : "unknown error"
            }`,
          },
        });
      }
    } else {
      await prisma.googleCalendarConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: now, lastSyncError: null },
      });
    }
  } catch (err) {
    await recordError(connectionId, err);
    summary.errors++;
  }
  return summary;
}

/** uid → Google event id for every event we ever pushed to this calendar. */
async function listMarkedEvents(token: string, calendarId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: "wb=1",
      maxResults: "250",
      showDeleted: "false",
      singleEvents: "true",
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await googleFetch<{
      items?: { id: string; extendedProperties?: { private?: Record<string, string> } }[];
      nextPageToken?: string;
    }>(token, `${calPath(calendarId)}?${params.toString()}`);
    for (const item of page.items ?? []) {
      const uid = item.extendedProperties?.private?.[PRIVATE_MARK_KEY];
      if (uid) out.set(uid, item.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

export async function recordError(connectionId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : "Sync failed";
  const reconnect = err instanceof GoogleAuthError && err.reconnect;
  console.error("[google-calendar] sync failed", connectionId, message);
  await prisma.googleCalendarConnection
    .update({
      where: { id: connectionId },
      data: {
        lastSyncError: reconnect ? "Google access was revoked — reconnect to keep syncing." : message,
        ...(reconnect ? { syncEnabled: false } : {}),
      },
    })
    .catch(() => {});
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

/**
 * Remove what we pushed (best effort), revoke the grant, forget the
 * connection. Link rows cascade with it.
 */
export async function disconnectUser(userId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) return;
  // Stop any in-flight/queued sync from re-creating events mid-teardown
  await prisma.googleCalendarConnection.update({ where: { id: connection.id }, data: { syncEnabled: false } });
  try {
    const { token, connection: fresh } = await accessTokenFor(connection);
    const links = await prisma.googleCalendarEvent.findMany({ where: { connectionId: connection.id } });
    await mapLimit(links, CONCURRENCY, async (link) => {
      try {
        await googleFetch(token, `${calPath(fresh.calendarId)}/${encodeURIComponent(link.googleEventId)}`, {
          method: "DELETE",
        });
      } catch {
        // already gone, or Google is having a moment — the grant is revoked next anyway
      }
    });
    await revoke(fresh);
  } catch (err) {
    console.error("[google-calendar] disconnect cleanup failed", err);
  }
  // The mirrored Google busy blocks go with the connection
  await prisma.timeBlock.deleteMany({ where: { userId, source: "GOOGLE" } });
  await prisma.googleCalendarConnection.deleteMany({ where: { id: connection.id } });
  invalidateConnectionsCache();
}

// ─── Triggers ────────────────────────────────────────────────────────────────

/** Hourly cron: every enabled connection, one after another. */
export async function runGoogleCalendarSweep(): Promise<{ users: number; created: number; updated: number; deleted: number; errors: number }> {
  const totals = { users: 0, created: 0, updated: 0, deleted: 0, errors: 0 };
  if (!isGoogleCalendarConfigured()) return totals;
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { syncEnabled: true },
    select: { userId: true },
    take: 500,
  });
  for (const c of connections) {
    totals.users++;
    const s = await syncUserGoogleCalendar(c.userId);
    totals.created += s.created;
    totals.updated += s.updated;
    totals.deleted += s.deleted;
    totals.errors += s.errors;
  }
  return totals;
}

// "Does anyone have a connection?" — cached so the write middleware costs
// nothing for the (currently) typical company with no Google users.
let connectionsCache: { companyIds: Set<string>; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateConnectionsCache() {
  connectionsCache = null;
}

async function connectedCompanyIds(): Promise<Set<string>> {
  if (connectionsCache && Date.now() - connectionsCache.at < CACHE_TTL_MS) return connectionsCache.companyIds;
  const rows = await prisma.googleCalendarConnection.findMany({
    where: { syncEnabled: true },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  connectionsCache = { companyIds: new Set(rows.map((r) => r.companyId)), at: Date.now() };
  return connectionsCache.companyIds;
}

const pendingByCompany = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Called by the write middleware in lib/db.ts after any Job / JobAssignment /
 * Appointment / TimeBlock write. `companyId` null = couldn't tell which
 * company (e.g. a bare JobAssignment write) → every connected company.
 * Debounced so a drag that touches five rows syncs once.
 */
export async function scheduleGoogleCalendarSync(companyId: string | null): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;
  const connected = await connectedCompanyIds();
  if (connected.size === 0) return;
  const targets = companyId ? (connected.has(companyId) ? [companyId] : []) : [...connected];
  for (const id of targets) {
    const existing = pendingByCompany.get(id);
    if (existing) clearTimeout(existing);
    pendingByCompany.set(
      id,
      setTimeout(() => {
        pendingByCompany.delete(id);
        syncCompany(id).catch((err) => console.error("[google-calendar] debounced sync failed", err));
      }, DEBOUNCE_MS)
    );
  }
}

async function syncCompany(companyId: string): Promise<void> {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { companyId, syncEnabled: true },
    select: { userId: true },
  });
  for (const c of connections) {
    await syncUserGoogleCalendar(c.userId);
  }
}
