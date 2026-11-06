import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { emailEnabled, sendEmail, toolDocumentEmail, toolVerifyCodeEmail } from "@/lib/email";
import { limit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { signMessage } from "@/lib/secret-box";
import { docReady, docTotals, sanitizeToolDoc, splitName, type ToolDoc } from "@/lib/tool-doc";
import { parseLogoDataUrl } from "@/lib/tool-drafts";
import { normalizeEmail } from "@/lib/user-email";

/**
 * Emailing a document from the free generator (/tools/*), with no account.
 *
 * An open "send this to anyone" endpoint is a spam cannon aimed at our own
 * domain, so three things hold it in:
 *
 * - The sender proves their address first: a 6-digit code to their inbox
 *   (ToolSender), then a signed 30-day cookie names them on every call.
 * - Hard caps: SENDS_PER_DAY per sender, RECIPIENTS_PER_SEND per send, a
 *   per-recipient-address throttle across all senders, and the fixed
 *   template (the only free text is the document itself).
 * - A separate sending identity (TOOLS_EMAIL_FROM on its own subdomain)
 *   with reply-to the sender, and a one-click "report" on the hosted page
 *   that blocks the sender outright.
 *
 * Each send is a ToolSend: the document, the recipients, and the hosted
 * copy at /t/<token> the email links to (rendered from the stored JSON,
 * nothing on disk). The sender's tool page lists their sends with a
 * Viewed stamp — the small thing free generators lack, and the hook that
 * brings the next invoice back here. The whole feature is dark until
 * TOOLS_EMAIL_FROM and RESEND_API_KEY are set (toolEmailEnabled).
 */

export const SENDS_PER_DAY = 5;
export const RECIPIENTS_PER_SEND = 2;
export const SENT_TTL_DAYS = 60;
export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 86_400_000;
export const SENDER_COOKIE = "wb_tool_sender";
/** A recipient address hears from the free tools at most this often, whoever sends. */
export const PER_RECIPIENT_PER_DAY = 3;

const APP_URL = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");

/** The From for every free-tool email: its own subdomain, so abuse can never touch tenant mail. */
export function toolsFrom(): { address: string; display: string } | null {
  const raw = process.env.TOOLS_EMAIL_FROM?.trim();
  if (!raw) return null;
  const m = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  const address = (m ? m[2] : raw).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  return { address, display: (m?.[1] ?? "").trim() || "WorkBench" };
}

export function toolEmailEnabled(): boolean {
  return emailEnabled() && Boolean(toolsFrom());
}

// ── Session cookie: "<senderId>.<expiresMs>.<hmac>" ──────────────────────────

const SCOPE = "tool-sender";

export function mintSenderCookie(senderId: string, now = Date.now()): string {
  const exp = now + SESSION_TTL_MS;
  return `${senderId}.${exp}.${signMessage(`${senderId}.${exp}`, SCOPE)}`;
}

/** The sender id a cookie value names, or null when it is missing, forged or expired. */
export function readSenderCookie(value: string | null | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!/^[a-z0-9]{10,40}$/i.test(id) || !Number.isFinite(exp) || exp < now || !/^[0-9a-f]{64}$/.test(sig)) return null;
  let expected: string;
  try {
    expected = signMessage(`${id}.${expRaw}`, SCOPE);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function senderCookieHeader(value: string, maxAgeSec = Math.floor(SESSION_TTL_MS / 1000)): string {
  const secure = APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${SENDER_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

export function cookieValue(cookieHeader: string | null | undefined, name = SENDER_COOKIE): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

export type Sender = { id: string; email: string; blockedAt: Date | null; companyId: string | null; consoleLeadId: string | null };

/** The verified, unblocked sender a request's cookie names, or null. */
export async function senderFromCookie(cookieHeader: string | null | undefined): Promise<Sender | null> {
  const id = readSenderCookie(cookieValue(cookieHeader));
  if (!id) return null;
  const row = await prisma.toolSender.findUnique({
    where: { id },
    select: { id: true, email: true, verifiedAt: true, blockedAt: true, companyId: true, consoleLeadId: true },
  });
  if (!row || !row.verifiedAt) return null;
  void prisma.toolSender.update({ where: { id }, data: { lastSeenAt: new Date() }, select: { id: true } }).catch(() => undefined);
  return { id: row.id, email: row.email, blockedAt: row.blockedAt, companyId: row.companyId, consoleLeadId: row.consoleLeadId };
}

// ── Verification ──────────────────────────────────────────────────────────────

function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

export type StartResult = { ok: true } | { ok: false; status: number; error: string };

/** Mint a code for the address and email it. */
export async function startVerification(rawEmail: unknown, ip: string | null): Promise<StartResult> {
  if (!toolEmailEnabled()) return { ok: false, status: 503, error: "Emailing isn't switched on yet. Download the PDF instead." };
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, status: 400, error: "That email address doesn't look right." };
  if (!(await limit(`tools-code:${email}`, 3, 60 * 60_000)).ok) {
    return { ok: false, status: 429, error: "We already sent a few codes to that address. Check your inbox and spam, or try again in an hour." };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const existing = await prisma.toolSender.findUnique({ where: { email }, select: { id: true, blockedAt: true } });
  if (existing?.blockedAt) {
    // Say nothing different: a blocked sender learns nothing from this screen.
    return { ok: true };
  }
  const data = { codeHash: hashCode(email, code), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS), codeAttempts: 0, lastSeenAt: new Date() };
  await prisma.toolSender.upsert({
    where: { email },
    create: { email, ip: ip && ip !== "unknown" ? ip : null, ...data },
    update: data,
    select: { id: true },
  });
  const from = toolsFrom()!;
  // Local dev: the server console is the second inbox (same convention as the console sign-in code).
  if (process.env.NODE_ENV !== "production") console.log(`[tool-send] code for ${email}: ${code}`);
  const sent = await sendEmail({ to: email, from: `"${from.display}" <${from.address}>`, ...toolVerifyCodeEmail({ code }) });
  if (!sent) return { ok: false, status: 424, error: "The code email didn't go out. Try again in a minute." };
  return { ok: true };
}

export type CheckResult = { ok: true; senderId: string; email: string; cookie: string } | { ok: false; status: number; error: string };

/** Check a typed code; on success the sender is verified and gets a session cookie. */
export async function checkVerification(rawEmail: unknown, rawCode: unknown): Promise<CheckResult> {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  const bad = { ok: false as const, status: 400, error: "That code didn't match. Check the email and try again." };
  if (!email || code.length !== 6) return bad;
  const row = await prisma.toolSender.findUnique({
    where: { email },
    select: { id: true, codeHash: true, codeExpiresAt: true, codeAttempts: true, blockedAt: true },
  });
  if (!row || !row.codeHash || !row.codeExpiresAt || row.blockedAt) return bad;
  if (row.codeExpiresAt < new Date()) return { ok: false, status: 400, error: "That code has expired. Send a new one." };
  if (row.codeAttempts >= CODE_MAX_ATTEMPTS) return { ok: false, status: 429, error: "Too many tries. Send a new code." };
  const a = Buffer.from(hashCode(email, code));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await prisma.toolSender.update({ where: { id: row.id }, data: { codeAttempts: { increment: 1 } }, select: { id: true } });
    return bad;
  }
  await prisma.toolSender.update({
    where: { id: row.id },
    data: { verifiedAt: new Date(), codeHash: null, codeExpiresAt: null, codeAttempts: 0, lastSeenAt: new Date() },
    select: { id: true },
  });
  return { ok: true, senderId: row.id, email, cookie: mintSenderCookie(row.id) };
}

// ── Sending ───────────────────────────────────────────────────────────────────

/** Distinct, valid, capped recipient list from whatever the browser sent. */
export function parseRecipients(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  const out: string[] = [];
  for (const v of raw) {
    const e = normalizeEmail(v);
    if (e && !out.includes(e)) out.push(e);
    if (out.length >= RECIPIENTS_PER_SEND) break;
  }
  return out;
}

export type SendInput = { sender: Sender; doc: unknown; logo?: unknown; to: unknown; copyMe?: boolean; ip?: string | null };
export type SendResult = { ok: true; token: string; href: string; recipients: string[] } | { ok: false; status: number; error: string };

export async function sendToolDocument(input: SendInput): Promise<SendResult> {
  if (!toolEmailEnabled()) return { ok: false, status: 503, error: "Emailing isn't switched on yet. Download the PDF instead." };
  const { sender } = input;
  if (sender.blockedAt) return { ok: false, status: 403, error: "Sending from this address is paused. Download the PDF instead." };
  const doc = sanitizeToolDoc(input.doc);
  if (!doc) return { ok: false, status: 400, error: "Bad request" };
  const ready = docReady(doc);
  if (!ready.ok) return { ok: false, status: 400, error: ready.reason };
  const recipients = parseRecipients(input.to);
  if (recipients.length === 0) return { ok: false, status: 400, error: "Add the client's email address." };

  const since = new Date(Date.now() - 86_400_000);
  const today = await prisma.toolSend.count({ where: { senderId: sender.id, sentAt: { gte: since } } });
  if (today >= SENDS_PER_DAY) {
    return { ok: false, status: 429, error: `The free tool sends up to ${SENDS_PER_DAY} a day. A free WorkBench account has no limit.` };
  }
  for (const r of recipients) {
    if (!(await limit(`tools-rcpt:${r}`, PER_RECIPIENT_PER_DAY, 86_400_000)).ok) {
      return { ok: false, status: 429, error: `${r} has had a few of these today already. Try again tomorrow, or download the PDF.` };
    }
  }

  const logo = parseLogoDataUrl(input.logo);
  const token = randomBytes(18).toString("hex");
  const row = await prisma.toolSend.create({
    data: {
      token,
      senderId: sender.id,
      kind: doc.kind === "estimate" ? "QUOTE" : "INVOICE",
      data: doc as object,
      logoData: logo?.data ?? null,
      logoMime: logo?.mime ?? null,
      recipients,
      expiresAt: new Date(Date.now() + SENT_TTL_DAYS * 86_400_000),
    },
    select: { id: true },
  });

  const from = toolsFrom()!;
  const business = doc.business.name.trim().replace(/[\r\n"<>]/g, "").slice(0, 60) || "A business";
  const viewUrl = `${APP_URL}/t/${token}`;
  const totals = docTotals(doc);
  const mail = toolDocumentEmail({
    kind: doc.kind,
    number: doc.number,
    businessName: doc.business.name.trim(),
    businessPhone: doc.business.phone || null,
    clientFirstName: splitName(doc.client.name).firstName || null,
    serviceNames: doc.lines.map((l) => l.name || l.description).filter(Boolean).slice(0, 8),
    total: totals.total,
    dueAt: doc.dueAt || null,
    accent: doc.accent,
    logoUrl: logo ? `${viewUrl}/logo` : null,
    viewUrl,
    senderEmail: sender.email,
  });
  let delivered = 0;
  for (const to of recipients) {
    const ok = await sendEmail({
      to,
      from: `"${business} via ${from.display}" <${from.address}>`,
      replyTo: sender.email,
      cc: input.copyMe && delivered === 0 ? [sender.email] : undefined,
      ...mail,
    });
    if (ok) delivered++;
  }
  if (delivered === 0) {
    await prisma.toolSend.delete({ where: { id: row.id } }).catch(() => undefined);
    return { ok: false, status: 424, error: "The email didn't go out. Try again in a minute, or download the PDF." };
  }
  void boardSender(sender, doc).catch((e) => reportError("[tool-send] lead card failed", e));
  return { ok: true, token, href: `/t/${token}`, recipients };
}

/** After the first send, the sender becomes a card on /superadmin/leads (source "free_tool"). Best effort, once. */
async function boardSender(sender: Sender, doc: ToolDoc): Promise<void> {
  if (sender.consoleLeadId || sender.companyId) return;
  const { ensureConsoleStages } = await import("@/lib/console-leads");
  const stages = await ensureConsoleStages();
  const first = stages.find((s) => !s.isWon);
  if (!first) return;
  const businessName = doc.business.name.trim() || null;
  const lead = await prisma.consoleLead.create({
    data: {
      name: businessName || sender.email,
      email: sender.email,
      phone: doc.business.phone || null,
      businessName,
      notes: `Emailed ${doc.kind === "estimate" ? "an estimate" : "an invoice"} from the free generator (workbenchfsm.com/tools).`,
      source: "free_tool",
      stageId: first.id,
    },
    select: { id: true },
  });
  await prisma.toolSender.updateMany({ where: { id: sender.id, consoleLeadId: null }, data: { consoleLeadId: lead.id } });
}

// ── The sender's own view ─────────────────────────────────────────────────────

export type SentSummary = {
  token: string;
  kind: ToolDoc["kind"];
  number: number;
  clientName: string;
  recipients: string[];
  total: number;
  sentAt: string;
  viewedAt: string | null;
  viewCount: number;
};

export async function listSends(senderId: string, take = 20): Promise<SentSummary[]> {
  const rows = await prisma.toolSend.findMany({
    where: { senderId, expiresAt: { gt: new Date() } },
    orderBy: { sentAt: "desc" },
    take,
    select: { token: true, data: true, recipients: true, sentAt: true, viewedAt: true, viewCount: true },
  });
  const out: SentSummary[] = [];
  for (const r of rows) {
    const doc = sanitizeToolDoc(r.data);
    if (!doc) continue;
    out.push({
      token: r.token,
      kind: doc.kind,
      number: doc.number,
      clientName: doc.client.name,
      recipients: r.recipients,
      total: docTotals(doc).total,
      sentAt: r.sentAt.toISOString(),
      viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
      viewCount: r.viewCount,
    });
  }
  return out;
}

/** How many more sends the sender has today. */
export async function sendsLeftToday(senderId: string): Promise<number> {
  const today = await prisma.toolSend.count({ where: { senderId, sentAt: { gte: new Date(Date.now() - 86_400_000) } } });
  return Math.max(0, SENDS_PER_DAY - today);
}

// ── The hosted copy (/t/<token>) ──────────────────────────────────────────────

export type SentDocument = {
  id: string;
  token: string;
  doc: ToolDoc;
  senderId: string;
  senderEmail: string;
  hasLogo: boolean;
  sentAt: Date;
  reported: boolean;
};

export async function loadSentDocument(token: string | undefined | null): Promise<SentDocument | null> {
  if (!token || !/^[0-9a-f]{36}$/.test(token)) return null;
  const row = await prisma.toolSend.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      data: true,
      logoMime: true,
      sentAt: true,
      expiresAt: true,
      reportedAt: true,
      sender: { select: { id: true, email: true, blockedAt: true } },
    },
  });
  if (!row || row.expiresAt < new Date() || row.sender.blockedAt) return null;
  const doc = sanitizeToolDoc(row.data);
  if (!doc) return null;
  return {
    id: row.id,
    token: row.token,
    doc,
    senderId: row.sender.id,
    senderEmail: row.sender.email,
    hasLogo: Boolean(row.logoMime),
    sentAt: row.sentAt,
    reported: Boolean(row.reportedAt),
  };
}

export async function sentLogo(token: string | undefined | null): Promise<{ data: Buffer; mime: string } | null> {
  if (!token || !/^[0-9a-f]{36}$/.test(token)) return null;
  const row = await prisma.toolSend.findUnique({ where: { token }, select: { logoData: true, logoMime: true, expiresAt: true } });
  if (!row?.logoData || !row.logoMime || row.expiresAt < new Date()) return null;
  return { data: Buffer.from(row.logoData), mime: row.logoMime };
}

/** A recipient opened the hosted page. The sender's own browser never counts. */
export async function recordSentView(token: string | undefined | null, viewerSenderId: string | null): Promise<void> {
  if (!token || !/^[0-9a-f]{36}$/.test(token)) return;
  const row = await prisma.toolSend.findUnique({ where: { token }, select: { id: true, senderId: true, viewedAt: true } });
  if (!row || row.senderId === viewerSenderId) return;
  await prisma.toolSend.update({
    where: { id: row.id },
    data: { viewCount: { increment: 1 }, ...(row.viewedAt ? {} : { viewedAt: new Date() }) },
    select: { id: true },
  });
}

/** A recipient said "I didn't ask for this": the send is marked and the sender is blocked. */
export async function reportSentDocument(token: string | undefined | null): Promise<boolean> {
  if (!token || !/^[0-9a-f]{36}$/.test(token)) return false;
  const row = await prisma.toolSend.findUnique({ where: { token }, select: { id: true, senderId: true, reportedAt: true, sender: { select: { email: true } } } });
  if (!row) return false;
  if (row.reportedAt) return true;
  await prisma.$transaction([
    prisma.toolSend.update({ where: { id: row.id }, data: { reportedAt: new Date() }, select: { id: true } }),
    prisma.toolSender.update({ where: { id: row.senderId }, data: { blockedAt: new Date(), blockedReason: `Reported by a recipient (${token.slice(0, 8)}…)` }, select: { id: true } }),
  ]);
  try {
    const { alertOperator } = await import("@/lib/ops-alert");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await alertOperator(
      `tool-send-report:${row.senderId}`,
      "Free tool: a recipient reported an emailed document",
      `<p>A recipient reported a document emailed from the free generator, so the sender <strong>${esc(row.sender.email)}</strong> is blocked from sending.</p><p>Hosted copy: ${esc(APP_URL)}/t/${esc(token)}</p><p>Unblock by clearing <code>blockedAt</code> on the ToolSender row if it was a mistake.</p>`,
      60_000,
    );
  } catch (e) {
    reportError("[tool-send] report alert failed", e);
  }
  return true;
}

// ── Sign-up hand-off ──────────────────────────────────────────────────────────

/** The sender opened an account: remember the company and win the lead card. */
export async function linkSenderToCompany(senderId: string, companyId: string): Promise<void> {
  try {
    const sender = await prisma.toolSender.update({ where: { id: senderId }, data: { companyId }, select: { consoleLeadId: true } });
    if (sender.consoleLeadId) {
      const { ensureConsoleStages } = await import("@/lib/console-leads");
      const won = (await ensureConsoleStages()).find((s) => s.isWon);
      if (won) {
        await prisma.consoleLead.updateMany({
          where: { id: sender.consoleLeadId, status: { not: "WON" } },
          data: { status: "WON", stageId: won.id, stageChangedAt: new Date(), wonAt: new Date() },
        });
      }
    }
  } catch (e) {
    reportError("[tool-send] linking the sender to the new company failed", e);
  }
}

// ── Cron ──────────────────────────────────────────────────────────────────────

/** Expired sends go; so do addresses that never finished verifying (after a day). */
export async function runToolSendSweep(now = new Date()): Promise<number> {
  const sends = await prisma.toolSend.deleteMany({ where: { expiresAt: { lt: now } } });
  const senders = await prisma.toolSender.deleteMany({
    where: { verifiedAt: null, createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
  });
  return sends.count + senders.count;
}
