import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * Website chat plumbing shared by the public routes and the team thread:
 * which company receives the chat, the visitor's signed thread token, and
 * an in-memory presence map so the team can see whether the visitor is
 * still on the site (and hear about it when they leave without a number).
 */

// ── receiving company ────────────────────────────────────────────────────────

/**
 * SITE_CHAT_COMPANY_ID wins when set; otherwise the company whose business
 * line is the platform's own toll-free number (the one on the site), so
 * "the messages go to the business line" needs no config. Cached ten
 * minutes per server process — every marketing page asks.
 */
const TTL_MS = 10 * 60_000;
let cached: { id: string | null; at: number } | null = null;

export async function siteChatCompanyId(): Promise<string | null> {
  const env = process.env.SITE_CHAT_COMPANY_ID?.trim();
  if (env) return env;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.id;
  let id: string | null = null;
  try {
    const co = await prisma.company.findUnique({ where: { lineNumber: WB_PHONE.e164 }, select: { id: true } });
    id = co?.id ?? null;
  } catch (err) {
    console.error("[site-chat] company lookup failed:", err);
  }
  cached = { id, at: Date.now() };
  return id;
}

/** "+1XXXXXXXXXX" and the bare digits for a US number, or null. */
export function parseUsPhone(raw: string): { phone: string; digits: string } | null {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? { phone: `+1${digits}`, digits } : null;
}

// ── visitor token ────────────────────────────────────────────────────────────

/** The HMAC key for visitor thread tokens: the auth secret unless overridden. */
export function siteChatSecret(): string {
  return process.env.SITE_CHAT_SECRET ?? process.env.AUTH_SECRET ?? "";
}

export function signSiteChatToken(contactId: string): string {
  return `${contactId}.${createHmac("sha256", siteChatSecret()).update(contactId).digest("base64url")}`;
}

/** The contact id inside a valid token, or null. */
export function verifySiteChatToken(token: string | null | undefined): string | null {
  if (!token || !siteChatSecret()) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const expected = signSiteChatToken(id);
  if (expected.length !== token.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? id : null;
}

// ── presence ─────────────────────────────────────────────────────────────────

/**
 * Visitor presence, in memory (same single-process assumption as team chat
 * typing). The widget's poll is the heartbeat; a pagehide beacon marks an
 * explicit leave. Anything older than PRESENCE_TTL_MS reads as gone.
 */
const PRESENCE_TTL_MS = 12_000;
const OFFLINE_NOTICE_COOLDOWN_MS = 15 * 60_000;

type Presence = { seenAt: number; noticeAt: number };
const globalForPresence = globalThis as unknown as { __siteChatPresence?: Map<string, Presence> };
const presence = (globalForPresence.__siteChatPresence ??= new Map());

export function markVisitorSeen(contactId: string): void {
  const p = presence.get(contactId);
  presence.set(contactId, { seenAt: Date.now(), noticeAt: p?.noticeAt ?? 0 });
  if (presence.size > 5000) {
    const cutoff = Date.now() - 60 * 60_000;
    for (const [id, v] of presence) if (v.seenAt < cutoff) presence.delete(id);
  }
}

export function visitorOnline(contactId: string): boolean {
  const p = presence.get(contactId);
  return Boolean(p && Date.now() - p.seenAt < PRESENCE_TTL_MS);
}

/**
 * The visitor closed the tab. If they never left a number and the team has
 * nothing else to reach them by, push a heads-up — once per quarter hour,
 * and only for a thread that actually has a chat message in it.
 */
export async function markVisitorLeft(contactId: string): Promise<void> {
  const p = presence.get(contactId);
  const now = Date.now();
  presence.set(contactId, { seenAt: 0, noticeAt: p?.noticeAt ?? 0 });
  if (p && now - p.noticeAt < OFFLINE_NOTICE_COOLDOWN_MS) return;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, companyId: true, firstName: true, lastName: true, phone: true, email: true, assignedToId: true },
  });
  if (!contact || contact.phone || contact.email) return;
  const chatted = await prisma.portalMessage.findFirst({
    where: { contactId, direction: "INBOUND", via: "web" },
    select: { id: true },
  });
  if (!chatted) return;

  presence.set(contactId, { seenAt: 0, noticeAt: now });
  const name = `${contact.firstName} ${contact.lastName}`.trim() || "A visitor";
  await notifyUsers(await requestNotifyUserIds(contact.companyId, contact.assignedToId), {
    title: `${name} left the website chat`,
    body: "They closed the page without leaving a number, so a reply will only reach them if they come back.",
    url: `/app/messages/thread/${contact.id}`,
    tag: `portal-thread-${contact.id}`,
  });
}
